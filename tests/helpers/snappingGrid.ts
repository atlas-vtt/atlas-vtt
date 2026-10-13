import { tokenCenterShift } from '../../src/app/grid/gridPlacement';
import { GridSystem, type GridOptions } from '../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, isHexGridType, type Point } from '../../src/app/grid/hexGeometry';

export type SnappingGridOptions = Required<Pick<GridOptions, 'type' | 'size' | 'offsetX' | 'offsetY'>>;

/** What measuring reads of a grid: its options and where points and tokens snap. */
export type SnappingGrid = Pick<GridSystem, 'getOptions' | 'snapToCellCenter' | 'snapTokenCenter'>;

/** Grids as alignment, auto-detect and imports leave them: no round sizes, offsets off the pixel. */
export const ALIGNED_GRIDS: readonly SnappingGridOptions[] = [
  { type: 'square', size: 70.3, offsetX: 0, offsetY: 0 },
  { type: 'square', size: 64.7, offsetX: 12.4, offsetY: 33.9 },
  { type: 'square', size: 72.916666, offsetX: 3.2, offsetY: 1.1 },
  { type: 'square', size: 100, offsetX: 12.37, offsetY: 5.1 },
];

/** Hex grids of both orientations, with a round size and with sizes and offsets alignment leaves. */
export const HEX_GRIDS: readonly SnappingGridOptions[] = (['hex-vertical', 'hex-horizontal'] as const).flatMap(type => [
  { type, size: 70, offsetX: 0, offsetY: 0 },
  { type, size: 70.3, offsetX: 0, offsetY: 0 },
  { type, size: 64.7, offsetX: 12.4, offsetY: 33.9 },
]);

/** The real snapping of a `GridSystem` with `options`, without the renderer one needs. */
export function snappingGrid(options: SnappingGridOptions): SnappingGrid {
  const system: object = Object.create(GridSystem.prototype);
  Object.assign(system, { options });
  return system as SnappingGrid;
}

function cellCentre(options: SnappingGridOptions, col: number, row: number): Point {
  if (isHexGridType(options.type)) {
    return axialToPixel(createHexLayout(options.type, options.size, options.offsetX, options.offsetY), { q: col, r: row });
  }
  return { x: options.offsetX + (col + 0.5) * options.size, y: options.offsetY + (row + 0.5) * options.size };
}

/**
 * Where a pointer may hold a token of `tokenSize` whose footprint starts from cell (col, row), an axial
 * hex on a hex grid: off the place the token snaps to, which for an even footprint is where cells meet.
 */
export function pointInCell(options: SnappingGridOptions, col: number, row: number, tokenSize = 1): Point {
  const centre = cellCentre(options, col, row);
  const shift = tokenCenterShift(options.type, options.size, tokenSize);
  return { x: centre.x + shift.x + 0.2 * options.size, y: centre.y + shift.y - 0.1 * options.size };
}
