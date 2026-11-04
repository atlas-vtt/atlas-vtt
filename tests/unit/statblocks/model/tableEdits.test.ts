import { describe, expect, it } from 'vitest';
import {
  alignColumns, deleteColumn, deleteRow, duplicateColumn, duplicateRow, insertColumn, insertRow, moveColumn, moveRow, pasteCells,
  renameColumn, setCell, sortRows,
} from '../../../../src/app/statblocks/model/tableEdits';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, templateGrid, type TableGrid } from '../../../../src/app/statblocks/model/tableGrid';

const GRID: TableGrid = templateGrid({ slots: ['Item', 'Qty', 'Cost'], rows: [['Rope', 1, '1 sp'], ['Torch', 3], ['Lantern', 1, '5 gp']] });
const names = (grid: TableGrid): string[] => grid.columns.map((column) => column.name);

describe('a template\'s starting table', () => {
  it('is its columns over its starting rows, filled out to every column; an older template is one empty row under its names', () => {
    expect(GRID.rows).toEqual([['Rope', 1, '1 sp'], ['Torch', 3, null], ['Lantern', 1, '5 gp']]);
    expect(GRID.columns.map((column) => column.key)).toEqual(['item', 'qty', 'cost']);
    const old = templateGrid({ slots: ['STR', 'DEX'], slotKeys: ['strength'] });
    expect(old).toEqual({ columns: [{ name: 'STR', key: 'strength', align: null }, { name: 'DEX', key: 'dex', align: null }], rows: [[null, null]] });
    // A starting row wider than the names has unnamed columns for its cells.
    expect(names(templateGrid({ slots: ['A'], rows: [['x', 'y']] }))).toEqual(['A', '']);
  });
});

describe('a Table\'s edits', () => {
  it('type a cell and name a column, and change nothing where the text is the same', () => {
    expect(setCell(GRID, 1, 2, '1 cp').rows[1]).toEqual(['Torch', 3, '1 cp']);
    expect(setCell(GRID, 0, 0, 'Rope')).toBe(GRID);
    expect(setCell(GRID, 1, 2, '')).toBe(GRID);
    expect(setCell(GRID, 9, 0, 'x')).toBe(GRID);
    expect(names(renameColumn(GRID, 1, 'Count'))).toEqual(['Item', 'Count', 'Cost']);
    expect(renameColumn(GRID, 1, 'Count').columns[1]?.key).toBe('qty');
    expect(renameColumn(GRID, 1, 'Qty')).toBe(GRID);
  });

  it('add, duplicate, move and delete rows, never below one and never past the most a table holds', () => {
    expect(insertRow(GRID, 1).rows[1]).toEqual([null, null, null]);
    expect(insertRow(GRID, 3).rows).toHaveLength(4);
    expect(duplicateRow(GRID, 2).rows.slice(2)).toEqual([['Lantern', 1, '5 gp'], ['Lantern', 1, '5 gp']]);
    expect(moveRow(GRID, 0, 2).rows.map((row) => row[0])).toEqual(['Torch', 'Lantern', 'Rope']);
    expect(moveRow(GRID, 0, 0)).toBe(GRID);
    expect(moveRow(GRID, 0, 3)).toBe(GRID);
    expect(deleteRow(GRID, 1).rows.map((row) => row[0])).toEqual(['Rope', 'Lantern']);
    const one = templateGrid({ slots: ['A'] });
    expect(deleteRow(one, 0)).toBe(one);
    const full: TableGrid = { columns: one.columns, rows: Array.from({ length: MAX_TABLE_ROWS }, () => [null]) };
    expect(insertRow(full, 0)).toBe(full);
    expect(duplicateRow(full, 0)).toBe(full);
  });

  it('add, duplicate, move and delete columns with their cells, a new one aligned as asked and a copy with no key of its own', () => {
    const added = insertColumn(GRID, 1, 'end');
    expect(names(added)).toEqual(['Item', '', 'Qty', 'Cost']);
    expect(added.columns[1]?.align).toBe('end');
    expect(added.rows[0]).toEqual(['Rope', null, 1, '1 sp']);
    const copied = duplicateColumn(GRID, 0);
    expect(names(copied)).toEqual(['Item', 'Item', 'Qty', 'Cost']);
    expect(copied.columns[0]?.key).toBe('');
    expect(copied.rows[1]).toEqual(['Torch', 'Torch', 3, null]);
    const moved = moveColumn(GRID, 2, 0);
    expect(names(moved)).toEqual(['Cost', 'Item', 'Qty']);
    expect(moved.rows[0]).toEqual(['1 sp', 'Rope', 1]);
    expect(names(deleteColumn(GRID, 1))).toEqual(['Item', 'Cost']);
    const lone = templateGrid({ slots: ['A'] });
    expect(deleteColumn(lone, 0)).toBe(lone);
    const wide = templateGrid({ slots: Array.from({ length: MAX_TABLE_COLUMNS }, (_, at) => `C${at}`) });
    expect(insertColumn(wide, 0)).toBe(wide);
  });

  it('align columns, and change nothing where they are aligned so', () => {
    const centred = alignColumns(GRID, [1], 'center');
    expect(centred.columns.map((column) => column.align)).toEqual([null, 'center', null]);
    expect(alignColumns(centred, [1], 'center')).toBe(centred);
    // Left is how a column stands unless aligned: aligned left, it holds no alignment.
    expect(alignColumns(centred, [1], 'start').columns[1]?.align).toBeNull();
    expect(alignColumns(GRID, [0], 'start')).toBe(GRID);
  });

  it('sort rows as Obsidian sorts a column: numbers by size, text naturally, empty cells last, ties in their order', () => {
    const grid = templateGrid({ slots: ['Name', 'Level'], rows: [['b2', 10], ['b10', 2], ['', 1], ['a', null], ['B2', 2]] });
    expect(sortRows(grid, 1, 1).rows.map((row) => row[1])).toEqual([1, 2, 2, 10, null]);
    expect(sortRows(grid, 1, 1).rows.map((row) => row[0])).toEqual(['', 'b10', 'B2', 'b2', 'a']);
    expect(sortRows(grid, 0, 1).rows.map((row) => row[0])).toEqual(['a', 'b2', 'B2', 'b10', '']);
    expect(sortRows(grid, 0, -1).rows.map((row) => row[0])).toEqual(['b10', 'b2', 'B2', 'a', '']);
    const sorted = sortRows(grid, 1, 1);
    expect(sortRows(sorted, 1, 1)).toBe(sorted);
  });

  it('paste a block of cells from a cell on, adding rows and columns only where the room allows', () => {
    const block = [['Rations', 7, '5 sp', 'x'], ['Flint', 1]];
    const closed = pasteCells(GRID, 2, 0, block, { rows: false, columns: false });
    expect(closed.rows).toHaveLength(3);
    expect(closed.rows[2]).toEqual(['Rations', 7, '5 sp']);
    const open = pasteCells(GRID, 2, 0, block, { rows: true, columns: true });
    expect(names(open)).toEqual(['Item', 'Qty', 'Cost', '']);
    expect(open.rows.slice(2)).toEqual([['Rations', 7, '5 sp', 'x'], ['Flint', 1, null, null]]);
  });
});
