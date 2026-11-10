import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { patched, readAsObsidian, set } from './patchTestKit';

const NOTE = [
  '---',
  'statblock: true',
  'name: Goblin',
  'hp: 7',
  'speed:',
  '  walk: 30',
  '  climb: 15',
  'actions:',
  '  - name: Scimitar',
  '    desc: Slash',
  '  - name: Bow',
  '    desc: Shoot',
  'senses:',
  '  - darkvision',
  '---',
  'Body',
  '',
].join('\n');

const lines = (...rows: string[]): string => ['---', ...rows, '---', 'Body', ''].join('\n');

describe('set', () => {
  it('writes where the base still holds and conflicts where it does not', () => {
    const result = patched(NOTE, [set(['hp'], 7, 9), set(['name'], 'Orc', 'Ogre')]);
    expect(readAsObsidian(result.text)).toMatchObject({ hp: 9, name: 'Goblin' });
    expect(result.conflicts).toEqual([set(['name'], 'Orc', 'Ogre')]);
  });

  it('counts a value that already is the new one as applied, without writing', () => {
    const result = patched(NOTE, [set(['hp'], 5, 7)]);
    expect(result).toEqual({ text: NOTE, applied: [set(['hp'], 5, 7)], conflicts: [] });
  });

  it('adds a key at the end of the frontmatter, and nested keys to their map', () => {
    const result = patched(NOTE, [set(['ac'], undefined, 15), set(['speed', 'fly'], undefined, 60)]);
    expect(result.text).toBe(NOTE.replace('  climb: 15\n', '  climb: 15\n  fly: 60\n').replace('  - darkvision\n', '  - darkvision\nac: 15\n'));
  });

  it('creates a missing top-level key with the maps its path runs through', () => {
    const result = patched(NOTE, [set(['saves', 'dex'], undefined, 2)]);
    expect(readAsObsidian(result.text).saves).toEqual({ dex: 2 });
    expect(result.text).toContain('  - darkvision\nsaves:\n  dex: 2\n---');
  });

  it('creates nothing below the top level and never grows a list', () => {
    const patches = [set(['speed', 'burrow', 'feet'], undefined, 5), set(['senses', 3], undefined, 'x'), set(['hp', 'max'], undefined, 7)];
    expect(patched(NOTE, patches)).toEqual({ text: NOTE, applied: [], conflicts: patches });
  });

  it('expects absence when the base is undefined', () => {
    expect(patched(NOTE, [set(['hp'], undefined, 9)]).conflicts).toHaveLength(1);
  });

  it('writes a list in place of a scalar and a scalar in place of a list', () => {
    const result = patched(NOTE, [set(['name'], 'Goblin', ['Goblin', 'Boss']), set(['senses'], ['darkvision'], 'none')]);
    expect(result.text).toBe(NOTE
      .replace('name: Goblin\n', 'name:\n  - Goblin\n  - Boss\n')
      .replace('senses:\n  - darkvision\n', 'senses: none\n'));
  });

  it('replaces a whole entry and a whole list', () => {
    const result = patched(NOTE, [
      set(['actions', 1], { name: 'Bow', desc: 'Shoot' }, { name: 'Longbow', desc: 'Shoot far' }),
      set(['speed'], { walk: 30, climb: 15 }, { walk: 25 }),
    ]);
    expect(result.text).toBe(NOTE
      .replace('  - name: Bow\n    desc: Shoot\n', '  - name: Longbow\n    desc: Shoot far\n')
      .replace('  walk: 30\n  climb: 15\n', '  walk: 25\n'));
  });
});

describe('delete', () => {
  it('removes exactly the key’s lines', () => {
    expect(patched(NOTE, [{ op: 'delete', path: ['speed'], base: { walk: 30, climb: 15 } }]).text)
      .toBe(NOTE.replace('speed:\n  walk: 30\n  climb: 15\n', ''));
    expect(patched(NOTE, [{ op: 'delete', path: ['speed', 'walk'], base: 30 }]).text).toBe(NOTE.replace('  walk: 30\n', ''));
  });

  it('removes a list item, and the first key of an item without its dash', () => {
    expect(patched(NOTE, [{ op: 'delete', path: ['actions', 0], base: { name: 'Scimitar', desc: 'Slash' } }]).text)
      .toBe(NOTE.replace('  - name: Scimitar\n    desc: Slash\n', ''));
    expect(patched(NOTE, [{ op: 'delete', path: ['actions', 0, 'name'], base: 'Scimitar' }]).text)
      .toBe(NOTE.replace('  - name: Scimitar\n    desc: Slash\n', '  - desc: Slash\n'));
  });

  it('leaves an emptied nested list or map as [] or {}', () => {
    expect(patched(NOTE, [{ op: 'delete', path: ['senses', 0], base: 'darkvision' }]).text)
      .toBe(NOTE.replace('senses:\n  - darkvision\n', 'senses: []\n'));
    const result = patched(lines('a:', '  b: 1'), [{ op: 'delete', path: ['a', 'b'], base: 1 }]);
    expect(result.text).toBe(lines('a: {}'));
  });

  it('can empty the frontmatter', () => {
    expect(patched('---\na: 1\n---\nBody', [{ op: 'delete', path: ['a'], base: 1 }]).text).toBe('---\n---\nBody');
  });

  it('is applied without a write when the key is already gone, and a conflict when its value changed', () => {
    expect(patched(NOTE, [{ op: 'delete', path: ['ac'], base: 12 }])).toMatchObject({ text: NOTE, conflicts: [] });
    expect(patched(NOTE, [{ op: 'delete', path: ['hp'], base: 8 }])).toMatchObject({ text: NOTE, applied: [] });
  });
});

