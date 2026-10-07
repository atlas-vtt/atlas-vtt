/**
 * Grid distance along a path, in cells.
 *
 * Hex grids count hex steps. Square grids split every segment into straight
 * and diagonal cells and price the diagonals with the collection's
 * `DiagonalRule`. The alternating rule counts diagonals over the whole path,
 * so a path with waypoints costs the same as one straight move.
 */

import type { DiagonalRule } from '../types/collectionSettingsTypes';
import type { GridOptions } from './gridTypes';
import { axialDistance, createHexLayout, isHexGridType, nearestHexCenter, pixelToAxial, type Point } from './hexGeometry';

export type GridGeometry = Pick<GridOptions, 'type' | 'size' | 'offsetX' | 'offsetY'>;

/** How far from a whole number of cells a distance still is that number, in cells. */
const WHOLE_CELL_TOLERANCE = 1e-6;

/**
 * Cells between two coordinates along one axis. Snapped points lie whole cells apart, but their
 * pixel distance divided by the cell size misses the whole number by a rounding error that depends
 * on where on the map they are, and the alternating rule rounds the diagonals down: two diagonals
 * read as 1.9999999999999996 cost one cell less. So a distance that close to whole cells is whole.
 */
function cellsBetween(from: number, to: number, cellSize: number): number {
  const cells = Math.abs(to - from) / cellSize;
  const whole = Math.round(cells);
  return Math.abs(cells - whole) < WHOLE_CELL_TOLERANCE ? whole : cells;
}

/** Length in cells of the path through `points`. */
export function pathLengthInCells(grid: GridGeometry, points: readonly Point[], diagonalRule: DiagonalRule): number {
  if (isHexGridType(grid.type)) {
    const layout = createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0);
    const cells = points.map(point => pixelToAxial(layout, point));
    let steps = 0;
    for (let i = 1; i < cells.length; i++) steps += axialDistance(cells[i - 1]!, cells[i]!);
    return steps;
  }

  let straight = 0;
  let diagonal = 0;
  let euclidean = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = cellsBetween(points[i - 1]!.x, points[i]!.x, grid.size);
    const dy = cellsBetween(points[i - 1]!.y, points[i]!.y, grid.size);
    straight += Math.abs(dx - dy);
    diagonal += Math.min(dx, dy);
    euclidean += Math.hypot(dx, dy);
  }

  switch (diagonalRule) {
    case 'euclidean':
      return euclidean;
    case 'alternating':
      return straight + diagonal + Math.floor(diagonal / 2);
    case 'equidistant':
      return straight + diagonal;
  }
}

/** The centre of the cell holding `point`: the nearest hex centre, or the square's centre. */
export function cellCenterAt(grid: GridGeometry, point: Point): Point {
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  if (isHexGridType(grid.type)) return nearestHexCenter(createHexLayout(grid.type, grid.size, offsetX, offsetY), point);
  return {
    x: Math.floor((point.x - offsetX) / grid.size) * grid.size + offsetX + grid.size / 2,
    y: Math.floor((point.y - offsetY) / grid.size) * grid.size + offsetY + grid.size / 2,
  };
}
