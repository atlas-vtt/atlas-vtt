/**
 * Where the Draw tool's points snap. `grid` is the grid they snap to: null where the grid's Snap
 * is off or the map has no grid, and then nothing snaps. `free` is the key that places freely.
 * The pen never snaps. The places are the measure tool's own, so one habit serves both tools.
 */

import type { GridGeometry } from '../grid/gridDistance';
import { isHexGridType } from '../grid/hexGeometry';
import { snapAreaOrigin, snapRulerPoint } from '../measure/measureSnap';
import type { Point } from '../types/visionTypes';

/**
 * A point of a line, a rectangle or an ellipse: the nearest of a cell's corners, its centre and
 * the middles of its edges; on a hex grid the nearest of a hex's centre and its corners. The
 * places an area is measured from, so a sketched room's walls run along the grid's lines.
 */
export function snapDrawPoint(grid: GridGeometry | null, point: Point, free = false): Point {
  return snapAreaOrigin(grid, point, free);
}

/**
 * A stamp's centre: the centre of the cell under it, so a stamp one cell wide sits on a cell.
 * A stamp `footprint` world pixels wide that spans an even number of square cells sits where
 * cells meet instead, as a token of that size does: on a cell's centre it would cover its
 * neighbours by halves.
 */
export function snapStampPoint(grid: GridGeometry | null, point: Point, free = false, footprint = 0): Point {
  if (!grid || free || !(grid.size > 0)) return { x: point.x, y: point.y };
  const cells = Math.round(footprint / grid.size);
  if (cells < 2 || cells % 2 !== 0 || isHexGridType(grid.type)) return snapRulerPoint(grid, point);
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  return { x: offsetX + Math.round((point.x - offsetX) / grid.size) * grid.size, y: offsetY + Math.round((point.y - offsetY) / grid.size) * grid.size };
}
