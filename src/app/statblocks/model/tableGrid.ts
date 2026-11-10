/**
 * A Table as rows of cells under named columns (`TableGrid`), and the
 * starting table a template gives its statblocks: the field's column names
 * (`slots`), their keys (`slotKeys`), their alignments and its starting rows.
 * Pure: the editors change grids (`tableEdits`), and the note's value and the
 * template's field are read into grids and written back from them
 * (`tableValues`, `tableColumns`).
 */

import type { FieldValue, TableAlign, TableCell, TemplateField } from './templateTypes';

/** The most columns a Table takes. */
export const MAX_TABLE_COLUMNS = 12;
/** The most rows a Table takes. */
export const MAX_TABLE_ROWS = 100;

export interface TableColumn {
  /** Its name in the header row; '' while it has none. */
  name: string;
  /** The key a value written by name reads it by (`slotKeys`); '' for a column not named yet. */
  key: string;
  align: TableAlign | null;
}

export interface TableGrid {
  columns: TableColumn[];
  /** Each row holds one cell per column. */
  rows: TableCell[][];
}

/** A cell by its place: `row` -1 is the header row, which holds the columns' names. */
export interface CellAt {
  row: number;
  col: number;
}

export const HEADER_ROW = -1;

export type TableShape = Pick<TemplateField, 'slots' | 'slotKeys' | 'align' | 'rows'>;

/** A value as a cell holds it: numbers and text as they are, anything else as nothing or its text. */
export function cellOf(value: FieldValue | undefined): TableCell {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function isEmptyCell(cell: TableCell | undefined): boolean {
  return cell === undefined || cell === null || (typeof cell === 'string' && cell.trim() === '');
}

/** `count` empty cells. */
export function emptyRow(count: number): TableCell[] {
  return Array.from({ length: count }, () => null);
}

/** The row with exactly `count` cells: cut, or filled with empty ones. */
export function fitRow(row: readonly TableCell[], count: number): TableCell[] {
  return Array.from({ length: count }, (_, at) => row[at] ?? null);
}

/** The column of the template at `index`: its name, key and alignment. */
function templateColumn(field: TableShape, index: number): TableColumn {
  const name = field.slots?.[index] ?? '';
  return { name, key: field.slotKeys?.[index] ?? name.toLowerCase(), align: field.align?.[index] ?? null };
}

/** The template's columns, as many as it names or its starting rows fill. */
export function templateColumns(field: TableShape): TableColumn[] {
  const widest = Math.max(0, ...(field.rows ?? []).map((row) => row.length));
  const count = Math.min(Math.max(field.slots?.length ?? 0, widest), MAX_TABLE_COLUMNS);
  return Array.from({ length: count }, (_, index) => templateColumn(field, index));
}

/** The table every statblock of the template starts with: its columns over its starting rows, one empty row where it gives none. */
export function templateGrid(field: TableShape): TableGrid {
  const columns = templateColumns(field);
  const rows = (field.rows ?? []).slice(0, MAX_TABLE_ROWS).map((row) => fitRow(row, columns.length));
  return { columns, rows: rows.length > 0 ? rows : [emptyRow(columns.length)] };
}

/**
 * Columns as a statblock that names its own reads them: each takes the
 * alignment and key of the template's column of the same name (in any case),
 * else none.
 */
export function namedColumns(names: readonly string[], field: TableShape): TableColumn[] {
  const known = templateColumns(field);
  return names.map((name) => {
    const match = known.find((column) => column.name.trim().toLowerCase() === name.trim().toLowerCase() && name.trim() !== '');
    return { name, key: match?.key ?? '', align: match?.align ?? null };
  });
}

/** Whether every cell of the grid is empty. */
export function gridIsEmpty(grid: TableGrid): boolean {
  return grid.rows.every((row) => row.every(isEmptyCell));
}

/** Whether two grids hold the same columns (names, keys, alignments) and the same cells. */
export function sameGrid(a: TableGrid, b: TableGrid): boolean {
  if (a === b) return true;
  if (a.columns.length !== b.columns.length || a.rows.length !== b.rows.length) return false;
  const sameColumns = a.columns.every((column, at) => {
    const other = b.columns[at];
    return other !== undefined && other.name === column.name && other.key === column.key && other.align === column.align;
  });
  return sameColumns && a.rows.every((row, r) => row.every((cell, c) => cell === (b.rows[r]?.[c] ?? null)));
}

/** The row without the empty cells at its end, as a file writes it. */
export function trimmedRow(row: readonly TableCell[]): TableCell[] {
  let end = row.length;
  while (end > 0 && isEmptyCell(row[end - 1])) end -= 1;
  return row.slice(0, end).map((cell) => (isEmptyCell(cell) ? null : cell));
}
