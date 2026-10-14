import { snapToGridCorner } from '../../grid/gridCorner';
import type { GridState } from '../../types/gridTypes';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';
import { shareAlong } from './wallEdits';
import { sameJoint, wallEndNear, type WallEndSearch } from './wallEnds';

export function pointOnWall(wall: Pick<WallSegment, 'p1' | 'p2'>, point: Point): Point {
  const share = Math.max(0, Math.min(1, shareAlong(wall, point) ?? 0));
  return { x: wall.p1.x + (wall.p2.x - wall.p1.x) * share, y: wall.p1.y + (wall.p2.y - wall.p1.y) * share };
}

/** Existing joints take priority, then the nearest solid wall, then the grid. Alt bypasses all snapping. */
export function wallPoint(
  point: Point, walls: Record<string, WallSegment>, grid: GridState | null | undefined,
  zoom: number, free = false, search: WallEndSearch = {},
): { point: Point; joined: boolean } {
  if (free) return { point, joined: false };
  const end = wallEndNear(point, walls, zoom, search);
  if (end) return { point: end, joined: true };
  let nearest: Point | null = null;
  let distance = 10 / zoom;
  for (const wall of wallList(walls)) {
    if (wall.type !== 'solid' || search.skip?.has(wall.id)) continue;
    const projected = pointOnWall(wall, point);
    const gap = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (gap <= distance && !search.avoid?.some((at) => sameJoint(at, projected))) {
      nearest = projected;
      distance = gap;
    }
  }
  return { point: nearest ?? snapToGridCorner(point, grid), joined: nearest !== null };
}
