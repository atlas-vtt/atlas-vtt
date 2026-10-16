// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkAbilityEdit } from '../../../../src/app/online/gm/book/abilityEdit.ts';
import { checkFieldEdit } from '../../../../src/app/online/gm/book/fieldEdit.ts';
import type { CheckedEdit, EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { sheetBase, sheetItemKeys, type AbilityInput, type BookAbilityMessage, type BookFieldMessage, type SheetRaw } from '../../../../src/app/online/protocol/index.ts';
import { builtInTemplate } from '../../../../src/app/statblocks/library/builtInTemplates';
import type { ResolvedStatblock, TemplateStatus } from '../../../../src/app/statblocks/model/resolvedTypes';
import type { EntryShape, StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { propertiesOf, templateOf } from './statblockNotes.ts';

const ACTIONS: EntryShape = {
  extras: [
    { key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] },
    { key: 'range', label: 'Range', type: 'number' },
    { key: 'roll', label: 'Roll', type: 'dice' },
    { key: 'kinds', label: 'Kinds', type: 'choice', options: ['Fire', 'Cold', 'Acid'], several: true },
  ],
};
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'speed', label: 'Speed', type: 'text' },
  { key: 'story', label: 'Story', type: 'markdown' },
  { key: 'size', label: 'Size', type: 'choice', options: ['Small', 'Medium', 'Large'] },
  { key: 'langs', label: 'Languages', type: 'choice', options: ['Common', 'Elvish', 'Dwarvish'], several: true },
  { key: 'level', label: 'Level', type: 'rating' },
  { key: 'dmg', label: 'Damage', type: 'dice' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
  { key: 'secret', label: 'Secret', type: 'text' },
  { key: 'seen', label: 'Seen', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries', entry: ACTIONS },
  { key: 'spells', label: 'Spells', type: 'spells' },
];
const stat = (field: string): TemplateBlock => ({ id: `${field}00000`.slice(0, 8), type: 'stat', field, look: 'run-in' });
const BLOCKS: TemplateBlock[] = [
  stat('speed'), { id: 'story000', type: 'text', field: 'story' }, stat('size'), stat('langs'), stat('level'), stat('dmg'),
  { id: 'tags0000', type: 'tags', field: 'tags', look: 'chips' }, { id: 'stats000', type: 'scores', field: 'stats', orientation: 'row' },
  stat('secret'), stat('seen'), { id: 'actions0', type: 'entries', field: 'actions' }, { id: 'spells00', type: 'spells', field: 'spells' },
];
const TEMPLATE: StatblockTemplate = { ...templateOf(FIELDS, BLOCKS), players: { secret: 'hidden', seen: 'read' } };

const BODY = '# Ana\n\nWhat the GM wrote, untouched.\n';
const NOTE = `---
statblock: true
atlas-template: test-template-abc123
name: Ana
speed: 30 ft.   # walking
size: Small
langs:
  - Common
level: 3
dmg: 1d6
tags: [brave, loud]
stats:
  - [10, 12]
secret: The idol
seen: Read only
actions:
  - name: Bite
    desc: Teeth.
    cost: Action
    note: The GM's own key
  - name: Claw
    desc: Scratch.
spells:
  - Ana casts with Wits
---
${BODY}`;

interface Note {
  readonly text: string;
  readonly inputs: EditInputs;
}

function resolvedOf(template: StatblockTemplate, fields: Record<string, unknown>, status: TemplateStatus = 'ok'): ResolvedStatblock {
  return { path: 'Characters/Ana.md', source: { kind: 'atlas', templateId: template.id }, fields, template, templateStatus: status, lookName: 'Test', meanings: {} };
}

/** A note as the GM's Atlas checks an edit of it: read, and drawn for its player as they were last sent it. */
function noteOf(text = NOTE, template = TEMPLATE, changes: Partial<EditInputs> = {}): Note {
  const fields = propertiesOf(text) ?? {};
  const resolved = resolvedOf(template, fields);
  return { text, inputs: { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (field) => storedRead(fields, field), ...changes } };
}

const field = (key: string, value: SheetRaw, base: SheetRaw | undefined, cell?: [number, number]): BookFieldMessage => ({ t: 'book-field', key, base: sheetBase(base), value, ...(cell && { cell }) });

/** The note's text once the checked edit is written. */
function written(note: Note, checked: CheckedEdit | null): string {
  expect(checked).not.toBeNull();
  const result = applyFrontmatterPatches(note.text, checked?.patches ?? []);
  expect(result.conflicts).toEqual([]);
  return result.text;
}

/** The lines of two texts that differ. */
function changedLines(before: string, after: string): string[] {
  const old = new Set(before.split('\n'));
  return after.split('\n').filter((line) => !old.has(line));
}

describe('a player\'s edit of a value of their own statblock', () => {
  it('writes the value under its key, the note\'s body and every other line left as they were', () => {
    const note = noteOf();
    const text = written(note, checkFieldEdit(note.inputs, field('speed', '40 ft.', '30 ft.')));
    expect(changedLines(note.text, text)).toEqual(['speed: 40 ft.   # walking']);
    expect(text.endsWith(`---\n${BODY}`)).toBe(true);
    expect(text.split('\n').length).toBe(note.text.split('\n').length);
  });

  it('does so in a built-in template\'s note, byte for byte beside the value', () => {
    const template = builtInTemplate('builtin:generic-creature')?.template;
    if (!template) throw new Error('no generic creature');
    const text = `---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Wolf\nsize: Medium\nspeed: 40 ft.\nactions:\n  - name: Bite\n    desc: 2d4 piercing.\n---\n${BODY}`;
    const note = noteOf(text, template);
    const speed = written(note, checkFieldEdit(note.inputs, field('speed', '50 ft.', '40 ft.')));
    expect(speed).toBe(text.replace('speed: 40 ft.', 'speed: 50 ft.'));
    const size = written(note, checkFieldEdit(note.inputs, field('size', 'Swarm of Medium', 'Medium')));
    expect(size).toBe(text.replace('size: Medium', 'size: Swarm of Medium'));
  });

  it('takes each kind of value as the page writes it', () => {
    const note = noteOf();
    const fits: [string, SheetRaw, SheetRaw | undefined][] = [
      ['story', 'Line one\n\nLine **two**', undefined], ['size', 'Large', 'Small'], ['langs', ['Common', 'Dwarvish'], ['Common']], ['level', '1/4', 3], ['level', 5, 3],
      ['dmg', '2d8 + 1', '1d6'], ['tags', ['brave', 'quiet', 3], ['brave', 'loud']], ['stats', [[11, 12]], [[10, 12]]],
    ];
    for (const [key, value, base] of fits) {
      const text = written(note, checkFieldEdit(note.inputs, field(key, value, base)));
      expect(propertiesOf(text)?.[key], key).toEqual(value);
    }
  });

  it('deletes the key for null, an empty text or an empty list', () => {
    const note = noteOf();
    for (const [key, value, base] of [['speed', null, '30 ft.'], ['dmg', '', '1d6'], ['tags', [], ['brave', 'loud']]] as const) {
      const text = written(note, checkFieldEdit(note.inputs, field(key, value, base)));
      expect(Object.hasOwn(propertiesOf(text) ?? {}, key), key).toBe(false);
    }
  });

  it('sets one cell of a table: rows of a list of lists, the one row of a flat list', () => {
    const rows = noteOf();
    expect(propertiesOf(written(rows, checkFieldEdit(rows.inputs, field('stats', 14, [[10, 12]], [0, 1]))))?.stats).toEqual([[10, 14]]);
    const flat = noteOf(NOTE.replace('stats:\n  - [10, 12]', 'stats: [10, 12]'));
    expect(propertiesOf(written(flat, checkFieldEdit(flat.inputs, field('stats', 'x', [10, 12], [0, 0]))))?.stats).toEqual(['x', 12]);
    expect(checkFieldEdit(flat.inputs, field('stats', 1, [10, 12], [1, 0]))).toBeNull();
    expect(checkFieldEdit(rows.inputs, field('stats', 1, [[10, 12]], [0, 2]))).toBeNull();
    expect(checkFieldEdit(rows.inputs, field('stats', 1, [[10, 12]], [1, 0]))).toBeNull();
    const map = noteOf(NOTE.replace('stats:\n  - [10, 12]', 'stats: { str: 10 }'));
    expect(checkFieldEdit(map.inputs, field('stats', 1, { str: 10 }, [0, 0]))).toBeNull();
    expect(checkFieldEdit(rows.inputs, field('speed', 1, '30 ft.', [0, 0]))).toBeNull();
  });

  it('checks the whole value a cell edit makes as any other value, and takes a cell only of a field a table shows', () => {
    const note = noteOf();
    // Several choices stored as a list: no cell edit, so nothing outside the options gets in that way.
    expect(checkFieldEdit(note.inputs, field('langs', 'Orcish', ['Common'], [0, 0]))).toBeNull();
    expect(checkFieldEdit(note.inputs, field('langs', 'Elvish', ['Common'], [0, 0]))).toBeNull();
    // A Table's cells hold numbers or text alike; a cell longer than a line is refused.
    expect(propertiesOf(written(note, checkFieldEdit(note.inputs, field('stats', 'high', [[10, 12]], [0, 0]))))?.stats).toEqual([['high', 12]]);
    expect(checkFieldEdit(note.inputs, field('stats', 'a\nb', [[10, 12]], [0, 0]))).toBeNull();
    // A list a Table shows as its one row takes a cell, and stays a list of plain values.
    expect(propertiesOf(written(note, checkFieldEdit(note.inputs, field('tags', 'quiet', ['brave', 'loud'], [0, 1]))))?.tags).toEqual(['brave', 'quiet']);
    const listed = noteOf(NOTE.replace('tags: [brave, loud]', 'tags:\n  - [brave]'));
    expect(checkFieldEdit(listed.inputs, field('tags', 'quiet', [['brave']], [0, 0]))).toBeNull();
  });

  it('refuses every edit that fails one check, each on its own', () => {
    const note = noteOf();
    const fine = field('speed', '40 ft.', '30 ft.');
    expect(checkFieldEdit(note.inputs, fine)).not.toBeNull();
    // The statblock: not native, a template not read as written, a sheet sent read-only, none sent.
    const { resolved } = note.inputs;
    if (!resolved) throw new Error('no note');
    for (const status of ['missing', 'newer', 'auto'] as const) expect(checkFieldEdit({ ...note.inputs, resolved: { ...resolved, templateStatus: status } }, fine), status).toBeNull();
    expect(checkFieldEdit({ ...note.inputs, resolved: { ...resolved, source: { kind: 'fs-frontmatter' } } }, fine)).toBeNull();
    const readOnly = statblockSheet({ resolved: { ...resolved, templateStatus: 'missing' }, definitions: [], resources: undefined });
    expect(checkFieldEdit({ ...note.inputs, sent: readOnly }, fine)).toBeNull();
    expect(checkFieldEdit({ ...note.inputs, sent: null }, fine)).toBeNull();
    expect(checkFieldEdit({ ...note.inputs, read: () => undefined }, fine)).toBeNull();
    // The field: hidden or only read, not on the sheet, or no longer to be changed though it was sent so.
    expect(checkFieldEdit(note.inputs, field('secret', 'x', 'The idol'))).toBeNull();
    expect(checkFieldEdit(note.inputs, field('seen', 'x', 'Read only'))).toBeNull();
    expect(checkFieldEdit(note.inputs, field('nothing', 'x', undefined))).toBeNull();
    expect(checkFieldEdit(note.inputs, field('name', 'Bob', 'Ana'))).toBeNull();
    const stricter = { ...TEMPLATE, players: { ...TEMPLATE.players, speed: 'read' as const } };
    expect(checkFieldEdit({ ...note.inputs, resolved: { ...resolved, template: stricter } }, fine)).toBeNull();
    // The base: what the note held before.
    expect(checkFieldEdit(note.inputs, field('speed', '40 ft.', '25 ft.'))).toBeNull();
    expect(checkFieldEdit(note.inputs, field('speed', '40 ft.', undefined))).toBeNull();
    // The value: of another kind, not an option, out of order, twice, no dice, a list of what no list holds.
    const misfits: [string, SheetRaw, SheetRaw | undefined][] = [
      ['speed', 40, '30 ft.'], ['speed', 'two\nlines', '30 ft.'], ['size', 'Huge', 'Small'], ['size', ['Small'], 'Small'], ['langs', ['Elvish', 'Common'], ['Common']],
      ['langs', ['Common', 'Common'], ['Common']], ['langs', ['Orcish'], ['Common']], ['level', 'many', 3], ['dmg', 'lots', '1d6'], ['dmg', 6, '1d6'],
      ['tags', [{ a: 1 }], ['brave', 'loud']], ['tags', 'brave', ['brave', 'loud']], ['stats', 'high', [[10, 12]]], ['story', 5, undefined],
    ];
    for (const [key, value, base] of misfits) expect(checkFieldEdit(note.inputs, field(key, value, base)), `${key} ${JSON.stringify(value)}`).toBeNull();
  });

  it('names its value in the page\'s base afterwards, and moves a value kept under a former key to the current one', () => {
    const renamed: StatblockTemplate = { ...TEMPLATE, fields: TEMPLATE.fields.map((each) => (each.key === 'speed' ? { ...each, key: 'pace', formerKeys: ['speed'] } : each)), layout: { ...TEMPLATE.layout, blocks: [stat('pace'), ...BLOCKS.slice(1)] } };
    const fields = propertiesOf(NOTE) ?? {};
    // As the resolver gives a renamed field: under its current key too.
    const aliased = { ...fields, pace: fields.speed };
    const resolved = resolvedOf(renamed, aliased);
    const inputs: EditInputs = { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (each) => storedRead(aliased, each) };
    const checked = checkFieldEdit(inputs, field('pace', '35 ft.', '30 ft.'));
    const text = written({ text: NOTE, inputs }, checked);
    expect(propertiesOf(text)).toMatchObject({ pace: '35 ft.' });
    expect(Object.hasOwn(propertiesOf(text) ?? {}, 'speed')).toBe(false);
    expect(checked?.written).toEqual([{ key: 'pace', cleared: ['speed'], value: '35 ft.' }]);
  });
});

const ability = (name: string, text: string, parts: AbilityInput['parts'] = {}): AbilityInput => ({ name, text, parts });
const keysOf = (text: string, list = 'actions'): string[] => sheetItemKeys((propertiesOf(text)?.[list] ?? []) as SheetRaw[]);
/** The key the page gives an ability it added, from exactly what it expects the note to hold. */
const predicted = (stored: SheetRaw): string => `${sheetBase(stored).split('~')[0] ?? ''}~0`;

describe('a player\'s edit of an ability list of their own statblock', () => {
  const note = noteOf();
  const [bite, claw] = keysOf(NOTE);

  it('adds an ability first or after the one it names, exactly as the page predicts it', () => {
    const entry = ability('Healing Word', 'Heals.', { cost: 'Bonus action', range: 60, roll: '1d4 + 2', kinds: ['Fire', 'Acid'] });
    const first: BookAbilityMessage = { t: 'book-ability', op: 'add', list: 'actions', after: null, entry };
    const text = written(note, checkAbilityEdit(note.inputs, first));
    const stored = { name: 'Healing Word', desc: 'Heals.', cost: 'Bonus action', range: 60, roll: '1d4 + 2', kinds: ['Fire', 'Acid'] };
    expect((propertiesOf(text)?.actions as unknown[])[0]).toEqual(stored);
    expect(keysOf(text)[0]).toBe(predicted(stored));
    expect(text.endsWith(`---\n${BODY}`)).toBe(true);

    const between = written(note, checkAbilityEdit(note.inputs, { ...first, after: bite ?? '', entry: ability('Dodge', '') }));
    expect((propertiesOf(between)?.actions as unknown[]).map((item) => (item as { name: string }).name)).toEqual(['Bite', 'Dodge', 'Claw']);
    expect(keysOf(between)[1]).toBe(predicted({ name: 'Dodge' }));
  });

  it('writes an added ability under the keys the list keeps its name and text under', () => {
    const shape: EntryShape = { nameKey: 'title', textKey: 'text', extras: [] };
    const template = { ...TEMPLATE, fields: TEMPLATE.fields.map((each) => (each.key === 'actions' ? { ...each, entry: shape } : each)) };
    const own = noteOf(NOTE, template);
    const component = own.inputs.sent?.abilities.find((each) => each.tabs.some((tab) => tab.list === 'actions'));
    expect(component).toMatchObject({ nameKey: 'title', textKey: 'text' });
    const text = written(own, checkAbilityEdit(own.inputs, { t: 'book-ability', op: 'add', list: 'actions', after: claw ?? '', entry: ability('Rally', 'Friends stand.') }));
    expect((propertiesOf(text)?.actions as unknown[])[2]).toEqual({ title: 'Rally', text: 'Friends stand.' });
    expect(keysOf(text)[2]).toBe(predicted({ title: 'Rally', text: 'Friends stand.' }));
  });

  it('changes an ability\'s name, text and parts and keeps the keys the template does not show, and removes one', () => {
    const edited = written(note, checkAbilityEdit(note.inputs, { t: 'book-ability', op: 'edit', list: 'actions', key: bite ?? '', entry: ability('Big bite', '', { range: 5 }) }));
    expect((propertiesOf(edited)?.actions as unknown[])[0]).toEqual({ name: 'Big bite', note: 'The GM\'s own key', range: 5 });
    expect(changedLines(note.text, edited)).toEqual(['  - name: Big bite', '    range: 5']);
    const removed = written(note, checkAbilityEdit(note.inputs, { t: 'book-ability', op: 'remove', list: 'actions', key: claw ?? '' }));
    expect((propertiesOf(removed)?.actions as unknown[]).map((item) => (item as { name: string }).name)).toEqual(['Bite']);
    expect(removed.endsWith(`---\n${BODY}`)).toBe(true);
  });

  it('adds to a list the note does not hold yet, and to one kept as a single ability', () => {
    const empty = noteOf(NOTE.replace(/actions:[\s\S]*?(?=spells:)/, ''));
    expect(propertiesOf(written(empty, checkAbilityEdit(empty.inputs, { t: 'book-ability', op: 'add', list: 'actions', after: null, entry: ability('Bite', 'Teeth.') })))?.actions).toEqual([{ name: 'Bite', desc: 'Teeth.' }]);
    const single = noteOf(NOTE.replace(/actions:[\s\S]*?(?=spells:)/, 'actions:\n  name: Bite\n  desc: Teeth.\n'));
    const key = sheetItemKeys([{ name: 'Bite', desc: 'Teeth.' }])[0] ?? '';
    expect(propertiesOf(written(single, checkAbilityEdit(single.inputs, { t: 'book-ability', op: 'add', list: 'actions', after: key, entry: ability('Claw', '') })))?.actions).toEqual([{ name: 'Bite', desc: 'Teeth.' }, { name: 'Claw' }]);
  });

  it('refuses every edit that fails one check, each on its own', () => {
    const add = (entry: AbilityInput, after: string | null = null): BookAbilityMessage => ({ t: 'book-ability', op: 'add', list: 'actions', after, entry });
    expect(checkAbilityEdit(note.inputs, add(ability('Fine', '')))).not.toBeNull();
    const { resolved } = note.inputs;
    if (!resolved) throw new Error('no note');
    expect(checkAbilityEdit({ ...note.inputs, resolved: { ...resolved, templateStatus: 'newer' } }, add(ability('Fine', '')))).toBeNull();
    expect(checkAbilityEdit({ ...note.inputs, resolved: { ...resolved, source: { kind: 'fs-frontmatter' } } }, add(ability('Fine', '')))).toBeNull();
    expect(checkAbilityEdit({ ...note.inputs, sent: null }, add(ability('Fine', '')))).toBeNull();
    // A list only read, the spells, one the sheet does not offer, one no longer to be changed.
    const reading = noteOf(NOTE, { ...TEMPLATE, players: { ...TEMPLATE.players, actions: 'read' } });
    expect(checkAbilityEdit(reading.inputs, add(ability('Fine', '')))).toBeNull();
    expect(checkAbilityEdit(note.inputs, { ...add(ability('Fine', '')), list: 'spells' })).toBeNull();
    expect(checkAbilityEdit(note.inputs, { ...add(ability('Fine', '')), list: 'story' })).toBeNull();
    expect(checkAbilityEdit({ ...note.inputs, resolved: { ...resolved, template: { ...TEMPLATE, players: { actions: 'hidden' } } } }, add(ability('Fine', '')))).toBeNull();
    // Abilities the list does not hold.
    expect(checkAbilityEdit(note.inputs, add(ability('Fine', ''), 'zzzz~0'))).toBeNull();
    expect(checkAbilityEdit(note.inputs, { t: 'book-ability', op: 'edit', list: 'actions', key: 'zzzz~0', entry: ability('Fine', '') })).toBeNull();
    expect(checkAbilityEdit(note.inputs, { t: 'book-ability', op: 'remove', list: 'actions', key: `${(bite ?? '').split('~')[0] ?? ''}~1` })).toBeNull();
    // Parts the list does not have, or that do not fit it.
    for (const parts of [{ speed: 'x' }, { cost: 'Reaction' }, { cost: ['Action'] }, { range: 'far' }, { roll: 'lots' }, { kinds: ['Acid', 'Fire'] }, { kinds: ['Fire', 'Fire'] }, { kinds: 'Fire' }]) {
      expect(checkAbilityEdit(note.inputs, add(ability('Fine', '', parts))), JSON.stringify(parts)).toBeNull();
    }
  });
});
