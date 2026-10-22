import { describe, expect, it } from 'vitest';
import { checkAbilityEdit } from '../../../../src/app/online/gm/book/abilityEdit.ts';
import { checkFieldEdit } from '../../../../src/app/online/gm/book/fieldEdit.ts';
import type { CheckedEdit, EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { sheetBase, type BookFieldMessage } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { resolvedOf } from './statblockSheet/sheetKit';
import { propertiesOf, templateOf } from './statblockNotes.ts';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
  { key: 'agi', label: 'Agility', type: 'number' },
  { key: 'hidden', label: 'Hidden', type: 'number' },
  { key: 'dmg', label: 'Damage', type: 'dice' },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'roll', label: 'Roll', type: 'dice' }] } },
];
const TEMPLATE: StatblockTemplate = {
  ...templateOf(FIELDS, [
    { id: 'stats000', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }] },
    { id: 'agi00000', type: 'stat', field: 'agi', look: 'run-in' },
    { id: 'hidden00', type: 'stat', field: 'hidden', look: 'run-in' },
    { id: 'dmg00000', type: 'stat', field: 'dmg', look: 'run-in' },
    { id: 'actions0', type: 'entries', field: 'actions' },
  ]),
  players: { hidden: 'hidden' },
};
const NOTE = '---\nstatblock: true\natlas-template: test-template-abc123\nname: Ana\nstats: [16, 12]\nagi: 2\nhidden: 7\ndmg: 1d6\nactions:\n  - name: Bite\n---\n';

const fields = propertiesOf(NOTE) ?? {};
const resolved = resolvedOf(TEMPLATE, fields);
const inputs: EditInputs = { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (field) => storedRead(fields, field) };
const dice = (value: string): BookFieldMessage => ({ t: 'book-field', key: 'dmg', base: sheetBase('1d6'), value });

/** The note's properties once a checked edit is written. */
function written(checked: CheckedEdit | null): Record<string, unknown> | null {
  expect(checked).not.toBeNull();
  return propertiesOf(applyFrontmatterPatches(NOTE, checked?.patches ?? []).text);
}

describe('a player\'s dice with @ references', () => {
  it('are taken where every reference names a number they may see, and stored as written', () => {
    for (const value of ['1d8+@str', '+4+@agi', '2d8 + @str.mod']) expect(written(checkFieldEdit(inputs, dice(value)))?.dmg, value).toBe(value);
  });

  it('are refused where a reference names a hidden value or nothing', () => {
    expect(checkFieldEdit(inputs, dice('1d8+@hidden'))).toBeNull();
    expect(checkFieldEdit(inputs, dice('1d8+@nope'))).toBeNull();
  });

  it('are taken in an ability\'s dice part too', () => {
    const add = (roll: string): Parameters<typeof checkAbilityEdit>[1] => ({ t: 'book-ability', op: 'add', list: 'actions', after: null, entry: { name: 'Slash', text: '', parts: { roll } } });
    expect((written(checkAbilityEdit(inputs, add('1d8 + @str.mod')))?.actions as unknown[])[0]).toEqual({ name: 'Slash', roll: '1d8 + @str.mod' });
    expect(checkAbilityEdit(inputs, add('1d8 + @hidden'))).toBeNull();
  });
});
