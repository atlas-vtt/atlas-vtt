import type { CellNumberStyle } from './cellNumbering';
import type { GridLineType } from './gridLineStyle';

export type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';

export interface GridOptions {
  /** Type of grid. `hex-horizontal` is flat-top, `hex-vertical` is pointy-top. */
  type?: GridType;
  /**
   * Size of grid cells in pixels.
   * For square grids this is the side length. For hex grids it is the
   * flat-to-flat distance (width of a pointy-top hex, height of a flat-top hex),
   * matching the convention used by Foundry VTT and Owlbear Rodeo.
   */
  size: number;
  /** X offset for the grid origin */
  offsetX?: number;
  /** Y offset for the grid origin */
  offsetY?: number;
  /** Color of grid lines in hex format. Unset picks black or white from the map's brightness. */
  color?: number | undefined;
  /** Alpha transparency of grid lines (0–1) */
  alpha?: number;
  /** Line width for grid lines */
  lineWidth?: number;
  /** Line style (solid, dashed, dotted) */
  lineType?: GridLineType;
  /** Whether the grid is visible */
  enabled?: boolean;
  /** Scale factor for the grid (visual scale, distinct from mapScale) */
  scale?: number;
  /** Map scale for grid alignment mode - DEPRECATED or re-evaluate usage */
  mapScale?: number;
  /** Whether in alignment mode (for visual feedback) */
  isAligning?: boolean;
  /** Numbers every cell of the grid in this style; unset shows no numbers. */
  cellNumbers?: CellNumberStyle | undefined;
}
