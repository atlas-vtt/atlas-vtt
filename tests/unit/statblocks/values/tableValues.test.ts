import { describe, expect, it } from 'vitest';
import { deleteColumn, insertColumn, insertRow, moveColumn, renameColumn, setCell } from '../../../../src/app/statblocks/model/tableEdits';
import { templateGrid } from '../../../../src/app/statblocks/model/tableGrid';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { readerFor } from '../../../../src/app/statblocks/values/fieldValues';
import { noteTable, startTableValue, tableValue } from '../../../../src/app/statblocks/values/tableValues';

const STATS: TemplateField = {
  key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON'], slotKeys: ['strength', 'dexterity', 'constitution'],
};
const LOOT: TemplateField = { key: 'loot', label: 'Loot', type: 'scores', slots: ['Item', 'Qty'], rows: [['Rope', 1]] };
const names = (field: TemplateField, value: unknown): string[] => noteTable(value as never, field).columns.map((column) => column.name);

describe('a Table read from a note', () => {
  it('is the template\'s starting table where the note holds no value', () => {
    expect(noteTable(undefined, LOOT)).toEqual(templateGrid(LOOT));
    expect(noteTable(null, LOOT).rows).toEqual([['Rope', 1]]);
  });

  it('reads a flat list as its one row, by place, as Fantasy Statblocks writes ability scores', () => {
    expect(noteTable([14, 12, 13], STATS).rows).toEqual([[14, 12, 13]]);
    expect(noteTable([14], STATS).rows).toEqual([[14, null, null]]);
    // Cells past the template's columns show under unnamed columns, never dropped.
    expect(names(STATS, [14, 12, 13, 9])).toEqual(['STR', 'DEX', 'CON', '']);
  });

  it('reads a row written by name: a record by key or name, or a list of one-key records', () => {
    expect(noteTable({ strength: 18, DEX: 12 }, STATS).rows).toEqual([[18, 12, null]]);
    expect(noteTable([{ constitution: 15 }, { strength: 8 }], STATS).rows).toEqual([[8, null, 15]]);
  });

  it('reads a list of rows, each a list of cells in column order', () => {
    expect(noteTable([['Rope', 1], ['Torch', 3, 'extra']], LOOT)).toMatchObject({ rows: [['Rope', 1, null], ['Torch', 3, 'extra']] });
    expect(names(LOOT, [['Rope', 1], ['Torch', 3, 'extra']])).toEqual(['Item', 'Qty', '']);
  });

  it('reads columns of the statblock\'s own by their names, each aligned as the template\'s column of that name', () => {
    const field: TemplateField = { ...LOOT, align: [null, 'end'] };
    const grid = noteTable({ columns: ['Qty', 'Item', 'Weight'], rows: [[1, 'Rope', 5]] }, field);
    expect(grid.columns).toEqual([{ name: 'Qty', key: 'qty', align: 'end' }, { name: 'Item', key: 'item', align: null }, { name: 'Weight', key: '', align: null }]);
    expect(grid.rows).toEqual([[1, 'Rope', 5]]);
  });
});

describe('a Table written to a note', () => {
  it('keeps a one-row table under the template\'s columns a flat list, the shape stats.0 reads', () => {
    const stored = [14, 12, 13];
    const value = tableValue(setCell(noteTable(stored, STATS), 0, 1, 16), STATS, stored);
    expect(value).toEqual([14, 16, 13]);
    expect(readerFor({ stats: value }, [STATS])('stats.1')).toBe(16);
    // Empty cells at the end are not written, those before a value are null.
    expect(tableValue(setCell(noteTable(stored, STATS), 0, 2, null), STATS, stored)).toEqual([14, 12]);
    expect(tableValue(setCell(noteTable(stored, STATS), 0, 0, null), STATS, stored)).toEqual([null, 12, 13]);
  });

  it('keeps a row written by name in its shape', () => {
    const record = { strength: 18, wis: 3 };
    expect(tableValue(setCell(noteTable(record, STATS), 0, 1, 12), STATS, record)).toEqual({ strength: 18, wis: 3, dexterity: 12 });
    const pairs = [{ strength: 18 }];
    expect(tableValue(setCell(noteTable(pairs, STATS), 0, 0, 10), STATS, pairs)).toEqual([{ strength: 10 }]);
  });

  it('writes a list of rows once the table holds several, and keeps that shape down to one row', () => {
    const grown = insertRow(noteTable([14, 12, 13], STATS), 1);
    const rows = tableValue(setCell(grown, 1, 0, 9), STATS, [14, 12, 13]);
    expect(rows).toEqual([[14, 12, 13], [9]]);
    const back = noteTable(rows as never, STATS);
    expect(tableValue({ ...back, rows: back.rows.slice(0, 1) }, STATS, rows as never)).toEqual([[14, 12, 13]]);
  });

  it('writes the statblock\'s own column names with its rows where its columns are not the template\'s', () => {
    const start = noteTable(undefined, LOOT);
    const added = renameColumn(insertColumn(start, 2), 2, 'Weight');
    expect(tableValue(added, LOOT, undefined)).toEqual({ columns: ['Item', 'Qty', 'Weight'], rows: [['Rope', 1]] });
    expect(tableValue(deleteColumn(start, 1), LOOT, undefined)).toEqual({ columns: ['Item'], rows: [['Rope']] });
    expect(tableValue(moveColumn(start, 1, 0), LOOT, undefined)).toEqual({ columns: ['Qty', 'Item'], rows: [[1, 'Rope']] });
    // A column added at the end and not named yet is the statblock's own too, kept while it is empty.
    expect(tableValue(insertColumn(start, 2), LOOT, undefined)).toEqual({ columns: ['Item', 'Qty', ''], rows: [['Rope', 1]] });
  });

  it('follows the template\'s renamed columns where the statblock names none of its own, and keeps its own names otherwise', () => {
    const renamed: TemplateField = { ...LOOT, slots: ['Gear', 'Count'] };
    expect(names(renamed, [['Rope', 1]])).toEqual(['Gear', 'Count']);
    expect(names(renamed, { columns: ['Item', 'Qty'], rows: [['Rope', 1]] })).toEqual(['Item', 'Qty']);
  });

  it('gives a statblock that showed the starting table a copy of its own with its first edit', () => {
    expect(tableValue(setCell(noteTable(undefined, LOOT), 0, 1, 2), LOOT, undefined)).toEqual(['Rope', 2]);
    expect(tableValue(insertRow(noteTable(undefined, LOOT), 1), LOOT, undefined)).toEqual([['Rope', 1], []]);
  });

  it('clears the key where the table is its template\'s empty starting table again, and writes an emptied copy where it is not', () => {
    expect(tableValue(setCell(noteTable([14], STATS), 0, 0, null), STATS, [14])).toBeUndefined();
    const cleared = setCell(setCell(noteTable(undefined, LOOT), 0, 0, null), 0, 1, null);
    const value = tableValue(cleared, LOOT, undefined);
    expect(value).toEqual([]);
    expect(noteTable(value, LOOT).rows).toEqual([[null, null]]);
  });

  it('starts the card on the starting table as a note would hold it, and on nothing where it holds no cell', () => {
    expect(startTableValue(LOOT)).toEqual(['Rope', 1]);
    expect(startTableValue({ ...LOOT, rows: [['Rope', 1], ['Torch']] })).toEqual([['Rope', 1], ['Torch']]);
    expect(startTableValue(STATS)).toBeUndefined();
  });
});
