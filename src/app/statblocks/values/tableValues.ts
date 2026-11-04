/**
 * How a Table lives in a note's frontmatter. The rule, simplest shape first:
 *
 * - No value: the statblock shows its template's starting table; nothing is
 *   written until it is edited.
 * - One row under the template's columns: a flat list in column order, as
 *   Fantasy Statblocks writes ability scores (`stats: [14, 12, 13]`), so
 *   `stats.0` reads a cell. A note that writes the row by name (a record
 *   `{ str: 14 }` or a list of `{ strength: 14 }`) keeps that shape.
 * - Several rows under the template's columns: a list of rows, each a list of
 *   cells in column order (`- [Sword, 1, 1d8]`). A note that once held several
 *   rows keeps this shape down to one.
 * - Columns of its own (added, deleted, moved or renamed in the statblock): a
 *   record of its column names and its rows,
 *   `{ columns: [Item, Qty], rows: [[Rope, 1]] }`; an unnamed column is `''`.
 *
 * Cells are read by place, so renaming a template's column changes no note;
 * a statblock that names its own columns keeps its names whatever the template
 * does. Cells past the template's columns (a column the template removed
 * since) show under unnamed columns, never dropped. A table cleared back to an
 * empty starting table deletes its key.
 * Pure: no React, no Obsidian.
 */

import {
  MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, cellOf, emptyRow, fitRow, gridIsEmpty, isEmptyCell, namedColumns, sameGrid, templateColumns,
  templateGrid, trimmedRow, type TableColumn, type TableGrid, type TableShape,
} from '../model/tableGrid';
import type { FieldValue, TableCell } from '../model/templateTypes';
import { isPlainRecord } from './fieldValueOf';
import { isPairsList, scoreIn, slotKeyOf } from './fieldValues';

type TableField = TableShape;

/** `{ columns, rows }`: a statblock's table with columns of its own. */
function isTableRecord(value: FieldValue | undefined): value is { columns?: FieldValue; rows: FieldValue[] } {
  return isPlainRecord(value) && Array.isArray(value.rows) && (value.columns === undefined || Array.isArray(value.columns));
}

/** A list of rows: a list holding lists. */
function isRowList(value: FieldValue | undefined): boolean {
  return Array.isArray(value) && value.some((item) => Array.isArray(item));
}

function rowsOf(list: readonly FieldValue[]): TableCell[][] {
  return list.slice(0, MAX_TABLE_ROWS).map((item) => (Array.isArray(item) ? item.map(cellOf) : [cellOf(item)]));
}

/** The template's columns, then unnamed ones for cells past them. */
function widened(columns: readonly TableColumn[], rows: readonly TableCell[][]): TableColumn[] {
  const count = Math.min(Math.max(columns.length, ...rows.map((row) => row.length)), MAX_TABLE_COLUMNS);
  return Array.from({ length: count }, (_, at) => columns[at] ?? { name: '', key: '', align: null });
}

function gridOf(columns: TableColumn[], rows: TableCell[][]): TableGrid {
  const fitted = rows.map((row) => fitRow(row, columns.length));
  return { columns, rows: fitted.length > 0 ? fitted : [emptyRow(columns.length)] };
}

/** The table a field's value holds; the template's starting table where it holds none. */
export function noteTable(value: FieldValue | undefined, field: TableField): TableGrid {
  if (value === undefined || value === null) return templateGrid(field);
  if (isTableRecord(value)) {
    const names = Array.isArray(value.columns) ? value.columns.slice(0, MAX_TABLE_COLUMNS).map((name) => String(cellOf(name) ?? '')) : null;
    const rows = isRowList(value.rows) ? rowsOf(value.rows) : [value.rows.map(cellOf)];
    return gridOf(widened(names ? namedColumns(names, field) : templateColumns(field), rows), rows);
  }
  if (Array.isArray(value) && isRowList(value)) {
    const rows = rowsOf(value);
    return gridOf(widened(templateColumns(field), rows), rows);
  }
  // One row: a list by place, or the cells written by name.
  const columns = templateColumns(field);
  const count = Array.isArray(value) && !isPairsList(value) ? Math.max(columns.length, value.length) : columns.length;
  const row = Array.from({ length: Math.min(count, MAX_TABLE_COLUMNS) }, (_, at) => cellOf(scoreIn(value, field, at)));
  return gridOf(widened(columns, [row]), [row]);
}

