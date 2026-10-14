import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { wallList } from '../../vision/wallList';
import { splitWall } from './wallEdits';
import { pointOnWall } from './wallPoint';

/** Splits solid interiors at a joint, keeping the original id on the first half. The caller owns history. */
export function connectWallPoint(
  store: StoreApi<ViewAtlasState>, point: Point, skip: ReadonlySet<string> = new Set(),
): Array<{ id: string; p2: Point; added: string }> {
  const splits: Array<{ id: string; p2: Point; added: string }> = [];
  for (const wall of wallList(store.getState().objects.walls)) {
    if (wall.type !== 'solid' || skip.has(wall.id)) continue;
    const at = pointOnWall(wall, point);
    if (Math.hypot(at.x - point.x, at.y - point.y) >= 1e-6
      || Math.hypot(point.x - wall.p1.x, point.y - wall.p1.y) <= 1e-6
      || Math.hypot(point.x - wall.p2.x, point.y - wall.p2.y) <= 1e-6) continue;
    const halves = splitWall(wall, point, 0);
    if (!halves) continue;
    store.getState().updateWall(wall.id, { p2: halves[0].p2 });
    splits.push({ id: wall.id, p2: wall.p2, added: store.getState().addWall(halves[1]) });
  }
  return splits;
}
