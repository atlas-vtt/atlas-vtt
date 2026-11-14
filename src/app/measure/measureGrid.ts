/** A grid as measurements read it: the cell a point lies in, a cell's outline, and a length in cells. */

import type { GridGeometry } from '../grid/gridDistance';
import { createHexLayout, hexVertices, isHexGridType, nearestHexCenter, pixelToAxial, type HexLayout } from '../grid/hexGeometry';
import { axialKey } from '../grid/hexLattice';
import { squareCellCentre } from '../grid/squareLattice';
import type { Point } from '../types/visionTypes';

/** How far from a whole number of cells a length still is that number, in cells (`gridDistance.ts` reads distances the same way). */
const WHOLE_CELL_TOLERANCE = 1e-6;

/** The layout of a hex grid; null for a square grid. */
export function hexLayoutOf(grid: GridGeometry): HexLayout | null {
  return isHexGridType(grid.type) ? createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0) : null;
}

/** The centre of the cell `point` lies in. */
export function cellCentreAt(grid: GridGeometry, point: Point): Point {
  const layout = hexLayoutOf(grid);
  if (layout) return nearestHexCenter(layout, point);
  return squareCellCentre({ size: grid.size, offsetX: grid.offsetX ?? 0, offsetY: grid.offsetY ?? 0 }, point);
}

/** The name of the cell `point` lies in: a hex's `axialKey`, a square's column and row. */
export function cellKeyAt(grid: GridGeometry, point: Point): string {
  const layout = hexLayoutOf(grid);
  if (layout) return axialKey(pixelToAxial(layout, point));
  return `${Math.floor((point.x - (grid.offsetX ?? 0)) / grid.size)},${Math.floor((point.y - (grid.offsetY ?? 0)) / grid.size)}`;
}

/** The corners of the cell centred on `centre`. */
export function cellOutline(grid: GridGeometry, centre: Point): Point[] {
  const layout = hexLayoutOf(grid);
  if (layout) return hexVertices(layout, centre);
  const half = grid.size / 2;
  return [
    { x: centre.x - half, y: centre.y - half },
    { x: centre.x + half, y: centre.y - half },
    { x: centre.x + half, y: centre.y + half },
    { x: centre.x - half, y: centre.y + half },
  ];
}

/**
 * A length in world pixels as cells. A size that was snapped is whole cells long, but its pixels
 * divided by the cell size miss the whole number by a rounding error, so a length that close to
 * whole cells is whole: four cells never read 19.999 ft.
 */
export function lengthInCells(pixels: number, cellSize: number): number {
  const cells = pixels / cellSize;
  const whole = Math.round(cells);
  return Math.abs(cells - whole) < WHOLE_CELL_TOLERANCE ? whole : cells;
}
