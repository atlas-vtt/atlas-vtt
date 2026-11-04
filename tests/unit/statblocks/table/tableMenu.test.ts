import { describe, expect, it, vi } from 'vitest';
import { findAction, fitsMenuLimit, type SurfaceAction } from '../../../../src/app/statblocks/editor/interaction/surfaceActions';
import { runTableCommand } from '../../../../src/app/statblocks/editor/table/tableCommands';
import { cellBeside, cellOver, firstCell, lastCell, stepCell, type TableRoom } from '../../../../src/app/statblocks/editor/table/tableHost';
import { cellMenu, columnHandleMenu, rowEntries } from '../../../../src/app/statblocks/editor/table/tableMenu';
import { templateGrid } from '../../../../src/app/statblocks/model/tableGrid';

const GRID = templateGrid({ slots: ['Item', 'Qty'], rows: [['Rope', 1], ['Torch', 3]] });
const ALL: TableRoom = { rows: true, columns: true, names: true, align: true };
const labels = (actions: readonly SurfaceAction[]): string[] => actions.map((action) => (action.kind === 'separator' ? '—' : action.label));

describe('a Table\'s menus', () => {
  it('give a cell Obsidian\'s Row and Column submenus and the sorts by its column, each within the menu limit', () => {
    const run = vi.fn();
    const menu = cellMenu({ grid: GRID, room: ALL, run }, { row: 0, col: 1 });
    expect(labels(menu)).toEqual(['Row', 'Column', '—', 'Sort by column (A to Z)', 'Sort by column (Z to A)']);
    const row = menu[0];
    const column = menu[1];
    expect(row?.kind === 'submenu' && labels(row.children)).toEqual(
      ['Add row above', 'Add row below', '—', 'Move row up', 'Move row down', '—', 'Duplicate row', 'Delete row'],
    );
    expect(column?.kind === 'submenu' && labels(column.children)).toEqual([
      'Add column to the left', 'Add column to the right', '—', 'Move column left', 'Move column right', '—',
      'Align left', 'Align center', 'Align right', '—', 'Duplicate column', 'Delete column',
    ]);
    expect(fitsMenuLimit(menu)).toBe(true);
    // Rows that cannot act here stay, disabled, so the menu keeps its shape.
    expect(findAction(menu, 'row-up')).toMatchObject({ disabled: true });
    expect(findAction(menu, 'col-right')).toMatchObject({ disabled: true });
    expect(findAction(menu, 'col-align-start')).toMatchObject({ checked: true });
    findAction(menu, 'row-after')?.run();
    expect(run).toHaveBeenCalledWith({ kind: 'insert-row', at: 1 });
  });

  it('leave out what the surface does not let the table change, and give a header cell no Row menu', () => {
    const run = vi.fn();
    expect(cellMenu({ grid: GRID, room: { rows: false, columns: false, names: false, align: false }, run }, { row: 0, col: 0 })).toEqual([]);
    const rowsOnly = cellMenu({ grid: GRID, room: { rows: true, columns: false, names: false, align: false }, run }, { row: 0, col: 0 });
    expect(labels(rowsOnly)).toEqual(['Row', '—', 'Sort by column (A to Z)', 'Sort by column (Z to A)']);
    expect(labels(cellMenu({ grid: GRID, room: ALL, run }, { row: -1, col: 0 }))).toEqual(['Column', '—', 'Sort by column (A to Z)', 'Sort by column (Z to A)']);
  });

  it('give a row handle the row\'s entries and a column handle the sorts and the column\'s, flat, as Obsidian\'s handles', () => {
    const input = { grid: GRID, room: ALL, run: vi.fn() };
    expect(labels(rowEntries(input, 1))[0]).toBe('Add row above');
    expect(labels(columnHandleMenu(input, 0)).slice(0, 4)).toEqual(['Sort by column (A to Z)', 'Sort by column (Z to A)', '—', 'Add column to the left']);
  });
});

describe('a Table\'s commands', () => {
  it('say what they did, and why where the table takes no more', () => {
    expect(runTableCommand(GRID, { kind: 'delete-column', col: 1 }).said).toBe('Deleted column Qty.');
    expect(runTableCommand(GRID, { kind: 'move-row', from: 0, to: 1 }).said).toBe('Moved row 1 to row 2.');
    const wide = templateGrid({ slots: Array.from({ length: 12 }, (_, at) => `C${at}`) });
    expect(runTableCommand(wide, { kind: 'insert-column', at: 0, align: null })).toMatchObject({ grid: wide, refused: 'A table holds at most 12 columns.' });
  });
});

describe('the keys\' walk through a table', () => {
  const walk = { rows: 2, cols: 2, names: true };
  it('goes through the header row\'s names where they are typed, then the rows, in reading order', () => {
    expect(firstCell(walk)).toEqual({ row: -1, col: 0 });
    expect(firstCell({ ...walk, names: false })).toEqual({ row: 0, col: 0 });
    expect(lastCell(walk)).toEqual({ row: 1, col: 1 });
    expect(stepCell(walk, { row: -1, col: 1 }, 1)).toEqual({ row: 0, col: 0 });
    expect(stepCell(walk, { row: 0, col: 0 }, -1)).toEqual({ row: -1, col: 1 });
    expect(stepCell(walk, { row: 1, col: 1 }, 1)).toBeNull();
    expect(cellOver(walk, { row: 1, col: 0 }, 1)).toBeNull();
    expect(cellOver(walk, { row: 0, col: 1 }, -1)).toEqual({ row: -1, col: 1 });
    expect(cellBeside(walk, { row: 0, col: 1 }, 1)).toBeNull();
  });
});