describe('insert, remove and move', () => {
  const claw = { name: 'Claw', desc: 'Scratch' };
  const bow = { name: 'Bow', desc: 'Shoot' };
  const scimitar = { name: 'Scimitar', desc: 'Slash' };

  it('inserts after an item found by value, or first', () => {
    const after = patched(NOTE, [{ op: 'insert', list: 'actions', after: scimitar, item: claw }]);
    expect(after.text).toBe(NOTE.replace('  - name: Bow\n', '  - name: Claw\n    desc: Scratch\n  - name: Bow\n'));
    const first = patched(NOTE, [{ op: 'insert', list: 'senses', after: null, item: 'blindsight' }]);
    expect(first.text).toBe(NOTE.replace('  - darkvision\n', '  - blindsight\n  - darkvision\n'));
  });

  it('is idempotent and still allows duplicates', () => {
    const insert: NotePatch = { op: 'insert', list: 'actions', after: bow, item: claw };
    const once = patched(NOTE, [insert]).text;
    expect(patched(once, [insert])).toEqual({ text: once, applied: [insert], conflicts: [] });
    const twice = patched(once, [{ op: 'insert', list: 'actions', after: claw, item: claw }]);
    expect(readAsObsidian(twice.text).actions).toEqual([scimitar, bow, claw, claw]);
  });

  it('creates an absent list, and conflicts where the anchor or the list is missing', () => {
    expect(patched(NOTE, [{ op: 'insert', list: 'traits', after: null, item: 'Sneaky' }]).text)
      .toBe(NOTE.replace('  - darkvision\n', '  - darkvision\ntraits:\n  - Sneaky\n'));
    const stale: NotePatch[] = [
      { op: 'insert', list: 'traits', after: 'Sneaky', item: 'Bold' },
      { op: 'insert', list: 'actions', after: claw, item: claw },
      { op: 'insert', list: 'hp', after: null, item: 1 },
    ];
    expect(patched(NOTE, stale)).toEqual({ text: NOTE, applied: [], conflicts: stale });
  });

  it('fills an empty list in block style', () => {
    expect(patched(lines('tags: []'), [{ op: 'insert', list: 'tags', after: null, item: 'a' }]).text).toBe(lines('tags:', '  - a'));
  });

  it('removes an item by value wherever it went, and nothing when it is gone', () => {
    const reordered = NOTE.replace('  - name: Scimitar\n    desc: Slash\n  - name: Bow\n    desc: Shoot\n',
      '  - name: Bow\n    desc: Shoot\n  - name: Scimitar\n    desc: Slash\n');
    const remove: NotePatch = { op: 'remove', list: 'actions', item: scimitar };
    const result = patched(reordered, [remove]);
    expect(readAsObsidian(result.text).actions).toEqual([bow]);
    expect(patched(result.text, [remove])).toEqual({ text: result.text, applied: [remove], conflicts: [] });
  });

  it('moves an item after another, and to the front', () => {
    const toEnd = patched(NOTE, [{ op: 'move', list: 'actions', item: scimitar, after: bow }]);
    expect(toEnd.text).toBe(NOTE.replace('  - name: Scimitar\n    desc: Slash\n  - name: Bow\n    desc: Shoot\n',
      '  - name: Bow\n    desc: Shoot\n  - name: Scimitar\n    desc: Slash\n'));
    const back = patched(toEnd.text, [{ op: 'move', list: 'actions', item: scimitar, after: null }]);
    expect(back.text).toBe(NOTE);
  });

  it('counts a move that is already done as applied, and one whose item or anchor is gone as a conflict', () => {
    const done: NotePatch = { op: 'move', list: 'actions', item: bow, after: scimitar };
    expect(patched(NOTE, [done])).toEqual({ text: NOTE, applied: [done], conflicts: [] });
    const stale: NotePatch[] = [
      { op: 'move', list: 'actions', item: claw, after: null },
      { op: 'move', list: 'actions', item: bow, after: claw },
      { op: 'move', list: 'traits', item: bow, after: null },
    ];
    expect(patched(NOTE, stale)).toEqual({ text: NOTE, applied: [], conflicts: stale });
  });

  it('rewrites a flow list whose items move', () => {
    expect(patched(lines('tags: [a, b, c]'), [{ op: 'move', list: 'tags', item: 'a', after: 'c' }]).text).toBe(lines('tags: [b, c, a]'));
  });
});

