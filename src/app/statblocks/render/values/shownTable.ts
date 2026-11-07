import { noteTable } from '../../values/tableValues';
import { cellOf, type TableColumn, type TableGrid } from '../../model/tableGrid';
import type { FieldValue, ScoreColumn, ScoresBlock, TableCell, TemplateField } from '../../model/templateTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { formatSigned, numericValue } from '../../values/numberText';
import { pairValue } from '../../values/pairValues';
import { valueMisfit } from '../../values/valueFit';
import type { BlockDisplay } from '../blockDisplay';
import type { SheetState } from '../sheetState';
import { NO_TEXT, shownPattern, type ShownText } from './shownText';

/** A worked-out row: its label ("Mod") and its value under each column. */
export interface DerivedRow {
  label: string;
  cells: ShownText[];
}

/** A Table as the card draws it. */
export interface ShownTable {
  /** What the table holds: its columns and its cells as stored. */
  grid: TableGrid;
  /** Whether the header row of column names is drawn. */
  header: boolean;
  /** What each cell shows, row by row. */
  cells: ShownText[][];
  /** Its worked-out rows, drawn while it holds one row. */
  derived: DerivedRow[];
  /** Whether a whole number in a cell or worked-out cell rolls as a bonus (`ScoresBlock.rollable`). */
  rollable?: boolean | undefined;
}

function shownCell(cell: TableCell, signed: boolean): ShownText {
  if (cell === null || (typeof cell === 'string' && cell.trim() === '')) return NO_TEXT;
  const number = signed ? numericValue(cell) : null;
  return { text: number === null ? String(cell) : formatSigned(number), problems: [] };
}

/** A value written as text ("—", "d8"): no formula is worked out over it. */
function isTextCell(cell: TableCell): boolean {
  return cell !== null && !isEmptyValue(cell) && numericValue(cell) === null;
}

/**
 * A worked-out row's value under one column: the column's entry in the row's
 * pairs field, else its formula over the column's value. A cell written as text
 * shows no formula's value.
 */
function derivedCell(row: ScoreColumn, column: TableColumn, cell: TableCell, sheet: SheetState): ShownText {
  const signed = row.display === 'signed';
  if (row.field) {
    const pair = pairValue(sheet.reader(row.field), column.key || undefined, column.name || undefined);
    if (pair !== undefined && !isEmptyValue(pair)) return shownCell(cellOf(pair), signed);
  }
  if (!row.formula?.trim() || isTextCell(cell)) return NO_TEXT;
  const value: FieldValue = cell;
  return shownPattern(`{=${row.formula}${signed ? '|signed' : ''}}`, sheet, undefined, { value, slotLabel: column.name });
}

/** The table `grid` as `block` draws it for the statblock: its cells as they show, its worked-out rows. */
export function shownGrid(block: ScoresBlock, field: TemplateField, grid: TableGrid, sheet: SheetState): ShownTable {
  const signed = block.display === 'signed';
  const [only] = grid.rows;
  const derived = grid.rows.length === 1 && only
    ? (block.columns ?? []).map((row) => ({
      label: row.label ?? '',
      cells: grid.columns.map((column, at) => derivedCell(row, column, only[at] ?? null, sheet)),
    }))
    : [];
  return {
    grid,
    header: field.header !== false,
    cells: grid.rows.map((row) => row.map((cell) => shownCell(cell, signed))),
    derived,
    ...(block.rollable && { rollable: true }),
  };
}

/**
 * The table a Table block draws: its values, or while a statblock is filled
 * in an empty table's columns over blank cells, so the card keeps its shape
 * and says what goes where. Null where it draws something else: a prompt or
 * a fallback in its place, a value that holds no table (shown as written), or
 * a table without columns.
 */
export function shownTable(block: ScoresBlock, display: BlockDisplay, sheet: SheetState): ShownTable | null {
  const field: TemplateField = sheet.fields.get(block.field) ?? { key: block.field, label: block.field, type: 'scores' };
  const value = sheet.reader(block.field);
  if (display.state === 'fallback' || (display.state === 'value' && valueMisfit(field, value))) return null;
  const grid = noteTable(value, field);
  return grid.columns.length > 0 ? shownGrid(block, field, grid, sheet) : null;
}

/**
 * The columns in `perLine` groups for the one-row look, each group a column
 * of the card: with three per line, Str and Int share the first.
 */
export function columnGroups<T>(items: readonly T[], perLine: number | undefined): T[][] {
  const count = Math.max(1, Math.min(Math.floor(perLine ?? 1), items.length || 1));
  const groups: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => groups[index % count]?.push(item));
  return groups;
}
