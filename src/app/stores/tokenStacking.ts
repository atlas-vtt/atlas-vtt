import type { TokenEntity } from '../types';

const layerOf = (token: TokenEntity): number => token.layer ?? 0;

/**
 * Puts the tokens on top of every other token of the map, in the order they lie in among
 * themselves: the token put on a square last covers the ones that were there. Tokens that
 * already lie above all others stay as they are. Changes `tokens` in place (a store draft).
 */
export function raiseTokens(tokens: Record<string, TokenEntity>, ids: readonly string[]): void {
  const picked = new Set(ids);
  const raised: TokenEntity[] = [];
  let below = -Infinity;
  for (const token of Object.values(tokens)) {
    if (picked.has(token.id)) raised.push(token);
    else below = Math.max(below, layerOf(token));
  }
  if (raised.every((token) => layerOf(token) > below)) return;

  raised.sort((a, b) => layerOf(a) - layerOf(b));
  raised.forEach((token, index) => {
    token.layer = below + 1 + index;
  });
}

/** Where a token is put down. */
export interface TokenPlace {
  id: string;
  x: number;
  y: number;
}

/** What putting tokens down writes: the tokens, and the flag that tells spatial audio a token moved. */
export interface PlacedTokensState {
  objects: { tokens: Record<string, TokenEntity> };
  _audioDirty: boolean;
}

/**
 * Puts tokens down: each at its place, all of them on top of every other token (`raiseTokens`),
 * and flags the move for spatial audio. Changes only what the scene saves and undoes (the
 * tokens' places and order) and the audio flag; letting go of held tokens is pointer state,
 * which `dropTokens` does. Tokens not listed keep their objects. Changes `state` in place
 * (a store draft).
 */
export function placeTokens(state: PlacedTokensState, positions: readonly TokenPlace[]): void {
  const { tokens } = state.objects;
  for (const { id, x, y } of positions) {
    const token = tokens[id];
    if (token) {
      token.x = x;
      token.y = y;
    }
  }
  raiseTokens(tokens, positions.map(({ id }) => id));
  state._audioDirty = true;
}
