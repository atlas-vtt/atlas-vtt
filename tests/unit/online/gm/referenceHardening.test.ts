import { describe, expect, it } from 'vitest';
import { checkFieldEdit } from '../../../../src/app/online/gm/book/fieldEdit.ts';
import { MAX_PLAYER_REFERENCES, type EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { sheetBase, type BookFieldMessage } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { resolvedOf, statblockTexts } from './statblockSheet/sheetKit';
import { templateOf } from './statblockNotes.ts';

// A chain one step deeper than the lookup reads, and a value naming more values than its budget works out
const CHAIN = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'];
const MANY = 300;
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'agi', label: 'Agility', type: 'number' },
  { key: 'x', label: 'Secret', type: 'number' },
  { key: 'ac', label: 'Armour', type: 'text' },
  { key: 'many', label: 'Many', type: 'list' },
  { key: 'sum', label: 'Sum', type: 'text' },
  { key: 'dmg', label: 'Damage', type: 'dice' },
  { key: 'notes', label: 'Notes', type: 'text' },
  { key: 'story', label: 'Story', type: 'markdown' },
  ...CHAIN.map((key): TemplateField => ({ key, label: key.toUpperCase(), type: 'text' })),
];
const stat = (field: string): TemplateBlock => ({ id: `stat-${field}`, type: 'stat', field, look: 'run-in' });
const BLOCKS: TemplateBlock[] = [...['agi', 'x', 'ac', 'sum', 'dmg', 'notes', ...CHAIN].map(stat), { id: 'story000', type: 'text', field: 'story' }];
const templateHiding = (hidden: readonly string[]): StatblockTemplate => ({
  ...templateOf(FIELDS, BLOCKS),
  players: Object.fromEntries(hidden.map((key) => [key, 'hidden'])),
});
const TEMPLATE = templateHiding(['x']);

const FIELDS_HELD: Record<string, unknown> = {
  name: 'Ana', agi: 3, x: 9, ac: '10 + @x', dmg: '1d6', notes: 'Plain', story: 'Born',
  // A key the template names nowhere: the player is never shown it
  stash: 40,
  pouch: ['gem'],
  many: Array.from({ length: MANY }, () => '@agi'),
  sum: Array.from({ length: MANY }, (_, at) => `@many.${at}`).join(' + '),
  ...Object.fromEntries(CHAIN.map((key, at) => [key, at + 1 < CHAIN.length ? `@${CHAIN[at + 1]}` : 2])),
};

function inputsFor(template: StatblockTemplate, fields: Record<string, unknown>): EditInputs {
  const resolved = resolvedOf(template, fields);
  return { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (field) => storedRead(fields, field) };
}

const inputs = inputsFor(TEMPLATE, FIELDS_HELD);
const notes = (value: string): BookFieldMessage => ({ t: 'book-field', key: 'notes', base: sheetBase('Plain'), value });
const story = (value: string): BookFieldMessage => ({ t: 'book-field', key: 'story', base: sheetBase('Born'), value });
const dice = (value: string): BookFieldMessage => ({ t: 'book-field', key: 'dmg', base: sheetBase('1d6'), value });

describe('a player\'s @ references, checked to the end', () => {
  it('are refused where a value they name is left unread, too deep or over the lookup\'s budget', () => {
    expect(checkFieldEdit(inputs, notes('See @f0'))).toBeNull();
    expect(checkFieldEdit(inputs, notes('See @sum'))).toBeNull();
    expect(checkFieldEdit(inputs, notes('See @f2'))).not.toBeNull();
  });

  it(`are refused past ${MAX_PLAYER_REFERENCES} in one text`, () => {
    const many = (count: number): string => Array.from({ length: count }, () => '@agi').join(' ');
    expect(checkFieldEdit(inputs, story(many(MAX_PLAYER_REFERENCES)))).not.toBeNull();
    expect(checkFieldEdit(inputs, story(many(MAX_PLAYER_REFERENCES + 1)))).toBeNull();
  });

  it('are refused where a value they name reads a hidden field', () => {
    expect(checkFieldEdit(inputs, notes('Armour @ac'))).toBeNull();
  });

  it('are refused for a key the note holds outside the template', () => {
    expect(checkFieldEdit(inputs, notes('Hoard @stash'))).toBeNull();
    // Though it is no number, so neither lookup fills it in
    expect(checkFieldEdit(inputs, notes('Hoard @pouch'))).toBeNull();
  });

  it('are taken where they read shown fields alone', () => {
    expect(checkFieldEdit(inputs, dice('1d8+@agi'))).not.toBeNull();
    expect(checkFieldEdit(inputs, notes('Ask @DM'))).not.toBeNull();
  });
});

describe('a value a player wrote, once the field it names is hidden', () => {
  it('no longer fills on their sheet', () => {
    expect(checkFieldEdit(inputs, dice('1d8+@agi'))).not.toBeNull();
    const written = { ...FIELDS_HELD, dmg: '1d8+@agi' };
    const before = statblockTexts(statblockSheet({ resolved: resolvedOf(TEMPLATE, written), definitions: [], resources: undefined })!);
    const after = statblockTexts(statblockSheet({ resolved: resolvedOf(templateHiding(['x', 'agi']), written), definitions: [], resources: undefined })!);
    expect(before.some((text) => text.includes('@agi'))).toBe(false);
    expect(after.some((text) => text.includes('@agi'))).toBe(true);
    expect(after.some((text) => text.includes('1d8+3') || text.includes('1d8 + 3'))).toBe(false);
  });
});
