import type { TokenEntity } from '../types';
import { linkLandings } from '../levels/levelLinks';
import { floorBelow, type ArtFloors } from '../levels/levelSurfaces';
import { resolveLevel, type SceneLevels } from '../levels/sceneLevels';
import { aurasToTokenLevels } from '../measure/auraUpkeep';
import type { KeptMeasure } from '../measure/measureTypes';
import type { LevelLink, LevelSurface } from '../types/sceneLevelTypes';

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

/** Where a token is put down, and which way it faces once it is (a group turned as one); unset keeps its facing. */
export interface TokenPlace {
  id: string;
  x: number;
  y: number;
  rotation?: number;
}

/** What putting tokens down writes: the tokens, and the flag that tells spatial audio a token moved; and the stairs and openings it reads. */
export interface PlacedTokensState {
  objects: {
    tokens: Record<string, TokenEntity>;
    levelLinks?: Record<string, LevelLink> | undefined;
    levelSurfaces?: Record<string, LevelSurface> | undefined;
    /** A token that changes level takes its auras along. */
    measures?: Record<string, KeptMeasure> | undefined;
  };
  levels?: SceneLevels;
  _audioDirty: boolean;
  fogExplore?: unknown;
  tokensPutDown?: readonly string[] | undefined;
}

/**
 * Notes `ids` as the tokens put down last (`ViewState.tokensPutDown`), for the watch that clears
 * fog around the party's (`fogExploreWatch.ts`). Only a scene with that option on notes them, so
 * elsewhere a drop that changes nothing still writes nothing. Changes `state` in place (a store draft).
 */
export function notePutDown(state: Pick<PlacedTokensState, 'fogExplore' | 'tokensPutDown'>, ids: readonly string[]): void {
  if (state.fogExplore) state.tokensPutDown = ids;
}

/**
 * Puts tokens down: each at its place (facing the way it is given, if it is), all of them on top of
 * every other token (`raiseTokens`), and flags the move for spatial audio. A token put down inside
 * stairs (`linkLandings`) that lead to one level goes to that level, at the same place, in the same
 * write; where they offer several, it stays and the caller may offer the choice (`linkChoice`). A
 * token that ends where its level has no floor (an opening, or where the view draws its map
 * transparent: `art`, `floorBelow`) falls to the first level below that has, in the same write; over
 * a chasm it stays. A token that changes level takes its auras along. Changes only what the scene
 * saves and undoes (the tokens' places, order and levels, and their auras' levels), the audio
 * flag and the note of which tokens were put down (`notePutDown`); letting go of held tokens is
 * pointer state, which `dropTokens` does.
 * Tokens not listed keep their objects. Changes `state` in place (a store draft); returns nothing,
 * so a recipe may hand its call on.
 */
export function placeTokens(state: PlacedTokensState, positions: readonly TokenPlace[], art?: ArtFloors): void {
  const { tokens } = state.objects;
  const landings = linkLandings(state, positions);
  const levelsBefore = positions.map(({ id }) => tokens[id]?.level);
  for (const { id, x, y, rotation } of positions) {
    const token = tokens[id];
    if (token) {
      token.x = x;
      token.y = y;
      if (rotation !== undefined) token.rotation = rotation;
    }
  }
  for (const { tokenId, targets } of landings) {
    const token = tokens[tokenId];
    if (token && targets.length === 1) token.level = targets[0];
  }
  for (const { id, x, y } of positions) {
    const token = tokens[id];
    const from = token ? resolveLevel(state.levels, token.level) : null;
    const below = token && from !== null ? floorBelow(state, from, { x, y }, art) : null;
    if (token && below !== null) token.level = below;
  }
  const climbed = positions.filter(({ id }, index) => tokens[id]?.level !== levelsBefore[index]).map(({ id }) => id);
  if (climbed.length > 0) aurasToTokenLevels(state.objects, climbed);
  const ids = positions.map(({ id }) => id);
  raiseTokens(tokens, ids);
  state._audioDirty = true;
  notePutDown(state, ids);
}
