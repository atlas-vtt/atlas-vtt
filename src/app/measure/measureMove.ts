/** A kept measurement moved as a whole (every point by the same way, so its shape and size stay), an area resized and turned by its far end, and an area turned about its start without any change of size. */

import type { GridGeometry } from '../grid/gridDistance';
import type { Point } from '../types/visionTypes';
import { snapAreaEnd, snapAreaOrigin, snapRulerPoint } from './measureSnap';
import type { MeasureShapeKind } from './measureTypes';

/**
 * `points` moved by `by`. Its first point then snaps as the start of a new measurement of `shape`
 * would (a ruler's to the cell's centre, an area's to the places areas are measured from), and
 * the others follow it. `grid` is the grid to snap to (null: nothing snaps), `free` the key that
 * places freely.
 */
export function measureMovedBy(shape: MeasureShapeKind, points: readonly Point[], by: Point, grid: GridGeometry | null, free = false): Point[] {
  const first = points[0];
  if (!first) return [];
  const moved = { x: first.x + by.x, y: first.y + by.y };
  const start = shape === 'ruler' ? snapRulerPoint(grid, moved, free) : snapAreaOrigin(grid, moved, free);
  const x = start.x - first.x;
  const y = start.y - first.y;
  return points.map((point) => ({ x: point.x + x, y: point.y + y }));
}

/**
 * An area's two points with its far end moved by `by`, its origin staying: the area is resized and
 * turned. The end then snaps as a new area's would (its size to whole cells, `snapAreaEnd`). An end
 * that would land on the origin stays where it was, since an area has a size.
 */
export function areaResizedBy(points: readonly Point[], by: Point, grid: GridGeometry | null, free = false): Point[] {
  const [origin, end] = points;
  if (!origin || !end) return points.map(({ x, y }) => ({ x, y }));
  const moved = snapAreaEnd(grid, origin, { x: end.x + by.x, y: end.y + by.y }, free);
  const sized = Math.hypot(moved.x - origin.x, moved.y - origin.y) > 0;
  return [{ x: origin.x, y: origin.y }, sized ? moved : { x: end.x, y: end.y }];
}

/**
 * `points` turned about the first point, by the angle the handle at `from` sweeps about it when it
 * moves by `by`. Every distance between the points stays, so nothing is resized. Never snapped: the turn is as smooth as the pointer. A turn that would put the
 * handle on the pivot has no angle, and leaves the points as they were.
 */
export function measureTurnedBy(points: readonly Point[], from: Point, by: Point): Point[] {
  const pivot = points[0];
  if (!pivot) return [];
  const to = { x: from.x + by.x, y: from.y + by.y };
  if (Math.hypot(from.x - pivot.x, from.y - pivot.y) === 0 || Math.hypot(to.x - pivot.x, to.y - pivot.y) === 0) return points.map(({ x, y }) => ({ x, y }));
  const angle = Math.atan2(to.y - pivot.y, to.x - pivot.x) - Math.atan2(from.y - pivot.y, from.x - pivot.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(({ x, y }, index) => {
    if (index === 0) return { x, y };
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
  });
}
