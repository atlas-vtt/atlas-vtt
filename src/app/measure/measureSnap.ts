/**
 * Where a measurement's points snap. `grid` is the grid they snap to: null where the grid's Snap
 * is off or the map has no grid, and then nothing snaps. `free` is the key that places freely.
 */

import type { GridGeometry } from '../grid/gridDistance';
import { hexVertices } from '../grid/hexGeometry';
import type { Point } from '../types/visionTypes';
import { cellCentreAt, hexLayoutOf } from './measureGrid';

function snaps(grid: GridGeometry | null, free: boolean): grid is GridGeometry {
  return !!grid && !free && grid.size > 0;
}

/** A ruler's point: the centre of the cell it lies in. */
export function snapRulerPoint(grid: GridGeometry | null, point: Point, free = false): Point {
  return snaps(grid, free) ? cellCentreAt(grid, point) : { x: point.x, y: point.y };
}

/**
 * An area's origin: the nearest of a cell's centre, its corners and the middles of its edges, the
 * places rulebooks measure areas from; on a hex grid the nearest of a hex's centre and its corners.
 */
export function snapAreaOrigin(grid: GridGeometry | null, point: Point, free = false): Point {
  if (!snaps(grid, free)) return { x: point.x, y: point.y };
  const layout = hexLayoutOf(grid);
  if (!layout) {
    // Centres, corners and edge middles together are every point half a cell apart.
    const half = grid.size / 2;
    const offsetX = grid.offsetX ?? 0;
    const offsetY = grid.offsetY ?? 0;
    return { x: offsetX + Math.round((point.x - offsetX) / half) * half, y: offsetY + Math.round((point.y - offsetY) / half) * half };
  }
  // The corner nearest to a point in a hex is one of that hex's own.
  const centre = cellCentreAt(grid, point);
  let nearest = centre;
  let least = (point.x - centre.x) ** 2 + (point.y - centre.y) ** 2;
  for (const corner of hexVertices(layout, centre)) {
    const distance = (point.x - corner.x) ** 2 + (point.y - corner.y) ** 2;
    if (distance < least) {
      least = distance;
      nearest = corner;
    }
  }
  return nearest;
}

/**
 * An area's end: where the pointer points, at a whole number of cells from the origin and at least
 * one. The size snaps, not the pointer to a cell, so an area of four cells is four cells long in
 * every direction. A pointer on the origin gives no direction and stays there.
 */
export function snapAreaEnd(grid: GridGeometry | null, origin: Point, pointer: Point, free = false): Point {
  const x = pointer.x - origin.x;
  const y = pointer.y - origin.y;
  const length = Math.hypot(x, y);
  if (!snaps(grid, free) || !(length > 0)) return { x: pointer.x, y: pointer.y };
  const scale = (Math.max(1, Math.round(length / grid.size)) * grid.size) / length;
  return { x: origin.x + x * scale, y: origin.y + y * scale };
}
