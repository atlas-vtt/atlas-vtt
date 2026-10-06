import type { CellNumberFormat } from '../grid/cellNumbering';

// Type definitions
export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface GridState {
  enabled: boolean;
  visible?: boolean; // Grid visibility (separate from enabled)
  snapToGrid?: boolean; // Whether tokens snap to grid
  type?: 'square' | 'hex-horizontal' | 'hex-vertical';
  size: number;
  offsetX: number;
  offsetY: number;
  /** Hex colour of the grid lines. Unset lets the grid pick black or white from the map's brightness. */
  color?: string;
  opacity: number;
  scale?: number;
  mapScale?: number; // Scale factor used during grid alignment
  unitType?: 'feet' | 'yards' | 'meters' | 'units';
  unitDistance?: number;
  /**
   * Game units one cell of this scene spans, in place of its collection's (a map drawn at
   * another scale than the rest). Unset follows the collection. `unitDistance` is no override:
   * new scenes are written with a copy of the collection's distance, which then goes stale.
   */
  unitDistanceOverride?: number;
  lineType?: 'solid' | 'dashed' | 'dotted'; // Grid line style
  lineWidth?: number; // Grid line width in pixels
  measurementType?: 'units' | 'abstract'; // Measurement system to use
  /** Set on new scenes: align the grid to the map image on the first load, then cleared. */
  autoDetect?: boolean;
  /** Numbers every cell of the grid in this format; unset shows no numbers. */
  cellNumbers?: CellNumberFormat;
  /** Opacity of the cell numbers (0 to 1), separate from the grid lines; unset is `DEFAULT_CELL_NUMBER_OPACITY`. */
  cellNumberOpacity?: number;
}
