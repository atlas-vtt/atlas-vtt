import { isLit } from '../../online/gm/atlasLighting';
import { dropPlace, landing, sceneWalls, type MapSize } from '../../online/gm/moveCheck';
import type { Point } from '../../online/movement';
import type { ViewAtlasState } from '../../storeFactory';
import { levelObjects } from '../../levels/levelObjects';
import type { TokenEntity } from '../../types';

/**
 * The walls a token the GM drags stops at: in session view (GM view off) the canvas is the players'
 * table, so tokens stop at walls as players' own do (`sceneWalls`: on a lit scene, every wall but an
 * open door, plus the sides of walked stairs). Null in GM view, where the GM moves tokens anywhere.
 */
export interface SessionDragWalls {
  /** Where a token at `from` comes to rest following the pointer to `to` (`landing`). */
  follow(state: ViewAtlasState, tokenId: string, from: Point, to: Point): Point;
  /** Where a token resting at its place ends when dropped at `to`, snapped as the GM's drop is; null when it reaches no place (`dropPlace`). */
  drop(state: ViewAtlasState, token: Pick<TokenEntity, 'id' | 'x' | 'y' | 'size'>, to: Point): Point | null;
}

export function sessionDragWalls(state: ViewAtlasState, map: MapSize | null): SessionDragWalls | null {
  if (state.isGMView !== false || state.isPlayerView) return null;
  const context = { walls: sceneWalls(levelObjects(state).walls, isLit(state), map), map };
  return {
    follow: (current, tokenId, from, to) => landing(context, current, tokenId, from, to),
    drop: (current, token, to) => dropPlace(context, current, token, to),
  };
}
