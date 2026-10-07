import type { GridType } from './gridTypes';
import {
  axialToPixel,
  createHexLayout,
  hexCellExtent,
  hexCircumradius,
  hexOrientationForGridType,
  isHexGridType,
  pixelToAxial,
} from './hexGeometry';
import type { Point } from './hexGeometry';
import { tokenDiameterInCells } from '../pixi/token-renderer/tokenSizing';

export interface GridOffset {
  offsetX: number;
  offsetY: number;
}

function mod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Keeps offsets small without moving the grid: square offsets modulo the cell, hex offsets re-based to the hex containing the origin. */
export function normaliseGridOffset(gridType: GridType, cellSize: number, offsetX: number, offsetY: number): GridOffset {
  if (!isHexGridType(gridType)) return { offsetX: mod(offsetX, cellSize), offsetY: mod(offsetY, cellSize) };
  const layout = createHexLayout(gridType, cellSize, offsetX, offsetY);
  const anchor = axialToPixel(layout, pixelToAxial(layout, { x: 0, y: 0 }));
  const extent = hexCellExtent(layout);
  return { offsetX: anchor.x - extent.width / 2, offsetY: anchor.y - extent.height / 2 };
}

/** Offsets of the grid whose cell `(0, 0)` is centred on `point`. */
export function gridOffsetCenteredAt(gridType: GridType, cellSize: number, point: Point): GridOffset {
  const extent = isHexGridType(gridType)
    ? hexCellExtent(createHexLayout(gridType, cellSize, 0, 0))
    : { width: cellSize, height: cellSize };
  return { offsetX: point.x - extent.width / 2, offsetY: point.y - extent.height / 2 };
}

/**
 * How far a token's centre lies from the centre of the cell its footprint starts from. A token covers whole
 * cells, so an even footprint centres where cells meet: on a square grid the intersection down and right of
 * that cell (2×2, 4×4), on a hex grid its lower right vertex, shared with the hexes to its right and below
 * (3 hexes for Large, 12 for Gargantuan). An odd footprint centres on the cell itself (1 hex, 7 hexes).
 */
export function tokenCenterShift(gridType: GridType | undefined, cellSize: number, tokenSize: number): Point {
  if (tokenDiameterInCells(tokenSize) % 2 !== 0) return { x: 0, y: 0 };
  if (!isHexGridType(gridType)) return { x: cellSize / 2, y: cellSize / 2 };
  const radius = hexCircumradius(cellSize);
  return hexOrientationForGridType(gridType) === 'pointy'
    ? { x: cellSize / 2, y: radius / 2 }
    : { x: radius / 2, y: cellSize / 2 };
}

/** Where the centre of a token of `tokenSize` snaps. `snapToCell` snaps a point to the centre of the cell containing it. */
export function snapTokenCenter(
  point: Point,
  tokenSize: number,
  gridType: GridType | undefined,
  cellSize: number,
  snapToCell: (point: Point) => Point,
): Point {
  const shift = tokenCenterShift(gridType, cellSize, tokenSize);
  const cell = snapToCell({ x: point.x - shift.x, y: point.y - shift.y });
  return { x: cell.x + shift.x, y: cell.y + shift.y };
}

/**
 * Centre of a token resized from `fromSize` to `toSize`. Where tokens snap to a grid it keeps the cell its
 * footprint starts from (on a square grid its top-left corner), so an aligned token stays aligned at its new
 * size; elsewhere it keeps its centre.
 */
export function resizedTokenCenter(
  center: Point,
  fromSize: number,
  toSize: number,
  grid: { type?: GridType | undefined; size: number; snapToGrid?: boolean | undefined } | null | undefined,
): Point {
  if (!grid || !(grid.snapToGrid ?? true)) return center;
  if (isHexGridType(grid.type)) {
    const from = tokenCenterShift(grid.type, grid.size, fromSize);
    const to = tokenCenterShift(grid.type, grid.size, toSize);
    return { x: center.x + to.x - from.x, y: center.y + to.y - from.y };
  }
  const shift = ((tokenDiameterInCells(toSize) - tokenDiameterInCells(fromSize)) * grid.size) / 2;
  return { x: center.x + shift, y: center.y + shift };
}
