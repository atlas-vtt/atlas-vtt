import { describe, expect, it } from 'vitest';
import { checkFieldEdit } from '../../../../src/app/online/gm/book/fieldEdit.ts';
import type { EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { sheetBase, type BookFieldMessage, type BookStatblock, type SheetNode, type SheetRaw } from '../../../../src/app/online/protocol/index.ts';
import type { ResolvedStatblock } from '../../../../src/app/statblocks/model/resolvedTypes';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { propertiesOf, templateOf } from './statblockNotes.ts';

/*
 * A player's edit of a cell of a Table that holds text, as on a Daggerheart-like character sheet
 * (TYPE / DESCRIPTION / FEATURE): every cell the sheet shows them takes what they type, whether the
 * note holds the table yet or not, and their text is what the sheet shows afterwards.
 */

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'heritage', label: 'Heritage', type: 'scores', slots: ['Type', 'Description', 'Feature'] },
  { key: 'gear', label: 'Inventory', type: 'scores', slots: ['Item', 'Qty'], rows: [['Rope', 1], ['Torch', 2]] },
  { key: 'stats', label: 'Stats', type: 'scores', slots: ['A', 'B'] },
  { key: 'named', label: 'Named', type: 'scores', slots: ['A'] },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'heritage', type: 'scores', field: 'heritage', orientation: 'row' },
  { id: 'gear0000', type: 'scores', field: 'gear', orientation: 'row' },
  { id: 'stats000', type: 'scores', field: 'stats', orientation: 'row' },
  { id: 'named000', type: 'scores', field: 'named', orientation: 'row' },
];
const TEMPLATE = templateOf(FIELDS, BLOCKS);
const NOTE = '---\nstatblock: true\natlas-template: test-template-abc123\nname: Ana\n---\n';

function inputsOf(text: string): EditInputs {
  const fields = propertiesOf(text) ?? {};
  const resolved: ResolvedStatblock = {
    path: 'Characters/Ana.md', source: { kind: 'atlas', templateId: TEMPLATE.id }, fields, template: TEMPLATE, templateStatus: 'ok', lookName: 'Test', meanings: {},
  };
  return { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (field) => storedRead(fields, field) };
}

function tableOf(sent: BookStatblock | null | undefined, key: string): Extract<SheetNode, { k: 'table' }> {
  const node = sent?.blocks.find((block): block is Extract<SheetNode, { k: 'table' }> => block.k === 'table' && block.field?.key === key);
  if (!node) throw new Error(`no editable table ${key}`);
  return node;
}

/** The note once the player set one cell of `key`'s table, as their sheet offered it. */
function withCellTyped(text: string, key: string, cell: [number, number], value: SheetRaw): string {
  const table = tableOf(inputsOf(text).sent, key);
  const message: BookFieldMessage = { t: 'book-field', key, base: table.field?.base ?? sheetBase(undefined), value, cell };
  const checked = checkFieldEdit(inputsOf(text), message);
  expect(checked, `${key} ${cell.join(',')}`).not.toBeNull();
  const result = applyFrontmatterPatches(text, checked?.patches ?? []);
  expect(result.conflicts).toEqual([]);
  return result.text;
}

describe('a player typing into a cell of a Table of text', () => {
  it('fills a table the note does not hold yet, and the sheet shows what they typed', () => {
    const text = withCellTyped(NOTE, 'heritage', [0, 1], 'Tall and quiet');
    expect(propertiesOf(text)?.heritage).toEqual([null, 'Tall and quiet']);
    expect(tableOf(inputsOf(text).sent, 'heritage').rows).toEqual([[null, 'Tall and quiet', null]]);
  });

  it('takes the cells after one by one, past those the note leaves out', () => {
    let text = withCellTyped(NOTE, 'heritage', [0, 0], 'Ancestry');
    text = withCellTyped(text, 'heritage', [0, 2], 'Nimble');
    text = withCellTyped(text, 'heritage', [0, 1], 'Light on their feet');
    expect(tableOf(inputsOf(text).sent, 'heritage').rows).toEqual([['Ancestry', 'Light on their feet', 'Nimble']]);
  });

  it('changes a starting row the template gives, keeping the others', () => {
    const text = withCellTyped(NOTE, 'gear', [1, 0], 'Lantern');
    expect(tableOf(inputsOf(text).sent, 'gear').rows).toEqual([['Rope', '1'], ['Lantern', '2']]);
  });

  it('clears a cell, and the key goes once the table is back to its start', () => {
    const filled = withCellTyped(NOTE, 'heritage', [0, 0], 'Ancestry');
    const cleared = withCellTyped(filled, 'heritage', [0, 0], null);
    expect(Object.hasOwn(propertiesOf(cleared) ?? {}, 'heritage')).toBe(false);
  });

  it('refuses a cell the table does not have', () => {
    const inputs = inputsOf(NOTE);
    const base = tableOf(inputs.sent, 'heritage').field?.base ?? '';
    expect(checkFieldEdit(inputs, { t: 'book-field', key: 'heritage', base, value: 'x', cell: [0, 3] })).toBeNull();
    expect(checkFieldEdit(inputs, { t: 'book-field', key: 'heritage', base, value: 'x', cell: [1, 0] })).toBeNull();
  });

  it('refuses a cell of a table that would not come back as the note holds it, whatever the player never saw', () => {
    const refused = (yaml: string, key: string, base: SheetRaw, cell: [number, number], value: SheetRaw = 9): void => {
      const inputs = inputsOf(NOTE.replace('name: Ana\n', `name: Ana\n${yaml}\n`));
      expect(checkFieldEdit(inputs, { t: 'book-field', key, base: sheetBase(base), value, cell }), yaml).toBeNull();
    };
    // More cells in a row than a table takes: the last would be cut.
    const wide = Array.from({ length: 14 }, (_, at) => `c${at}`);
    refused(`heritage:\n  - [${wide.join(', ')}]`, 'heritage', [wide], [0, 0]);
    // Cells that are no number or text would come back as their text.
    refused('heritage:\n  - [1, { x: 2 }, z]', 'heritage', [[1, { x: 2 }, 'z']], [0, 2]);
    refused('heritage:\n  - [true, 4, z]', 'heritage', [[true, 4, 'z']], [0, 2]);
    // A row by name, or a list of pairs, holding a key outside the columns: clearing the cell would take it along.
    refused('named: { a: 1, note: hi }', 'named', { a: 1, note: 'hi' }, [0, 0], null);
    refused('named:\n  - { a: 1 }\n  - { note: hi }', 'named', [{ a: 1 }, { note: 'hi' }], [0, 0], null);
    // A flat list longer than the template's columns would become a table of columns of its own, which `stats.0` no longer reads.
    refused('stats: [1, 2, 3]', 'stats', [1, 2, 3], [0, 0]);
  });

  it('still takes a cell of a row by name or a flat list that the table holds whole', () => {
    expect(propertiesOf(withCellTyped(NOTE.replace('name: Ana\n', 'name: Ana\nnamed: { a: 1 }\n'), 'named', [0, 0], 4))?.named).toEqual({ a: 4 });
    expect(propertiesOf(withCellTyped(NOTE.replace('name: Ana\n', 'name: Ana\nstats: [1, 2]\n'), 'stats', [0, 1], 5))?.stats).toEqual([1, 5]);
  });
});
