import { describe, expect, it } from 'vitest';
import { checkListEdit } from '../../../../src/app/online/gm/book/listEdit.ts';
import type { CheckedEdit, EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { MAX_SHEET_LIST, parsePlayerBookMessage, type BookListMessage, type SheetListItem } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { propertiesOf, templateOf } from './statblockNotes.ts';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'xp', label: 'Experiences', type: 'pairs' },
  { key: 'saves', label: 'Saves', type: 'pairs' },
  { key: 'lore', label: 'Lore', type: 'list' },
  { key: 'secrets', label: 'Secrets', type: 'list' },
  { key: 'speed', label: 'Speed', type: 'text' },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'tags0000', type: 'tags', field: 'tags', look: 'chips' },
  { id: 'xp000000', type: 'pairs', field: 'xp' },
  { id: 'saves000', type: 'pairs', field: 'saves' },
  { id: 'lore0000', type: 'tags', field: 'lore', look: 'chips' },
  { id: 'secrets0', type: 'tags', field: 'secrets', look: 'chips' },
  { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in' },
];
const TEMPLATE: StatblockTemplate = { ...templateOf(FIELDS, BLOCKS), players: { lore: 'read', secrets: 'hidden' } };

const BODY = '# Kestrel\n\nWhat the GM wrote, untouched.\n';
const frontmatter = (lines: string): string => `---\nstatblock: true\natlas-template: ${TEMPLATE.id}\nname: Kestrel Vane\n${lines}---\n${BODY}`;
const NOTE = frontmatter(`tags:
  - Brave
  - Loud   # since the fire
xp:
  - Bounty Hunter: 2
  - Sailor: 1
saves:
  dex: 3
  wis: -1
lore: [Old roads]
secrets: [The idol]
speed: 30 ft.
`);

interface Note {
  readonly text: string;
  readonly inputs: EditInputs;
}

/** A note as the GM's Atlas checks an edit of it: read, and drawn for its player as they were last sent it. */
function noteOf(text = NOTE, template = TEMPLATE): Note {
  const fields = propertiesOf(text) ?? {};
  const resolved = { path: 'Characters/Kestrel.md', source: { kind: 'atlas' as const, templateId: template.id }, fields, template, templateStatus: 'ok' as const, lookName: 'Test', meanings: {} };
  return { text, inputs: { resolved, sent: statblockSheet({ resolved, definitions: [], resources: undefined }), read: (field) => storedRead(fields, field) } };
}

const add = (key: string, item: SheetListItem): BookListMessage => ({ t: 'book-list', op: 'add', key, item });
const remove = (key: string, item: SheetListItem): BookListMessage => ({ t: 'book-list', op: 'remove', key, item });

/** The note's text once the checked edit is written onto `text` (the note as it is then, which the GM may have changed meanwhile). */
function written(text: string, checked: CheckedEdit | null): string {
  expect(checked).not.toBeNull();
  const result = applyFrontmatterPatches(text, checked?.patches ?? []);
  expect(result.conflicts).toEqual([]);
  return result.text;
}

const valueOf = (text: string, key: string): unknown => propertiesOf(text)?.[key];

