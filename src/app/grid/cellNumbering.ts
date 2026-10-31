import type { Point } from './hexGeometry';

/**
 * How cells are numbered. `column-row` is the hexcrawl convention ("0304" is
 * column 3, row 4); `sequential` counts 1, 2, 3 in reading order; `letter-number`
 * spells the column as a letter and the row as a number (A1, B1, ... AA1).
 */
export type CellNumberFormat = 'column-row' | 'sequential' | 'letter-number';

export function isCellNumberFormat(value: unknown): value is CellNumberFormat {
  return value === 'column-row' || value === 'sequential' || value === 'letter-number';
}

/** How a grid shows its cell numbers; a grid without numbers has none. */
export interface CellNumberStyle {
  format: CellNumberFormat;
  /** 0 to 1, separate from the grid lines' opacity. */
  opacity: number;
}

export const DEFAULT_CELL_NUMBER_OPACITY = 0.8;

/** The cell number style a grid's settings ask for, or undefined when numbers are off. */
export function cellNumberStyleOfGrid(
  grid: { cellNumbers?: CellNumberFormat | undefined; cellNumberOpacity?: number | undefined } | null | undefined,
): CellNumberStyle | undefined {
  if (!grid || !isCellNumberFormat(grid.cellNumbers)) return undefined;
  return { format: grid.cellNumbers, opacity: grid.cellNumberOpacity ?? DEFAULT_CELL_NUMBER_OPACITY };
}

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

/**
 * How a map's cells fall into lines: the lattice's rows (`lineIsRow`) or its columns. Line `i`
 * holds `counts[i]` cells; a cell of it has row (or column) `i` and, along the line, its index
 * from the line's first cell as column (or row). Enough to number any cell as the whole map
 * numbers it without placing the others.
 */
export interface CellLines {
  lineIsRow: boolean;
  counts: readonly number[];
}

/** A grid's cell geometry: how big its cells are and which ones fall on a given map. */
export interface CellLattice {
  /** Flat-to-flat distance for hexes, side length for squares, in world pixels. */
  size: number;
  /** The cells of the map, each with its 0-based row and column. */
  cellsOnMap(map: MapRect): PlacedCell[];
  /** The cells of the map whose centres lie in `rect` (world), placed as `cellsOnMap` places them, without placing the rest. */
  cellsInRect(map: MapRect, rect: MapRect): PlacedCell[];
  /** How the map's cells fall into lines, counted without placing them. */
  linesOnMap(map: MapRect): CellLines;
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
export const EDGE_MARGIN = 0.4;
export const EPSILON = 1e-6;

function padded(value: number, digits: number): string {
  return String(value).padStart(digits, '0');
}

/** The widths `column-row` pads its two parts to, for a map of `columns` × `rows` cells. */
export function columnRowDigits(columns: number, rows: number): { column: number; row: number } {
  return { column: Math.max(2, String(columns).length), row: Math.max(2, String(rows).length) };
}

/** A cell's `column-row` label ("0304"), each part padded to `digits`. */
export function columnRowLabel(cell: PlacedCell, digits: { column: number; row: number }): string {
  return padded(cell.column + 1, digits.column) + padded(cell.row + 1, digits.row);
}

/** A cell's `letter-number` label (A1, B1, ... AA1). */
export function letterNumberLabel(cell: PlacedCell): string {
  return columnLetters(cell.column + 1) + String(cell.row + 1);
}

/** 1-based column to letters: 1 -> A, 26 -> Z, 27 -> AA, 53 -> BA (bijective base-26). */
function columnLetters(column: number): string {
  let n = column;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Numbers every cell of the lattice on the map; cells the map edge cuts off get no number. */
export function numberCells(lattice: CellLattice, map: MapRect, format: CellNumberFormat): NumberedCell[] {
  if (!(lattice.size > 0) || !(map.width > 0) || !(map.height > 0)) return [];
  const cells = lattice.cellsOnMap(map);

  if (format === 'sequential') {
    const readingOrder = [...cells].sort((a, b) => a.row - b.row || a.column - b.column);
    return readingOrder.map((cell, index) => ({
      key: cell.key,
      center: cell.center,
      label: String(index + 1),
    }));
  }

  if (format === 'letter-number') {
    return cells.map((cell) => ({
      key: cell.key,
      center: cell.center,
      label: letterNumberLabel(cell),
    }));
  }

  const columns = cells.reduce((most, cell) => Math.max(most, cell.column + 1), 0);
  const rows = cells.reduce((most, cell) => Math.max(most, cell.row + 1), 0);
  const digits = columnRowDigits(columns, rows);
  return cells.map((cell) => ({ key: cell.key, center: cell.center, label: columnRowLabel(cell, digits) }));
}

/** Numbered cells by their lattice key, for looking up a single cell's number. */
export function cellLabelsByKey(cells: readonly NumberedCell[]): Map<string, string> {
  return new Map(cells.map((cell) => [cell.key, cell.label]));
}

/** Where a cell's number sits: just below the top of the cell, clear of tokens and pins at its centre. */
export function cellNumberAnchor(size: number, center: Point): Point {
  return { x: center.x, y: center.y - 0.37 * size };
}

/** Font size of cell numbers in world pixels. */
export function cellNumberFontSize(size: number): number {
  return 0.16 * size;
}
