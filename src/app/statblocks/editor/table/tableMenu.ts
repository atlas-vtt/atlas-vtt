/**
 * A Table's menus, with Obsidian's entries in Obsidian's order: a cell's
 * (Row ›, Column ›, then the two sorts), a row handle's and a column
 * handle's. Rows the surface does not let the table change are left out
 * (the statblock pane of a template that fixes the rows or columns); rows
 * that cannot act here stay, disabled, so a menu keeps its shape.
 */

import { canAddColumn, canAddRow } from '../../model/tableEdits';
import { HEADER_ROW, type CellAt, type TableGrid } from '../../model/tableGrid';
import type { TableAlign } from '../../model/templateTypes';
import { SEPARATOR, tidy, type SurfaceAction } from '../interaction/surfaceActions';
import type { TableCommand } from './tableCommands';
import type { TableRoom } from './tableHost';
import { t } from '../../../i18n';

export interface TableMenuInput {
  grid: TableGrid;
  room: TableRoom;
  run: (command: TableCommand) => void;
}

function item(id: string, label: string, icon: string, run: () => void, disabled = false): SurfaceAction {
  return { kind: 'item', id, label, icon, run, disabled };
}

const ALIGNS: readonly { align: TableAlign; label: string; icon: string }[] = [
  { align: 'start', label: t('statblockEditor.table.alignLeft'), icon: 'align-left' },
  { align: 'center', label: t('statblockEditor.table.alignCenter'), icon: 'align-center' },
  { align: 'end', label: t('statblockEditor.table.alignRight'), icon: 'align-right' },
];

/** Add, move, duplicate and delete the row `row`. */
export function rowEntries({ grid, room, run }: TableMenuInput, row: number): SurfaceAction[] {
  if (!room.rows || row < 0) return [];
  const full = !canAddRow(grid);
  const last = grid.rows.length - 1;
  return [
    item('row-before', t('statblockEditor.table.addRowAbove'), 'panel-top-close', () => run({ kind: 'insert-row', at: row }), full),
    item('row-after', t('statblockEditor.table.addRowBelow'), 'panel-bottom-close', () => run({ kind: 'insert-row', at: row + 1 }), full),
    SEPARATOR,
    item('row-up', t('statblockEditor.table.moveRowUp'), 'arrow-up', () => run({ kind: 'move-row', from: row, to: row - 1 }), row === 0),
    item('row-down', t('statblockEditor.table.moveRowDown'), 'arrow-down', () => run({ kind: 'move-row', from: row, to: row + 1 }), row === last),
    SEPARATOR,
    item('row-copy', t('statblockEditor.table.duplicateRow'), 'copy', () => run({ kind: 'duplicate-row', row }), full),
    item('row-delete', t('statblockEditor.table.deleteRow'), 'trash-2', () => run({ kind: 'delete-row', row }), last === 0),
  ];
}

/** Add, move, align, duplicate and delete the column `col`. */
export function columnEntries({ grid, room, run }: TableMenuInput, col: number): SurfaceAction[] {
  const full = !canAddColumn(grid);
  const last = grid.columns.length - 1;
  const align = grid.columns[col]?.align ?? null;
  const shape = room.columns ? [
    item('col-before', t('statblockEditor.table.addColumnLeft'), 'panel-left-close', () => run({ kind: 'insert-column', at: col, align }), full),
    item('col-after', t('statblockEditor.table.addColumnRight'), 'panel-right-close', () => run({ kind: 'insert-column', at: col + 1, align }), full),
    SEPARATOR,
    item('col-left', t('statblockEditor.table.moveColumnLeft'), 'arrow-left', () => run({ kind: 'move-column', from: col, to: col - 1 }), col === 0),
    item('col-right', t('statblockEditor.table.moveColumnRight'), 'arrow-right', () => run({ kind: 'move-column', from: col, to: col + 1 }), col === last),
    SEPARATOR,
  ] : [];
  const aligns = room.align ? ALIGNS.map(({ align: to, label, icon }): SurfaceAction => ({
    kind: 'item', id: `col-align-${to}`, label, icon, checked: (align ?? 'start') === to, run: () => run({ kind: 'align', col, align: to }),
  })) : [];
  const copies = room.columns ? [
    SEPARATOR,
    item('col-copy', t('statblockEditor.table.duplicateColumn'), 'copy', () => run({ kind: 'duplicate-column', col }), full),
    item('col-delete', t('statblockEditor.table.deleteColumn'), 'trash-2', () => run({ kind: 'delete-column', col }), last === 0),
  ] : [];
  return tidy([...shape, ...aligns, ...copies]);
}

/** Sort the rows by the column `col`, A to Z and Z to A. */
export function sortEntries({ grid, room, run }: TableMenuInput, col: number): SurfaceAction[] {
  if (!room.rows) return [];
  const one = grid.rows.length < 2;
  return [
    item('sort-a-z', t('statblockEditor.table.sortAZ'), 'arrow-down-a-z', () => run({ kind: 'sort', col, direction: 1 }), one),
    item('sort-z-a', t('statblockEditor.table.sortZA'), 'arrow-up-z-a', () => run({ kind: 'sort', col, direction: -1 }), one),
  ];
}

/** A cell's menu: Row › and Column ›, then the sorts by its column. The header row's cells have no Row ›. */
export function cellMenu(input: TableMenuInput, at: CellAt): SurfaceAction[] {
  const row = at.row === HEADER_ROW ? [] : rowEntries(input, at.row);
  const column = columnEntries(input, at.col);
  return tidy([
    ...(row.length ? [{ kind: 'submenu' as const, id: 'row', label: t('statblockEditor.table.row'), icon: 'table', children: row }] : []),
    ...(column.length ? [{ kind: 'submenu' as const, id: 'column', label: t('statblockEditor.table.column'), icon: 'table', children: column }] : []),
    SEPARATOR,
    ...sortEntries(input, at.col),
  ]);
}

/** A column handle's menu: the sorts, then the column's own entries, as Obsidian's. */
export function columnHandleMenu(input: TableMenuInput, col: number): SurfaceAction[] {
  return tidy([...sortEntries(input, col), SEPARATOR, ...columnEntries(input, col)]);
}
