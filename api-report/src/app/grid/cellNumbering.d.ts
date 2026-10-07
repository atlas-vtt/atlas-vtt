import type { Point } from './hexGeometry';
/**
 * How cells are numbered. `column-row` is the hexcrawl convention ("0304" is
 * column 3, row 4); `sequential` counts 1, 2, 3 in reading order; `letter-number`
 * spells the column as a letter and the row as a number (A1, B1, ... AA1).
 */
export type CellNumberFormat = 'column-row' | 'sequential' | 'letter-number';
export declare function isCellNumberFormat(value: unknown): value is CellNumberFormat;
/** How a grid shows its cell numbers; a grid without numbers has none. */
export interface CellNumberStyle {
    format: CellNumberFormat;
    /** 0 to 1, separate from the grid lines' opacity. */
    opacity: number;
}
export declare const DEFAULT_CELL_NUMBER_OPACITY = 0.8;
/** The cell number style a grid's settings ask for, or undefined when numbers are off. */
export declare function cellNumberStyleOfGrid(grid: {
    cellNumbers?: CellNumberFormat | undefined;
    cellNumberOpacity?: number | undefined;
} | null | undefined): CellNumberStyle | undefined;
/** The map image in world space. */
export interface MapRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** A cell on a lattice, identified by its lattice-specific key and 0-based row/column. */
export interface PlacedCell {
    /** Identifies the cell on the lattice; the lattice decides its spelling. */
    key: string;
    center: Point;
    /** 0-based, counted from the first cell of the map. */
    row: number;
    column: number;
}
/** A grid's cell geometry: how big its cells are and which ones fall on a given map. */
export interface CellLattice {
    /** Flat-to-flat distance for hexes, side length for squares, in world pixels. */
    size: number;
    /** The cells of the map, each with its 0-based row and column. */
    cellsOnMap(map: MapRect): PlacedCell[];
}
export interface NumberedCell {
    key: string;
    center: Point;
    label: string;
}
/**
 * A cell is on the map when its centre lies at least this share of the cell
 * size inside every edge, so cells the map edge cuts in half get no number and
 * every line of cells starts counting at its first whole cell.
 */
export declare const EDGE_MARGIN = 0.4;
export declare const EPSILON = 0.000001;
/** Numbers every cell of the lattice on the map; cells the map edge cuts off get no number. */
export declare function numberCells(lattice: CellLattice, map: MapRect, format: CellNumberFormat): NumberedCell[];
/** Numbered cells by their lattice key, for looking up a single cell's number. */
export declare function cellLabelsByKey(cells: readonly NumberedCell[]): Map<string, string>;
/** Where a cell's number sits: just below the top of the cell, clear of tokens and pins at its centre. */
export declare function cellNumberAnchor(size: number, center: Point): Point;
/** Font size of cell numbers in world pixels. */
export declare function cellNumberFontSize(size: number): number;