describe('renameKey', () => {
  it('writes the new key in place and keeps the value’s text', () => {
    const text = lines('name: Goblin', 'hit_points: 7 # rolled', 'ac: 15');
    expect(patched(text, [{ op: 'renameKey', from: 'hit_points', to: 'hp' }]).text).toBe(lines('name: Goblin', 'hp: 7 # rolled', 'ac: 15'));
  });

  it('is a no-op when the old key is gone or the names are equal', () => {
    const patches: NotePatch[] = [{ op: 'renameKey', from: 'nope', to: 'hp' }, { op: 'renameKey', from: 'hp', to: 'hp' }];
    expect(patched(NOTE, patches)).toEqual({ text: NOTE, applied: patches, conflicts: [] });
  });

  it('drops the old key when the new one already holds its value, and conflicts when it holds another', () => {
    const same = lines('hp: 7', 'hit_points: 7');
    expect(patched(same, [{ op: 'renameKey', from: 'hit_points', to: 'hp' }]).text).toBe(lines('hp: 7'));
    const other = lines('hp: 7', 'hit_points: 9');
    expect(patched(other, [{ op: 'renameKey', from: 'hit_points', to: 'hp' }]).conflicts).toHaveLength(1);
  });

  it('lets a set follow a rename: a value under a former key moves, then changes', () => {
    const text = lines('hit_points: 7', 'ac: 15');
    const result = patched(text, [{ op: 'renameKey', from: 'hit_points', to: 'hp' }, set(['hp'], 7, 9)]);
    expect(result.text).toBe(lines('hp: 9', 'ac: 15'));
    expect(result.conflicts).toEqual([]);
  });
});

describe('index paths', () => {
  const list = lines(
    'actions:',
    '  - name: Bite',
    '    desc: Teeth',
    '  - name: Claw',
    '    desc: Nails',
    '  - name: Tail',
    '    desc: Swipe',
  );
  const actions = (text: string): unknown => readAsObsidian(text).actions;

  it('writes the item at the index when it still holds the base', () => {
    const result = patched(list, [set(['actions', 1, 'desc'], 'Nails', 'Talons')]);
    expect(actions(result.text)).toEqual([
      { name: 'Bite', desc: 'Teeth' }, { name: 'Claw', desc: 'Talons' }, { name: 'Tail', desc: 'Swipe' },
    ]);
  });

  it('follows the item that holds the base when the list was reordered', () => {
    const result = patched(list, [set(['actions', 0, 'desc'], 'Nails', 'Talons')]);
    expect(actions(result.text)).toEqual([
      { name: 'Bite', desc: 'Teeth' }, { name: 'Claw', desc: 'Talons' }, { name: 'Tail', desc: 'Swipe' },
    ]);
  });

  it('never writes into another entry: none or several holding the base is a conflict', () => {
    const twins = lines('actions:', '  - name: A', '    desc: Same', '  - name: B', '    desc: Same', '  - name: C', '    desc: Other');
    const patches = [set(['actions', 2, 'desc'], 'Same', 'New'), set(['actions', 1, 'desc'], 'Gone', 'New')];
    expect(patched(twins, patches)).toEqual({ text: twins, applied: [], conflicts: patches });
  });

  it('does not move a missing-key write to another entry', () => {
    const result = patched(list, [set(['actions', 0, 'range'], undefined, '5 ft.'), set(['actions', 0, 'name'], undefined, 'X')]);
    expect(actions(result.text)).toEqual([
      { name: 'Bite', desc: 'Teeth', range: '5 ft.' }, { name: 'Claw', desc: 'Nails' }, { name: 'Tail', desc: 'Swipe' },
    ]);
    expect(result.conflicts).toEqual([set(['actions', 0, 'name'], undefined, 'X')]);
  });

  it('finds a whole item at the nearest index that holds it', () => {
    const result = patched(list, [set(['actions', 0], { name: 'Tail', desc: 'Swipe' }, { name: 'Tail', desc: 'Sweep' })]);
    expect(actions(result.text)).toEqual([
      { name: 'Bite', desc: 'Teeth' }, { name: 'Claw', desc: 'Nails' }, { name: 'Tail', desc: 'Sweep' },
    ]);
  });

  it('deletes by the same rule', () => {
    const result = patched(list, [{ op: 'delete', path: ['actions', 2], base: { name: 'Claw', desc: 'Nails' } }]);
    expect(actions(result.text)).toEqual([{ name: 'Bite', desc: 'Teeth' }, { name: 'Tail', desc: 'Swipe' }]);
  });

  it('refuses malformed paths', () => {
    const patches = [set([], undefined, 1), set([0], undefined, 1), set(['actions', -1, 'desc'], 'Teeth', 'x'), set(['actions', 0.5], 1, 2), set(['__proto__'], undefined, 1)];
    expect(patched(list, patches)).toEqual({ text: list, applied: [], conflicts: patches });
  });
});