/** Whether the grid's columns are the template's, by count and name: the cells alone are then written. */
function hasTemplateColumns(grid: TableGrid, field: TableField): boolean {
  const own = templateColumns(field);
  return grid.columns.length === own.length && grid.columns.every((column, at) => column.name === own[at]?.name);
}

/** The name a cell is written under in a record or pairs list: one the note already uses for it, else its key. */
function nameIn(names: readonly string[], field: TableField, index: number): string | undefined {
  const wanted = [slotKeyOf(field, index), field.slots?.[index]].flatMap((name) => (name?.trim() ? [name.trim().toLowerCase()] : []));
  return names.find((name) => wanted.includes(name.trim().toLowerCase())) ?? slotKeyOf(field, index);
}

/** One row in the shape a record by name holds it: each cell under its column's key, an emptied cell's key gone. */
function inRecord(record: Readonly<Record<string, FieldValue>>, field: TableField, row: readonly TableCell[]): FieldValue {
  const next: Record<string, FieldValue> = { ...record };
  row.forEach((cell, at) => {
    const name = nameIn(Object.keys(next), field, at);
    if (!name) return;
    if (isEmptyCell(cell)) delete next[name];
    else next[name] = cell;
  });
  return next;
}

/** One row in the shape a list of one-key records holds it (`[{ strength: 18 }]`). */
function inPairs(list: readonly FieldValue[], field: TableField, row: readonly TableCell[]): FieldValue {
  let next = [...list];
  row.forEach((cell, at) => {
    const names = next.map((item) => (isPlainRecord(item) ? Object.keys(item)[0] ?? '' : ''));
    const name = nameIn(names.filter(Boolean), field, at);
    if (!name) return;
    const index = names.indexOf(name);
    if (isEmptyCell(cell)) next = next.filter((_, kept) => kept !== index);
    else if (index < 0) next.push({ [name]: cell });
    else next[index] = { [name]: cell };
  });
  return next;
}

/** One row in the shape the note holds it in: by name where it writes names, else a flat list. */
function oneRow(row: readonly TableCell[], field: TableField, previous: FieldValue | undefined): FieldValue {
  if (Array.isArray(previous) && isPairsList(previous)) return inPairs(previous, field, row);
  if (isPlainRecord(previous) && !isTableRecord(previous)) return inRecord(previous, field, row);
  return trimmedRow(row);
}

/**
 * What a field holds once its table is `grid`, in the shape the module's rule
 * gives it (`previous` is what the note held, whose shape is kept); undefined
 * clears the key.
 */
export function tableValue(grid: TableGrid, field: TableField, previous: FieldValue | undefined): FieldValue | undefined {
  if (!hasTemplateColumns(grid, field)) {
    return { columns: grid.columns.map((column) => column.name), rows: grid.rows.map(trimmedRow) };
  }
  const start = templateGrid(field);
  if (gridIsEmpty(grid) && sameGrid({ ...grid, columns: start.columns }, start)) return undefined;
  const [first] = grid.rows;
  const keptRows = isRowList(previous) || isTableRecord(previous);
  if (grid.rows.length === 1 && first && !keptRows) return oneRow(first, field, previous);
  return grid.rows.map(trimmedRow);
}

/** The template's starting table as a note would hold it, where it holds any cell; the card shows it for a statblock without a value. */
export function startTableValue(field: TableField): FieldValue | undefined {
  const start = templateGrid(field);
  if (gridIsEmpty(start)) return undefined;
  return tableValue(start, field, undefined);
}
