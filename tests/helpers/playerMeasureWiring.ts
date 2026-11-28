import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import type { CanvasAudience } from '../../src/app/pixi/audience/CanvasAudience';
import type { MapPointer } from '../../src/app/pixi/pointer/MapPointer';
import type { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { MeasureRenderer } from '../../src/app/pixi/measure/MeasureRenderer';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { AtlasSettings } from '../../src/app/services/SettingsService';
import type { ViewAtlasState } from '../../src/app/storeFactory';

interface Parts {
  measure: MeasureRenderer;
  tokens: TokenRenderer;
  fog: FogOfWarRenderer;
}

/** Wires measurements to the tokens and the view's audience as the renderer orchestrator does. Returns the function that ends it. */
export function wirePlayerMeasurements(deps: {
  measure: MeasureRenderer;
  tokens: TokenRenderer;
  audience: CanvasAudience;
  pointer: MapPointer;
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  grid: Pick<GridSystem, 'getOptions'>;
  lighting: () => TokenPerception | undefined;
}): () => void {
  deps.measure.playersView = measurePlayersView({ store: deps.store, grid: deps.grid, tokens: () => deps.tokens, lighting: deps.lighting, audience: deps.audience });
  deps.pointer.attach('measureHandles', deps.measure.pointer);
  return () => {
    deps.measure.playersView = null;
  };
}

/** A players' frame's layers as its capture sets them: one sight for tokens and measurements. */
export function playerFrameLayers({ measure, tokens, fog, settings, lighting }: Parts & { settings: AtlasSettings['localPlayerView']; lighting: TokenPerception | undefined }): LayerVisibility[] {
  return [...tokens.getPlayerViewLayers(settings, lighting), ...fog.getPlayerViewLayers(), ...measure.getPlayerViewLayers(tokens.playersSeeInFrame(lighting))];
}
