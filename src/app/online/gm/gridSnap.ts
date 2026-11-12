import type { SnapGrid } from '../protocol/index.ts';
import type { Point } from '../movement/index.ts';
import { snapTokenCenter } from '../../grid/gridPlacement';
import { createHexLayout, isHexGridType, nearestHexCenter } from '../../grid/hexGeometry';
import { squareCellCentre } from '../../grid/squareLattice';

/**
 * Where a token `cells` cells wide snaps on the grid players are sent (`snapGridOf`), as Atlas's own
 * drop snaps it (`GridSystem.snapTokenCenter`): on the centre of a cell, or where cells meet for an
 * even footprint.
 */
export function gridSnap(grid: SnapGrid, cells: number): (point: Point) => Point {
  const { type, size, offsetX, offsetY } = grid;
  const cellCentre = isHexGridType(type)
    ? ((layout) => (point: Point): Point => nearestHexCenter(layout, point))(createHexLayout(type, size, offsetX, offsetY))
    : (point: Point): Point => squareCellCentre({ size, offsetX, offsetY }, point);
  return (point) => snapTokenCenter(point, cells, type, size, cellCentre);
}
