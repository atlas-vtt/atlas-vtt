import { levelObjects, type LevelObjectsState } from '../levels/levelObjects';
import type { WallSegment } from '../types/wallTypes';
import type { Point } from '../types/visionTypes';
import type { MapBounds } from '../vision/visibility';
import { wallList } from '../vision/wallList';
import { worldTexel } from './lightingConstants';
import { sealedWalls } from './sealWalls';
import { blocksNothing, crosses, segOf } from './segments';

type LitScene = LevelObjectsState<{ walls: Record<string, WallSegment> }> & {
  lighting: { enabled: boolean };
};

/** Whether the straight way from `from` to `to` crosses none of `walls` that stops anything. */
export function wayIsClear(walls: readonly WallSegment[], from: Point, to: Point): boolean {
  return !walls.some((wall) => !blocksNothing(wall) && crosses(from.x, from.y, to.x, to.y, segOf(wall)));
}

/**
 * Whether a token may be drawn on its way from `from` to `to` (`TokenGlide`). On a lit scene its
 * sight, footprint and carried light follow it there (`followShownPlaces`), so its way must not
 * cross a wall, nor a joint the lighting closes between walls (`sealedWalls`, at the same texel
 * as the lighting): from behind one it would show, and the explored memory keep, what it never
 * saw from where it stands. Such a move is put in its place at once.
 */
export function glideWayIsClear(scene: LitScene, bounds: MapBounds | null, from: Point, to: Point): boolean {
  if (!scene.lighting.enabled || bounds === null) return true;
  return wayIsClear(sealedWalls(wallList(levelObjects(scene).walls), worldTexel(bounds)), from, to);
}
