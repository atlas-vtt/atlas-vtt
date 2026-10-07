import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import type { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { MeasureRenderer } from '../../src/app/pixi/MeasureRenderer';
import type { TokenPerception } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { AtlasSettings } from '../../src/app/services/SettingsService';
import type { ViewAtlasState } from '../../src/app/storeFactory';

interface Parts {
  measure: MeasureRenderer;
  tokens: TokenRenderer;
  fog: FogOfWarRenderer;
}

/** Wires measurements to the tokens as the renderer orchestrator does. Returns the function that ends it. */
export function wirePlayerMeasurements(deps: {
  measure: MeasureRenderer;
  tokens: TokenRenderer;
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  grid: Pick<GridSystem, 'getOptions'>;
  lighting: () => TokenPerception | undefined;
}): () => void {
  deps.measure.playersView = measurePlayersView({ store: deps.store, grid: deps.grid, tokens: () => deps.tokens, lighting: deps.lighting });
  return deps.tokens.onPlayersViewChange(() => deps.measure.refreshVisibility());
}

/** A players' frame as `withPlayerSafeFrame` composes it: one sight for tokens and measurements. */
export function playerFrameLayers({ measure, tokens, fog, settings, lighting }: Parts & { settings: AtlasSettings['localPlayerView']; lighting: TokenPerception | undefined }): LayerVisibility[] {
  return [...tokens.getPlayerViewLayers(settings, lighting), ...fog.getPlayerViewLayers(), ...measure.getPlayerViewLayers(tokens.playersSeeInFrame(lighting))];
}

/** A picture of the scene as `gmViewLayers` forces it. */
export function gmPictureLayers({ measure, tokens, fog }: Parts): LayerVisibility[] {
  return [...tokens.getGmViewLayers(), ...fog.getGmViewLayers(), ...measure.getGmViewLayers()];
}
