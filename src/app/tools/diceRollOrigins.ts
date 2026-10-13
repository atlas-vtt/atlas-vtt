import type { DiceRollOrigin, TokenRollContext } from '../types/diceRollOrigin';

/** What of a view's store tells which scene it holds, and the tokens in it. */
interface SceneState {
  mapPath: string | null;
  mapLoaded: boolean;
  isMapLoading: boolean;
  objects: { tokens: Readonly<Record<string, unknown>> };
}

/**
 * The view `viewId`, the scene `state` holds loaded and those of `tokenIds` that stand in
 * it: taken when a statblock opens for them and kept with it, whatever loads later. None
 * while no scene is loaded or none of the tokens stands in it.
 */
export function captureRollContext(viewId: string | undefined, state: SceneState, tokenIds: readonly string[]): TokenRollContext | undefined {
  if (!viewId || !state.mapPath || !state.mapLoaded || state.isMapLoading) return undefined;
  const present = [...new Set(tokenIds)].filter((id) => Boolean(state.objects.tokens[id]));
  if (!present.length) return undefined;
  return Object.freeze({ viewId, mapPath: state.mapPath, tokenIds: Object.freeze(present) });
}

/** The origin of a roll for `tokenId` from a statblock opened with `context`; none for a token it was not opened for. */
export function rollOrigin(context: TokenRollContext | undefined, tokenId: string | undefined): DiceRollOrigin | undefined {
  if (!context || !tokenId || !context.tokenIds.includes(tokenId)) return undefined;
  return Object.freeze({ viewId: context.viewId, mapPath: context.mapPath, tokenId });
}
