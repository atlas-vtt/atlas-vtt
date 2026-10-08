import { GridSystem, type GridOptions } from '../../src/app/grid/GridSystem';

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

/** The real snapping of a `GridSystem` with `options`, without the renderer one needs. */
export function snappingGrid(options: SnappingGridOptions): SnappingGrid {
  const system: object = Object.create(GridSystem.prototype);
  Object.assign(system, { options });
  return system as SnappingGrid;
}

/** A point somewhere inside cell (col, row), off its centre. */
export function pointInCell(options: SnappingGridOptions, col: number, row: number): { x: number; y: number } {
  return { x: options.offsetX + (col + 0.3) * options.size, y: options.offsetY + (row + 0.6) * options.size };
}
