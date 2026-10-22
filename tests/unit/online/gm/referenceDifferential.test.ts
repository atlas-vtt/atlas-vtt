import { describe, expect, it } from 'vitest';
import { checkAbilityEdit } from '../../../../src/app/online/gm/book/abilityEdit.ts';
import { checkFieldEdit } from '../../../../src/app/online/gm/book/fieldEdit.ts';
import { checkListEdit } from '../../../../src/app/online/gm/book/listEdit.ts';
import type { EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { sheetBase, type BookFieldMessage } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { resolvedOf } from './statblockSheet/sheetKit';
import { propertiesOf, templateOf } from './statblockNotes.ts';

// A hidden field and a visible one the lookup also finds by the hidden one's name: the visible
// field's key reads alike without case and separators (`X_` for `x`), and a hidden Table's slot too.
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'x', label: 'Secret', type: 'number' },
  { key: 'X_', label: 'Shown', type: 'number' },
  { key: 'saves', label: 'Saves', type: 'scores', slots: ['Fort'] },
  { key: 'FORT_', label: 'Fortitude', type: 'number' },
  { key: 'vow', label: 'Vow', type: 'number', formerKeys: ['oath'] },
  { key: 'agi', label: 'Agility', type: 'number' },
  { key: 'Bonus_', label: 'Luck', type: 'number' },
  { key: 'dmg', label: 'Damage', type: 'dice' },
  { key: 'notes', label: 'Notes', type: 'text' },
  { key: 'gear', label: 'Gear', type: 'list' },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'roll', label: 'Roll', type: 'dice' }] } },
];
const stat = (field: string): TemplateBlock => ({ id: `stat-${field}`, type: 'stat', field, look: 'run-in' });
const TEMPLATE: StatblockTemplate = {
  ...templateOf(FIELDS, [
    ...['x', 'X_', 'FORT_', 'vow', 'agi', 'Bonus_', 'dmg', 'notes'].map(stat),
    { id: 'gear0000', type: 'tags', field: 'gear' },
    { id: 'saves000', type: 'scores', field: 'saves', orientation: 'row' },
    { id: 'actions0', type: 'entries', field: 'actions' },
  ]),
  players: { x: 'hidden', saves: 'hidden', vow: 'hidden' },
};
// `bonus` is no field of the template: the note holds it, the player is never shown it, and finds `Bonus_` by its name
const NOTE = '---\nstatblock: true\natlas-template: test-template-abc123\nname: Ana\nx: 9\nX_: 2\nsaves: [7]\nFORT_: 1\nagi: 3\ndmg: 1d6\nnotes: Plain\nbonus: 5\nBonus_: 1\ngear: [rope]\nactions:\n  - name: Bite\n---\n';

const fields = propertiesOf(NOTE) ?? {};
const resolved = resolvedOf(TEMPLATE, fields);
const inputs: EditInputs = { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (field) => storedRead(fields, field) };
const edit = (key: string, base: string, value: string): BookFieldMessage => ({ t: 'book-field', key, base: sheetBase(base), value });
const dice = (value: string): BookFieldMessage => edit('dmg', '1d6', value);

describe('a player\'s @ references that the whole note reads otherwise', () => {
  it('are refused where the player\'s lookup finds a shown field by a hidden one\'s key', () => {
    // Over the values the player sees `@x` is `X_` (2); over the whole note it is the hidden `x` (9)
    expect(checkFieldEdit(inputs, dice('1d8+@x'))).toBeNull();
  });

  it('are refused for a hidden Table\'s slot read through a shown field alike', () => {
    expect(checkFieldEdit(inputs, dice('1d20+@fort'))).toBeNull();
  });

  it('are refused where the whole note holds a value outside the template under the name of a shown field', () => {
    expect(checkFieldEdit(inputs, dice('1d8+@bonus'))).toBeNull();
  });

  it('are refused in any text the player writes, where they name a hidden field even by a former key it holds nothing under', () => {
    expect(checkFieldEdit(inputs, edit('notes', 'Plain', 'Ask @x'))).toBeNull();
    expect(checkFieldEdit(inputs, edit('notes', 'Plain', 'Swore @oath'))).toBeNull();
    expect(checkListEdit(inputs, { t: 'book-list', op: 'add', key: 'gear', item: '@vow torches' })).toBeNull();
    const ability = (text: string): Parameters<typeof checkAbilityEdit>[1] => ({ t: 'book-ability', op: 'add', list: 'actions', after: null, entry: { name: 'Slash', text, parts: {} } });
    expect(checkAbilityEdit(inputs, ability('Deals @x more'))).toBeNull();
    expect(checkAbilityEdit(inputs, ability('Deals @agi more'))).not.toBeNull();
  });

  it('are taken where every reference reads one shown field in both', () => {
    expect(checkFieldEdit(inputs, dice('1d8+@agi'))).not.toBeNull();
    expect(checkFieldEdit(inputs, dice('1d8+@shown'))).not.toBeNull();
    expect(checkFieldEdit(inputs, edit('notes', 'Plain', 'Ask @DM'))).not.toBeNull();
  });
});