describe('a player adding to or taking from a list value of their own statblock', () => {
  it('adds a word at the end with the writer\'s insert, every other line as it was', () => {
    const note = noteOf();
    const checked = checkListEdit(note.inputs, add('tags', 'Lantern-bearer'));
    expect(checked?.patches).toEqual([{ op: 'insert', list: 'tags', after: 'Loud', item: 'Lantern-bearer' }]);
    const text = written(note.text, checked);
    expect(valueOf(text, 'tags')).toEqual(['Brave', 'Loud', 'Lantern-bearer']);
    expect(text).toContain('  - Loud   # since the fire\n');
    expect(text.endsWith(`---\n${BODY}`)).toBe(true);
    expect(checked?.written).toMatchObject([{ key: 'tags', cleared: [], value: ['Brave', 'Loud', 'Lantern-bearer'] }]);
    // The note holds the write once it holds the word, also beside one the GM added meanwhile; not while it reads as before.
    const readsBack = checked?.written[0]?.readsBack;
    expect(readsBack?.(['Brave', 'Loud', 'Lantern-bearer', 'Scarred'])).toBe(true);
    expect(readsBack?.(['Brave', 'Loud'])).toBe(false);
  });

  it('takes a word out by its content, a number the page shows as text too', () => {
    const note = noteOf();
    expect(checkListEdit(note.inputs, remove('tags', 'Brave'))?.patches).toEqual([{ op: 'remove', list: 'tags', item: 'Brave' }]);
    expect(valueOf(written(note.text, checkListEdit(note.inputs, remove('tags', 'Brave'))), 'tags')).toEqual(['Loud']);
    const numbered = noteOf(NOTE.replace('  - Brave\n', '  - 7\n'));
    expect(valueOf(written(numbered.text, checkListEdit(numbered.inputs, remove('tags', '7'))), 'tags')).toEqual(['Loud']);
  });

  it('starts a list where the note holds none, and writes a comma line whole as a list', () => {
    const none = noteOf(NOTE.replace(/tags:\n {2}- Brave\n {2}- Loud {3}# since the fire\n/, ''));
    expect(valueOf(written(none.text, checkListEdit(none.inputs, add('tags', 'Brave'))), 'tags')).toEqual(['Brave']);
    const line = noteOf(NOTE.replace(/tags:\n {2}- Brave\n {2}- Loud {3}# since the fire\n/, 'tags: Brave, Loud\n'));
    expect(valueOf(written(line.text, checkListEdit(line.inputs, add('tags', 'Quiet'))), 'tags')).toEqual(['Brave', 'Loud', 'Quiet']);
  });

  it('puts the word at the end where the last word stands earlier too, which the writer\'s insert would miss', () => {
    const note = noteOf(NOTE.replace('  - Brave\n', '  - Loud\n'));
    const checked = checkListEdit(note.inputs, add('tags', 'Quiet'));
    expect(checked?.patches[0]?.op).toBe('set');
    expect(valueOf(written(note.text, checked), 'tags')).toEqual(['Loud', 'Loud', 'Quiet']);
  });

  it('adds a label with its value in the shape the list keeps them: one-key maps, a map, entries, lines', () => {
    const note = noteOf();
    expect(valueOf(written(note.text, checkListEdit(note.inputs, add('xp', { label: 'Smuggler', value: 2 }))), 'xp')).toEqual([{ 'Bounty Hunter': 2 }, { Sailor: 1 }, { Smuggler: 2 }]);
    expect(valueOf(written(note.text, checkListEdit(note.inputs, add('saves', { label: 'con', value: 1 }))), 'saves')).toEqual({ dex: 3, wis: -1, con: 1 });
    const described = noteOf(NOTE.replace('  - Bounty Hunter: 2\n  - Sailor: 1\n', '  - name: Bounty Hunter\n    desc: 2\n'));
    expect(valueOf(written(described.text, checkListEdit(described.inputs, add('xp', { label: 'Smuggler', value: 2 }))), 'xp')).toEqual([{ name: 'Bounty Hunter', desc: 2 }, { name: 'Smuggler', desc: 2 }]);
    const lines = noteOf(NOTE.replace('  - Bounty Hunter: 2\n  - Sailor: 1\n', '  - Bounty Hunter +2\n'));
    expect(valueOf(written(lines.text, checkListEdit(lines.inputs, add('xp', { label: 'Smuggler', value: -1 }))), 'xp')).toEqual(['Bounty Hunter +2', 'Smuggler -1']);
    // A line cannot hold a value that is no number: that pair is a map among the lines.
    expect(valueOf(written(lines.text, checkListEdit(lines.inputs, add('xp', { label: 'Smuggler', value: 'high' }))), 'xp')).toEqual(['Bounty Hunter +2', { Smuggler: 'high' }]);
    const none = noteOf(NOTE.replace('xp:\n  - Bounty Hunter: 2\n  - Sailor: 1\n', ''));
    expect(valueOf(written(none.text, checkListEdit(none.inputs, add('xp', { label: 'Smuggler', value: null }))), 'xp')).toEqual([{ Smuggler: null }]);
  });

  it('refuses a label that would make the value read as other pairs: desc in a map or a list of maps, a name taken as none', () => {
    const note = noteOf();
    expect(checkListEdit(note.inputs, add('saves', { label: 'desc', value: 2 }))).toBeNull();
    expect(checkListEdit(note.inputs, add('xp', { label: 'desc', value: 2 }))).toBeNull();
    const described = noteOf(NOTE.replace('  - Bounty Hunter: 2\n  - Sailor: 1\n', '  - name: Bounty Hunter\n    desc: 2\n'));
    expect(checkListEdit(described.inputs, add('xp', { label: '_hidden', value: 2 }))).toBeNull();
    // A label that reads as itself is taken, `name` among them.
    expect(valueOf(written(note.text, checkListEdit(note.inputs, add('xp', { label: 'name', value: 1 }))), 'xp')).toEqual([{ 'Bounty Hunter': 2 }, { Sailor: 1 }, { name: 1 }]);
  });

  it('takes a pair out of its list, its map, or the entry that holds it with others', () => {
    const note = noteOf();
    expect(valueOf(written(note.text, checkListEdit(note.inputs, remove('xp', { label: 'Sailor', value: 1 }))), 'xp')).toEqual([{ 'Bounty Hunter': 2 }]);
    expect(valueOf(written(note.text, checkListEdit(note.inputs, remove('saves', { label: 'wis', value: -1 }))), 'saves')).toEqual({ dex: 3 });
    const shared = noteOf(NOTE.replace('  - Bounty Hunter: 2\n  - Sailor: 1\n', '  - Bounty Hunter: 2\n    Sailor: 1\n'));
    expect(valueOf(written(shared.text, checkListEdit(shared.inputs, remove('xp', { label: 'Sailor', value: 1 }))), 'xp')).toEqual([{ 'Bounty Hunter': 2 }]);
    const lines = noteOf(NOTE.replace('  - Bounty Hunter: 2\n  - Sailor: 1\n', '  - Bounty Hunter +2\n  - Stealth\n'));
    expect(valueOf(written(lines.text, checkListEdit(lines.inputs, remove('xp', { label: 'Stealth', value: null }))), 'xp')).toEqual(['Bounty Hunter +2']);
  });

  it('keeps an edit the GM made to the list meanwhile, both ways', () => {
    const note = noteOf();
    // The GM adds a word and changes a pair in the note after the player's sheet was drawn.
    const changed = note.text.replace('  - Loud   # since the fire\n', '  - Loud   # since the fire\n  - Scarred\n').replace('  - Sailor: 1\n', '  - Sailor: 1\n  - Gambler: 3\n');
    expect(valueOf(written(changed, checkListEdit(note.inputs, add('tags', 'Quiet'))), 'tags')).toEqual(['Brave', 'Loud', 'Quiet', 'Scarred']);
    expect(valueOf(written(changed, checkListEdit(note.inputs, remove('tags', 'Brave'))), 'tags')).toEqual(['Loud', 'Scarred']);
    expect(valueOf(written(changed, checkListEdit(note.inputs, add('xp', { label: 'Smuggler', value: 2 }))), 'xp')).toEqual([{ 'Bounty Hunter': 2 }, { Sailor: 1 }, { Smuggler: 2 }, { Gambler: 3 }]);
    // An entry the GM changed meanwhile is never taken: the writer finds nothing equal and leaves the list.
    const renamed = note.text.replace('  - Brave\n', '  - Bold\n');
    const result = applyFrontmatterPatches(renamed, checkListEdit(note.inputs, remove('tags', 'Brave'))?.patches ?? []);
    expect(valueOf(result.text, 'tags')).toEqual(['Bold', 'Loud']);
  });

  it('moves a list kept under the key its field had before a rename to its key now', () => {
    const renamed: StatblockTemplate = { ...TEMPLATE, fields: TEMPLATE.fields.map((field) => (field.key === 'tags' ? { ...field, formerKeys: ['marks'] } : field)) };
    const note = noteOf(NOTE.replace('tags:\n', 'marks:\n'), renamed);
    const text = written(note.text, checkListEdit(note.inputs, add('tags', 'Quiet')));
    expect(valueOf(text, 'tags')).toEqual(['Brave', 'Loud', 'Quiet']);
    expect(valueOf(text, 'marks')).toBeUndefined();
  });

  it('refuses what is no part of a list the player may change, or what the list cannot take', () => {
    const note = noteOf();
    expect(checkListEdit(note.inputs, add('tags', 'Fine'))).not.toBeNull();
    // Not an editable list: read only, hidden, a value of another kind, no such field.
    expect(checkListEdit(note.inputs, add('lore', 'Ruins'))).toBeNull();
    expect(checkListEdit(note.inputs, add('secrets', 'Map'))).toBeNull();
    expect(checkListEdit(note.inputs, add('speed', '40 ft.'))).toBeNull();
    expect(checkListEdit(note.inputs, add('nothing', 'x'))).toBeNull();
    // Not this player's editable sheet, or a template that does not read as written.
    const { resolved } = note.inputs;
    if (!resolved) throw new Error('no resolved note');
    expect(checkListEdit({ ...note.inputs, sent: null }, add('tags', 'Fine'))).toBeNull();
    expect(checkListEdit({ ...note.inputs, sent: { ...note.inputs.sent!, editable: false } }, add('tags', 'Fine'))).toBeNull();
    expect(checkListEdit({ ...note.inputs, resolved: { ...resolved, templateStatus: 'newer' } }, add('tags', 'Fine'))).toBeNull();
    expect(checkListEdit({ ...note.inputs, resolved: { ...resolved, template: { ...TEMPLATE, players: { ...TEMPLATE.players, tags: 'read' } } } }, add('tags', 'Fine'))).toBeNull();
    // An item of the other kind, a pair the list holds already (in any case), one it does not hold.
    expect(checkListEdit(note.inputs, add('tags', { label: 'x', value: 1 }))).toBeNull();
    expect(checkListEdit(note.inputs, add('xp', 'Smuggler'))).toBeNull();
    expect(checkListEdit(note.inputs, add('xp', { label: 'sailor', value: 4 }))).toBeNull();
    expect(checkListEdit(note.inputs, remove('xp', { label: 'Sailor', value: 2 }))).toBeNull();
    expect(checkListEdit(note.inputs, remove('tags', 'Quiet'))).toBeNull();
    // A full list.
    const full = noteOf(NOTE.replace(/tags:\n {2}- Brave\n {2}- Loud {3}# since the fire\n/, `tags: [${Array.from({ length: MAX_SHEET_LIST }, (_, at) => `w${at}`).join(', ')}]\n`));
    expect(checkListEdit(full.inputs, add('tags', 'one more'))).toBeNull();
  });

  it('reads only clean entries from a page: a word on one line, a label a note can store', () => {
    const parse = (item: unknown): unknown => parsePlayerBookMessage({ t: 'book-list', op: 'add', key: 'tags', item });
    expect(parse('  Lantern  bearer ')).toEqual(add('tags', 'Lantern bearer'));
    expect(parse({ label: 'Smuggler', value: '' })).toEqual(add('tags', { label: 'Smuggler', value: null }));
    for (const bad of ['', 'x'.repeat(81), { label: '__proto__', value: 1 }, { label: 'x'.repeat(65), value: 1 }, { label: 'a', value: Number.NaN }, { label: 'a', value: { b: 1 } }, 3, null]) {
      expect(parse(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parsePlayerBookMessage({ t: 'book-list', op: 'edit', key: 'tags', item: 'x' })).toBeNull();
  });
});
