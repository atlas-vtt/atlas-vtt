/**
 * Fog clears around party tokens as they are put down (the scene's `fogExplore`; the rule is
 * `fog/fogExplore.ts`). While the option is on, a view store notes the tokens put down
 * (`notePutDown`: a drop, a token placed from the library or from beside the map, a player's move
 * online), and this watch writes the reveal while that write's listeners run, as Atlas's own write
 * (`runUntracked`): it is then part of the move's undo step, never a step of its own. A drag under
 * way, re-snapping, undo and redo put no token down and reveal nothing.
 */

import type { StoreApi } from 'zustand';
import { exploredShapes, exploreReach, readFogExplore, revealOperations, revealsOf } from '../fog/fogExplore';
import type { FogCoverage } from '../fog/fogCoverage';
import type { MapRect } from '../grid/cellNumbering';
import { sideOf } from '../initiative/sides';
import { levelObjects } from '../levels/levelObjects';
import { worldTexel } from '../lighting/lightingConstants';
import { sealedWalls } from '../lighting/sealWalls';
import { mapTokens } from '../tokens/offMap';
import type { ViewState } from '../types/viewState';
import type { Point } from '../types/visionTypes';
import { wallList } from '../vision/wallList';
import type { FogSlice } from './fogSlice';
import { isHistoryTravelling, runUntracked, type HistoryHost } from './history';

/** What the watch reads of a view store, and the one action it writes with. */
export type FogExploreState = Pick<ViewState, 'objects' | 'levels' | 'viewedLevel' | 'grid' | 'fogExplore' | 'tokensPutDown' | 'isMapLoading'>
  & Pick<FogSlice, 'addFogOperations'>;

/** What the view knows that the store does not. */
export interface FogExploreView {
  /** The fog of the level shown as the view draws it; null while it cannot be drawn. */
  coverage: () => FogCoverage | null;
  /** The map of the level shown, whose size says which joints between walls count as closed (`sealedWalls`); null without one. */
  mapRect: () => MapRect | null;
}

/**
 * Where the party's tokens among `ids` stand on the map of the level shown: those on the players'
 * side (`sideOf`) that are not hidden. A token on another level, or kept beside the map, is none.
 */
export function exploringTokens(state: Pick<ViewState, 'objects' | 'levels' | 'viewedLevel'>, ids: readonly string[]): Point[] {
  const tokens = mapTokens(levelObjects(state));
  return ids.flatMap((id) => {
    const token = Object.hasOwn(tokens, id) ? tokens[id] : undefined;
    return token && !token.isHidden && sideOf(token) === 'players' ? [{ x: token.x, y: token.y }] : [];
  });
}

/** Reveals fog around the party's tokens among `ids`, where the scene's option is on and fog lies within its distance of one. */
function reveal(store: HistoryHost, state: FogExploreState, ids: readonly string[], view: FogExploreView): void {
  const explore = readFogExplore(state.fogExplore);
  if (!explore) return;
  const centres = exploringTokens(state, ids);
  const coverage = centres.length > 0 ? view.coverage() : null;
  if (!coverage || coverage.shape.length === 0) return;
  const walls = sealedWalls(wallList(levelObjects(state).walls), worldTexel(view.mapRect() ?? { width: 0, height: 0 }));
  const reveals = revealOperations(revealsOf(exploredShapes(centres, exploreReach(explore, state.grid), walls), coverage));
  if (reveals.length > 0) runUntracked(store, () => state.addFogOperations(reveals));
}

/**
 * Follows the tokens `store` notes as put down and reveals fog around the party's. A store change
 * that put no token down costs one comparison, and with the option off none is noted. Returns what
 * ends the watch.
 */
export function watchFogExplore(store: Pick<StoreApi<FogExploreState>, 'getState' | 'subscribe'>, view: FogExploreView): () => void {
  let seen = store.getState().tokensPutDown;
  return store.subscribe(() => {
    const state = store.getState();
    const put = state.tokensPutDown;
    if (put === seen) return;
    seen = put;
    // A load fills the scene and undo puts steps back: neither puts a token down.
    if (put && !state.isMapLoading && !isHistoryTravelling(store)) reveal(store, state, put, view);
  });
}
