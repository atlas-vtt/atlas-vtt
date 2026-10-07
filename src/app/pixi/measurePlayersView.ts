import type { StoreApi } from 'zustand';
import type { GridSystem } from '../grid/GridSystem';
import type { ViewAtlasState } from '../storeFactory';
import { tokenFootprints } from '../vision/measureOrigin';
import type { TokenPerception } from './lighting/playerLightingLayers';
import type { MeasurePlayersView } from './measurePartsVisibility';
import type { TokenRenderer } from './TokenRenderer';
import { NOTHING_SEEN } from './token-renderer/PlayerSightTokens';

/** What a measurement asks of the tokens. */
type MeasuredTokens = Pick<TokenRenderer, 'getTokenSprites' | 'playersSeeInFrame' | 'playersSeeOnCanvas'>;

/**
 * The players' view of the tokens for the measure tool, read when asked: where the tokens stand,
 * whether the players see them in their frame (by the scene's `lighting` with committed fog), and on
 * the canvas while it shows their view. Without a token renderer a frame sees no token.
 */
export function measurePlayersView(deps: {
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  grid: Pick<GridSystem, 'getOptions'>;
  tokens: () => MeasuredTokens | undefined;
  lighting: () => TokenPerception | undefined;
}): MeasurePlayersView {
  return {
    footprints: () => {
      const { objects, tokenSettings } = deps.store.getState();
      return tokenFootprints(objects.tokens, deps.tokens()?.getTokenSprites() ?? {}, deps.grid.getOptions().size, tokenSettings?.tokenRingSize ?? 1);
    },
    seenAtStart: () => deps.tokens()?.playersSeeInFrame(deps.lighting()) ?? NOTHING_SEEN,
    seenOnCanvas: () => deps.tokens()?.playersSeeOnCanvas() ?? null,
  };
}
