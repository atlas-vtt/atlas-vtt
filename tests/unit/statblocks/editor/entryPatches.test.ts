import { describe, expect, it } from 'vitest';
import type { EntryShape } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import {
  entryPartPatches, entryWithPart, insertEntryPatch, moveEntryPatch, newEntry, removeEntryPatch, shownEntryIndexes,
} from '../../../../src/app/statblocks/editor/statblock-pane/entryPatches';

const bite = { name: 'Bite', desc: 'It bites.' };
const claw = { name: 'Claw', desc: 'It claws.' };
const roar = { name: 'Roar' };
const items = [bite, claw, roar];

const NOTE = `---
actions:
  - name: Bite
    desc: It bites.
  - name: Claw
    desc: It claws.
  - name: Roar
---
Body
`;

describe('entry patches', () => {
  it('sets a part by its path, based on what the entry held', () => {
    expect(entryPartPatches('actions', 1, claw, undefined, 'name', ' Rake ')).toEqual([
      { op: 'set', path: ['actions', 1, 'name'], base: 'Claw', next: 'Rake' },
    ]);
    expect(entryPartPatches('actions', 2, roar, undefined, 'text', 'Everyone hears it.')).toEqual([
      { op: 'set', path: ['actions', 2, 'desc'], base: undefined, next: 'Everyone hears it.' },
    ]);
    expect(entryPartPatches('actions', 0, bite, undefined, 'text', '')).toEqual([
      { op: 'delete', path: ['actions', 0, 'desc'], base: 'It bites.' },
    ]);
    expect(entryPartPatches('actions', 0, bite, undefined, 'name', 'Bite')).toEqual([]);
  });

  it('uses the shape\'s keys, and names an entry written as plain text by making it a record', () => {
    expect(entryPartPatches('moves', 0, { label: 'Hop' }, { nameKey: 'label', textKey: 'text' }, 'text', 'Far.')).toEqual([
      { op: 'set', path: ['moves', 0, 'text'], base: undefined, next: 'Far.' },
    ]);
    expect(entryPartPatches('actions', 0, 'It bites.', undefined, 'name', 'Bite')).toEqual([
      { op: 'set', path: ['actions', 0], base: 'It bites.', next: { name: 'Bite', desc: 'It bites.' } },
    ]);
    expect(entryWithPart(bite, undefined, 'text', '')).toEqual({ name: 'Bite' });
  });

  it('writes an entry\'s text under the key it holds it, `desc` where the shape\'s key holds nothing', () => {
    const shape: EntryShape = { textKey: 'text' };
    const feature = { name: 'Relentless', desc: 'Spotlit thrice.' };
    expect(entryPartPatches('feats', 0, feature, shape, 'text', 'Spotlit twice.')).toEqual([
      { op: 'set', path: ['feats', 0, 'desc'], base: 'Spotlit thrice.', next: 'Spotlit twice.' },
    ]);
    expect(entryWithPart(feature, shape, 'text', '')).toEqual({ name: 'Relentless' });
    expect(entryPartPatches('feats', 0, { name: 'Relentless' }, shape, 'text', 'New.')).toEqual([
      { op: 'set', path: ['feats', 0, 'text'], base: undefined, next: 'New.' },
    ]);
  });

  it('edits an entry written as a list as the record it reads as, and writes that record in its place', () => {
    const listed = ['Bite', 'Melee ', '1d6'];
    expect(entryPartPatches('actions', 0, listed, undefined, 'text', 'Melee 2d6')).toEqual([
      { op: 'set', path: ['actions', 0], base: listed, next: { name: 'Bite', desc: 'Melee 2d6' } },
    ]);
    expect(entryPartPatches('actions', 0, listed, undefined, 'name', 'Maul')).toEqual([
      { op: 'set', path: ['actions', 0], base: listed, next: { name: 'Maul', desc: 'Melee 1d6' } },
    ]);
    expect(entryPartPatches('actions', 0, listed, undefined, 'name', 'Bite')).toEqual([]);
    expect(entryWithPart(listed, undefined, 'text', '')).toEqual({ name: 'Bite' });
    const note = '---\nactions:\n  - [Bite, Melee 1d6]\n---\n';
    expect(applyFrontmatterPatches(note, entryPartPatches('actions', 0, ['Bite', 'Melee 1d6'], undefined, 'text', 'Melee 2d6')).text)
      .toBe('---\nactions:\n  - {name: Bite, desc: Melee 2d6}\n---\n');
  });

  it('inserts, moves and removes entries by the entry itself', () => {
    expect(insertEntryPatch('actions', items, 0, newEntry(undefined, 'Sting', ''))).toEqual({
      op: 'insert', list: 'actions', after: bite, item: { name: 'Sting' },
    });
    expect(insertEntryPatch('actions', [], null, newEntry(undefined, 'Sting', 'Ow.'))).toEqual({
      op: 'insert', list: 'actions', after: null, item: { name: 'Sting', desc: 'Ow.' },
    });
    expect(moveEntryPatch('actions', items, 1, -1)).toEqual({ op: 'move', list: 'actions', item: claw, after: null });
    expect(moveEntryPatch('actions', items, 0, 1)).toEqual({ op: 'move', list: 'actions', item: bite, after: claw });
    expect(moveEntryPatch('actions', items, 2, 1)).toBeNull();
    expect(removeEntryPatch('actions', roar)).toEqual({ op: 'remove', list: 'actions', item: roar });
  });

  it('moves an entry one place as the patcher applies it', () => {
    const down = applyFrontmatterPatches(NOTE, [moveEntryPatch('actions', items, 0, 1)!]);
    expect(down.conflicts).toEqual([]);
    expect(down.text.indexOf('Claw')).toBeLessThan(down.text.indexOf('Bite'));
    const up = applyFrontmatterPatches(NOTE, [moveEntryPatch('actions', items, 2, -1)!]);
    expect(up.text.indexOf('Roar')).toBeLessThan(up.text.indexOf('Claw'));
    expect(up.text.indexOf('Bite')).toBeLessThan(up.text.indexOf('Roar'));
  });

  it('sets and removes an extra by its path, written by its type', () => {
    const shape: EntryShape = {
      extras: [
        { key: 'type', label: 'Type', type: 'choice', options: ['Main action', 'Reaction'] },
        { key: 'cost', label: 'Cost', type: 'number' },
        { key: 'tags', label: 'Tags', type: 'list' },
      ],
    };
    const typedBite = { name: 'Bite', type: 'Main action', desc: 'It bites.' };
    expect(entryPartPatches('actions', 0, bite, shape, { extra: 'type' }, 'Reaction')).toEqual([
      { op: 'set', path: ['actions', 0, 'type'], base: undefined, next: 'Reaction' },
    ]);
    expect(entryPartPatches('actions', 0, typedBite, shape, { extra: 'type' }, '')).toEqual([
      { op: 'delete', path: ['actions', 0, 'type'], base: 'Main action' },
    ]);
    expect(entryPartPatches('actions', 0, typedBite, shape, { extra: 'type' }, 'Main action')).toEqual([]);
    expect(entryPartPatches('actions', 0, bite, shape, { extra: 'cost' }, ' 2 ')).toEqual([
      { op: 'set', path: ['actions', 0, 'cost'], base: undefined, next: 2 },
    ]);
    expect(entryPartPatches('actions', 0, bite, shape, { extra: 'cost' }, 'two')).toEqual([
      { op: 'set', path: ['actions', 0, 'cost'], base: undefined, next: 'two' },
    ]);
    expect(entryPartPatches('actions', 0, bite, shape, { extra: 'tags' }, 'melee, (fire, cold)')).toEqual([
      { op: 'set', path: ['actions', 0, 'tags'], base: undefined, next: ['melee', '(fire, cold)'] },
    ]);
    // An entry written as plain text becomes a record to take an extra; blank changes nothing.
    expect(entryPartPatches('actions', 0, 'It bites.', shape, { extra: 'type' }, 'Reaction')).toEqual([
      { op: 'set', path: ['actions', 0], base: 'It bites.', next: { desc: 'It bites.', type: 'Reaction' } },
    ]);
    expect(entryPartPatches('actions', 0, 'It bites.', shape, { extra: 'type' }, '')).toEqual([]);
    expect(entryWithPart(typedBite, shape, { extra: 'type' }, '')).toEqual(bite);
  });

  it('writes a new entry with the extras that were set, between its name and its text', () => {
    const shape: EntryShape = { extras: [{ key: 'type', label: 'Type', type: 'choice' }, { key: 'range', label: 'Range', type: 'text' }] };
    const entry = newEntry(shape, 'Sting', 'Ow.', { range: ' ', type: 'Reaction' });
    expect(entry).toEqual({ name: 'Sting', type: 'Reaction', desc: 'Ow.' });
    expect(Object.keys(entry as Record<string, unknown>)).toEqual(['name', 'type', 'desc']);
  });

  it('applies an ability\'s parts as one write, each where the note holds it', () => {
    const shape: EntryShape = { extras: [{ key: 'type', label: 'Type', type: 'choice' }] };
    const named = entryWithPart(claw, shape, 'name', 'Rake');
    const patches = [
      ...entryPartPatches('actions', 1, claw, shape, 'name', 'Rake'),
      ...entryPartPatches('actions', 1, named, shape, { extra: 'type' }, 'Reaction'),
    ];
    const result = applyFrontmatterPatches(NOTE, patches);
    expect(result.conflicts).toEqual([]);
    expect(result.text).toContain('  - name: Rake\n    desc: It claws.\n    type: Reaction\n');
  });

  it('counts the entries the card shows, as the card does', () => {
    expect(shownEntryIndexes([bite, '', { cost: 2 }, claw], undefined)).toEqual([0, 3]);
  });
});
