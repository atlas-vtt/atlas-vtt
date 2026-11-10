/**
 * Edits of a Table, as Obsidian's table editor makes them: a cell typed or a
 * block of cells pasted, rows and columns added, duplicated, moved, deleted,
 * renamed, aligned and sorted. Pure; an edit that cannot be made (past the
 * last row, the table's last column, more than it holds) returns the very
 * grid, so nothing is written and no undo step is made.
 */

import {
  MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, emptyRow, fitRow, isEmptyCell, type TableColumn, type TableGrid,
} from './tableGrid';
import type { TableAlign, TableCell } from './templateTypes';

const UNNAMED: TableColumn = { name: '', key: '', align: null };

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function inRange(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/** The grid with the cell at `row`, `col` holding `value`. */
export function setCell(grid: TableGrid, row: number, col: number, value: TableCell): TableGrid {
  const current = grid.rows[row];
  if (!current || !inRange(col, grid.columns.length)) return grid;
  const same = (current[col] ?? null) === value || (isEmptyCell(current[col]) && isEmptyCell(value));
  if (same) return grid;
  return { ...grid, rows: grid.rows.map((cells, at) => (at === row ? cells.map((cell, c) => (c === col ? value : cell)) : cells)) };
}

/** The column at `col` named `name`. */
export function renameColumn(grid: TableGrid, col: number, name: string): TableGrid {
  const column = grid.columns[col];
  if (!column || column.name === name) return grid;
  return { ...grid, columns: grid.columns.map((each, at) => (at === col ? { ...each, name } : each)) };
}

export interface PasteRoom {
  /** Rows may be added for what does not fit below. */
  rows: boolean;
  /** Columns may be added for what does not fit to the right. */
  columns: boolean;
}

/**
 * The grid with `block` (rows of cells) pasted from `row`, `col` on, as a
 * spreadsheet pastes: rows and columns are added where the room allows, and
 * what still does not fit is left out.
 */
export function pasteCells(grid: TableGrid, row: number, col: number, block: readonly (readonly TableCell[])[], room: PasteRoom): TableGrid {
  if (!inRange(row, grid.rows.length) || !inRange(col, grid.columns.length) || block.length === 0) return grid;
  const widest = Math.max(...block.map((cells) => cells.length));
  const columnCount = room.columns ? Math.min(Math.max(grid.columns.length, col + widest), MAX_TABLE_COLUMNS) : grid.columns.length;
  const rowCount = room.rows ? Math.min(Math.max(grid.rows.length, row + block.length), MAX_TABLE_ROWS) : grid.rows.length;
  const columns = [...grid.columns, ...Array.from({ length: columnCount - grid.columns.length }, () => UNNAMED)];
  const rows = Array.from({ length: rowCount }, (_, r) => {
    const cells = fitRow(grid.rows[r] ?? [], columnCount);
    const pasted = block[r - row];
    if (!pasted) return cells;
    pasted.forEach((cell, offset) => { if (col + offset < columnCount) cells[col + offset] = cell; });
    return cells;
  });
  return { columns, rows };
}

/** Whether the grid takes another row. */
export function canAddRow(grid: TableGrid): boolean {
  return grid.rows.length < MAX_TABLE_ROWS;
}

/** Whether the grid takes another column. */
export function canAddColumn(grid: TableGrid): boolean {
  return grid.columns.length < MAX_TABLE_COLUMNS;
}

/** An empty row put in at `at` (the rows from there move down). */
export function insertRow(grid: TableGrid, at: number): TableGrid {
  if (!canAddRow(grid) || at < 0 || at > grid.rows.length) return grid;
  const rows = [...grid.rows];
  rows.splice(at, 0, emptyRow(grid.columns.length));
  return { ...grid, rows };
}

/** A copy of the row at `row` put in above it. */
export function duplicateRow(grid: TableGrid, row: number): TableGrid {
  const source = grid.rows[row];
  if (!source || !canAddRow(grid)) return grid;
  const rows = [...grid.rows];
  rows.splice(row, 0, [...source]);
  return { ...grid, rows };
}

/** The grid without its row at `row`; never its last one. */
export function deleteRow(grid: TableGrid, row: number): TableGrid {
  if (grid.rows.length <= 1 || !inRange(row, grid.rows.length)) return grid;
  return { ...grid, rows: grid.rows.filter((_, at) => at !== row) };
}

/** The row at `from` moved to `to` (its place counted in the grid without it). */
export function moveRow(grid: TableGrid, from: number, to: number): TableGrid {
  if (from === to || !inRange(from, grid.rows.length) || !inRange(to, grid.rows.length)) return grid;
  return { ...grid, rows: moved(grid.rows, from, to) };
}

/** An empty column put in at `at`, aligned as `align`. */
export function insertColumn(grid: TableGrid, at: number, align: TableAlign | null = null): TableGrid {
  if (!canAddColumn(grid) || at < 0 || at > grid.columns.length) return grid;
  const columns = [...grid.columns];
  columns.splice(at, 0, { ...UNNAMED, align });
  const rows = grid.rows.map((cells) => {
    const next = [...cells];
    next.splice(at, 0, null);
    return next;
  });
  return { columns, rows };
}

/** A copy of the column at `col` (its name, alignment and cells) put in before it. */
export function duplicateColumn(grid: TableGrid, col: number): TableGrid {
  const column = grid.columns[col];
  if (!column || !canAddColumn(grid)) return grid;
  const columns = [...grid.columns];
  columns.splice(col, 0, { ...column, key: '' });
  const rows = grid.rows.map((cells) => {
    const next = [...cells];
    next.splice(col, 0, cells[col] ?? null);
    return next;
  });
  return { columns, rows };
}

/** The grid without its column at `col`; never its last one. */
export function deleteColumn(grid: TableGrid, col: number): TableGrid {
  if (grid.columns.length <= 1 || !inRange(col, grid.columns.length)) return grid;
  return { columns: grid.columns.filter((_, at) => at !== col), rows: grid.rows.map((cells) => cells.filter((_, at) => at !== col)) };
}

/** The column at `from` moved to `to`, its cells with it. */
export function moveColumn(grid: TableGrid, from: number, to: number): TableGrid {
  if (from === to || !inRange(from, grid.columns.length) || !inRange(to, grid.columns.length)) return grid;
  return { columns: moved(grid.columns, from, to), rows: grid.rows.map((cells) => moved(cells, from, to)) };
}

/** The columns at `cols` aligned as `align`; `start`, which is how a column stands unless aligned, is kept as none. */
export function alignColumns(grid: TableGrid, cols: readonly number[], align: TableAlign | null): TableGrid {
  const value = align === 'start' ? null : align;
  if (cols.every((col) => { const column = grid.columns[col]; return !column || column.align === value; })) return grid;
  return { ...grid, columns: grid.columns.map((column, at) => (cols.includes(at) ? { ...column, align: value } : column)) };
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Cells compared as Obsidian sorts a column: numbers by size before text, text naturally ("2" before "10"), empty cells last. */
function compareCells(a: TableCell, b: TableCell): number {
  const emptyA = isEmptyCell(a);
  const emptyB = isEmptyCell(b);
  if (emptyA || emptyB) return Number(emptyA) - Number(emptyB);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return COLLATOR.compare(String(a), String(b));
}

/** The rows sorted by the column at `col`, A to Z (`1`) or Z to A (`-1`); rows that tie keep their order, empty cells stay last. */
export function sortRows(grid: TableGrid, col: number, direction: 1 | -1): TableGrid {
  if (!inRange(col, grid.columns.length)) return grid;
  const sorted = grid.rows
    .map((cells, index) => ({ cells, index }))
    .sort((a, b) => {
      const empty = Number(isEmptyCell(a.cells[col])) - Number(isEmptyCell(b.cells[col]));
      if (empty !== 0) return empty;
      return direction * compareCells(a.cells[col] ?? null, b.cells[col] ?? null) || a.index - b.index;
    });
  if (sorted.every((entry, at) => entry.index === at)) return grid;
  return { ...grid, rows: sorted.map((entry) => entry.cells) };
}
