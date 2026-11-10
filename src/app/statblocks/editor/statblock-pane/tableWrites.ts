/**
 * A Table in the statblock pane: what the template lets a statblock change,
 * where typing starts, and what one write of the table sends to the note.
 */

import type { CellAt, TableGrid } from '../../model/tableGrid';
import type { FieldValue, TemplateField } from '../../model/templateTypes';
import { noteTable, tableValue } from '../../values/tableValues';
import { clampCell, lastCell, walkOf, type TableRoom } from '../table/tableHost';
import type { PaneEditController } from './paneEditContext';
import { fieldPatches } from './valuePatches';

/** What a statblock may change of its Table: rows and columns where the template allows them, never alignment. */
export function paneRoom(field: TemplateField): TableRoom {
  const columns = field.addColumns !== false;
  return { rows: field.addRows !== false, columns, names: columns, align: false };
}

/**
 * The cell typing goes to in the table `value` holds: `wanted`, else for none the first row's first cell (a
 * statblock fills its rows; its column names, where it names its own, are a Shift+Tab away), the last for `last`.
 */
export function tableCell(field: TemplateField, value: FieldValue | undefined, wanted: CellAt | 'last' | undefined): CellAt {
  const walk = walkOf(noteTable(value, field), field.header !== false, paneRoom(field));
  if (wanted === undefined) return clampCell(walk, { row: 0, col: 0 });
  return wanted === 'last' ? lastCell(walk) : clampCell(walk, wanted);
}

/** Writes the table as `grid`: one write of the whole value, in the shape the note holds it in (`tableValues`). */
export async function writeTable(pane: PaneEditController, field: TemplateField, grid: TableGrid): Promise<void> {
  const read = pane.readFresh(field);
  const next = tableValue(grid, field, read.value);
  await pane.write(field, fieldPatches(field.key, read, next), { base: read.value, mine: next });
}
