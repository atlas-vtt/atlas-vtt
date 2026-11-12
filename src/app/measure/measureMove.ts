/** A kept measurement moved as a whole: every point by the same way, so its shape and size stay. */

import type { GridGeometry } from '../grid/gridDistance';
import type { Point } from '../types/visionTypes';
import { snapAreaOrigin, snapRulerPoint } from './measureSnap';
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
