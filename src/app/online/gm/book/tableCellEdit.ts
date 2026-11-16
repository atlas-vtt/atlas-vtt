import type { SheetRaw } from '../../protocol/index.ts';
import { cellOf, isEmptyCell, trimmedRow, type TableGrid } from '../../../statblocks/model/tableGrid';
import type { FieldValue, TableCell, TemplateField } from '../../../statblocks/model/templateTypes';
import { isPlainRecord } from '../../../statblocks/values/fieldValueOf';
import { isPairsList } from '../../../statblocks/values/fieldValues';
import { noteTable, tableValue } from '../../../statblocks/values/tableValues';
import { valueMisfit } from '../../../statblocks/values/valueFit';
import { deepEqual } from '../../../statblocks/notes/listIdentity';
import { isLine } from './statblockChecks.ts';

/** The field's value once its table holds `rows`: a list stays the one row of its own unnamed columns, a table keeps the note's shape (`tableValue`). */
function valueOfRows(field: TemplateField, grid: TableGrid, rows: TableCell[][], stored: FieldValue | undefined): FieldValue | undefined {
  const [only] = rows;
  if (field.type === 'list' && only !== undefined && rows.length === 1) {
    const list = trimmedRow(only);
    return list.length === 0 ? undefined : list;
  }
  return tableValue({ ...grid, rows }, field, stored);
}

const filledCells = (grid: TableGrid): number => grid.rows.reduce((count, row) => count + row.filter((cell) => !isEmptyCell(cell)).length, 0);

/**
 * Whether the table holds everything the note stores: read and written back unchanged it is the
 * same value (no cell past what a table takes, none that is no number or text, no shape it would
 * change), and a row written by name names nothing but its columns, which a cleared table would
 * otherwise take with it. A note that holds nothing yet holds nothing to lose.
 */
function holdsAll(field: TemplateField, grid: TableGrid, stored: FieldValue | undefined): boolean {
  if (stored === undefined) return true;
  if (!deepEqual(valueOfRows(field, grid, grid.rows, stored), stored)) return false;
  const named = isPlainRecord(stored) && !Array.isArray(stored.rows) ? Object.keys(stored).length : Array.isArray(stored) && isPairsList(stored) ? stored.length : null;
  return named === null || named <= filledCells(grid);
}

/**
 * A table with one cell a player set, read and written as the note's panel does (`noteTable`,
 * `tableValue`): a table the note does not hold yet starts as the template's, cells a stored row
 * leaves out are blank, and the note's shape is kept. Undefined clears the key; null where the
 * value is no cell, the table has no such cell, or writing it back would change what the player
 * never saw (`holdsAll`).
 */
export function withCell(field: TemplateField, stored: FieldValue | undefined, [row, column]: readonly [number, number], value: SheetRaw): { readonly value: FieldValue | undefined } | null {
  // A value the card shows as written, not as a table, has no cells.
  if (!(value === null || typeof value === 'number' || isLine(value)) || (stored !== undefined && valueMisfit(field, stored) !== null)) return null;
  const grid = noteTable(stored, field);
  if (row >= grid.rows.length || column >= grid.columns.length || !holdsAll(field, grid, stored)) return null;
  const cell = cellOf(value);
  const rows = grid.rows.map((cells, at) => (at === row ? cells.map((held, place) => (place === column ? cell : held)) : cells));
  return { value: valueOfRows(field, grid, rows, stored) };
}
