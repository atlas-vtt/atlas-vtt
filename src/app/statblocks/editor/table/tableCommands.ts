/**
 * The edits a Table's menus, handles and add buttons make, as Obsidian's table
 * editor names them, each with what the live region says of it. Pure.
 */

import {
  alignColumns, canAddColumn, canAddRow, deleteColumn, deleteRow, duplicateColumn, duplicateRow, insertColumn, insertRow, moveColumn,
  moveRow, sortRows,
} from '../../model/tableEdits';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, type TableGrid } from '../../model/tableGrid';
import type { TableAlign } from '../../model/templateTypes';
import { t } from '../../../i18n';

export type TableCommand =
  | { kind: 'insert-row'; at: number }
  | { kind: 'duplicate-row'; row: number }
  | { kind: 'delete-row'; row: number }
  | { kind: 'move-row'; from: number; to: number }
  | { kind: 'insert-column'; at: number; align: TableAlign | null }
  | { kind: 'duplicate-column'; col: number }
  | { kind: 'delete-column'; col: number }
  | { kind: 'move-column'; from: number; to: number }
  | { kind: 'align'; col: number; align: TableAlign }
  | { kind: 'sort'; col: number; direction: 1 | -1 };

export interface CommandOutcome {
  grid: TableGrid;
  /** What the live region says of a change. */
  said: string;
  /** Why the table took no change it was asked for (it holds as many rows or columns as it takes). */
  refused?: string | undefined;
}


/** "column Str" or "column 3" where it has no name. */
function columnWords(grid: TableGrid, col: number): string {
  const name = grid.columns[col]?.name.trim();
  return name ? t('statblockEditor.table.columnWordsNamed', { name }) : t('statblockEditor.table.columnWordsN', { n: col + 1 });
}

/** The table after `command`, and what to say; the very grid where the command changes nothing. */
export function runTableCommand(grid: TableGrid, command: TableCommand): CommandOutcome {
  switch (command.kind) {
    case 'insert-row': {
      if (!canAddRow(grid)) return { grid, said: '', refused: t('statblockEditor.table.rowsFull', { count: MAX_TABLE_ROWS }) };
      return { grid: insertRow(grid, command.at), said: t('statblockEditor.table.addedRow', { n: command.at + 1 }) };
    }
    case 'duplicate-row': return { grid: duplicateRow(grid, command.row), said: t('statblockEditor.table.duplicatedRow', { n: command.row + 1 }) };
    case 'delete-row': return { grid: deleteRow(grid, command.row), said: t('statblockEditor.table.deletedRow', { n: command.row + 1 }) };
    case 'move-row': return { grid: moveRow(grid, command.from, command.to), said: t('statblockEditor.table.movedRow', { from: command.from + 1, to: command.to + 1 }) };
    case 'insert-column': {
      if (!canAddColumn(grid)) return { grid, said: '', refused: t('statblockEditor.table.columnsFull', { count: MAX_TABLE_COLUMNS }) };
      return { grid: insertColumn(grid, command.at, command.align), said: t('statblockEditor.table.addedColumn', { n: command.at + 1 }) };
    }
    case 'duplicate-column': return { grid: duplicateColumn(grid, command.col), said: t('statblockEditor.table.duplicated', { column: columnWords(grid, command.col) }) };
    case 'delete-column': return { grid: deleteColumn(grid, command.col), said: t('statblockEditor.table.deleted', { column: columnWords(grid, command.col) }) };
    case 'move-column': return { grid: moveColumn(grid, command.from, command.to), said: t('statblockEditor.table.moved', { column: columnWords(grid, command.from) }) };
    case 'align': return { grid: alignColumns(grid, [command.col], command.align), said: (command.align === 'start' ? t('statblockEditor.table.alignedLeft', { column: columnWords(grid, command.col) }) : command.align === 'end' ? t('statblockEditor.table.alignedRight', { column: columnWords(grid, command.col) }) : t('statblockEditor.table.alignedCenter', { column: columnWords(grid, command.col) })) };
    case 'sort': {
      const sorted = sortRows(grid, command.col, command.direction);
      return { grid: sorted, said: command.direction > 0 ? t('statblockEditor.table.sortedAZ', { column: columnWords(grid, command.col) }) : t('statblockEditor.table.sortedZA', { column: columnWords(grid, command.col) }) };
    }
  }
}
