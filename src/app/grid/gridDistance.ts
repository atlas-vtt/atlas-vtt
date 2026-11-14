/**
 * Grid distance along a path, in cells.
 *
 * Hex grids count hex steps. Square grids split every segment into straight
 * and diagonal cells and price the diagonals with the collection's
 * `DiagonalRule`. The alternating rule counts diagonals over the whole path,
 * so a path with waypoints costs the same as one straight move. A path between
 * two heights counts the climb as a third axis under the same rule.
 */

import type { DiagonalRule } from '../types/collectionSettingsTypes';
import type { GridOptions } from './GridSystem';
import { axialDistance, createHexLayout, isHexGridType, pixelToAxial, type Point } from './hexGeometry';

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
  return wholeIfClose(Math.abs(to - from) / cellSize);
}

function wholeIfClose(cells: number): number {
  const whole = Math.round(cells);
  return Math.abs(cells - whole) < WHOLE_CELL_TOLERANCE ? whole : cells;
}

/**
 * A flat path as the rules count it, in cells: the steps along one axis, the diagonal steps, and
 * its length in a straight line. A hex grid has no diagonals: its steps are all `straight`.
 */
export interface FlatCells {
  readonly straight: number;
  readonly diagonal: number;
  readonly euclidean: number;
}

/** The path through `points` as the rules count it. */
export function flatCells(grid: GridGeometry, points: readonly Point[]): FlatCells {
  if (isHexGridType(grid.type)) {
    const layout = createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0);
    const cells = points.map(point => pixelToAxial(layout, point));
    let steps = 0;
    for (let i = 1; i < cells.length; i++) steps += axialDistance(cells[i - 1]!, cells[i]!);
    return { straight: steps, diagonal: 0, euclidean: steps };
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
  return { straight, diagonal, euclidean };
}

/**
 * What a flat path costs by `diagonalRule`, in cells, when it also climbs `rise` cells (the height
 * between its two ends, either way). The height is a third axis under the same rule, counted once
 * over the whole path, so a path with corners costs what one straight move does:
 *
 * - `equidistant`: a step that also climbs costs no more than one that does not. The larger of
 *   the path's steps and the climb; for one leg, the largest of its three axis differences.
 * - `alternating`: a step along two or three axes is a diagonal, and every second diagonal costs
 *   double. The climb is taken on steps that are diagonal already, then on straight ones (which
 *   become diagonals), then alone. For one leg that is the two largest of its three axis
 *   differences, a and b: a + floor(b / 2), as the rule counts a flat diagonal.
 * - `manhattan`: every axis is paid for: the path plus the climb.
 * - `euclidean`: the straight line through the air. A path with corners climbs evenly along it.
 *
 * On a hex grid, which has no diagonals on the floor, the only diagonal is a step that climbs, and
 * the same rule prices it. Without a climb this is the flat path's cost and nothing else.
 */
export function cellsByRule(flat: FlatCells, diagonalRule: DiagonalRule, rise = 0): number {
  const { straight, diagonal, euclidean } = flat;
  const climb = Number.isFinite(rise) ? wholeIfClose(Math.abs(rise)) : 0;
  const steps = straight + diagonal;
  switch (diagonalRule) {
    case 'euclidean':
      return climb === 0 ? euclidean : Math.hypot(euclidean, climb);
    case 'alternating': {
      const diagonals = climb <= steps ? Math.max(diagonal, climb) : steps;
      return Math.max(steps, climb) + Math.floor(diagonals / 2);
    }
    case 'equidistant':
      return Math.max(steps, climb);
    case 'manhattan':
      return straight + 2 * diagonal + climb;
  }
}

/** Length in cells of the path through `points`; `rise` is the height between its ends in cells (`cellsByRule`). */
export function pathLengthInCells(grid: GridGeometry, points: readonly Point[], diagonalRule: DiagonalRule, rise = 0): number {
  return cellsByRule(flatCells(grid, points), diagonalRule, rise);
}
