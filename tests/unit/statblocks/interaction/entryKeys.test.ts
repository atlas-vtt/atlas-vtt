import { describe, expect, it } from 'vitest';
import { entryItemKeys, keyedEntryItems } from '../../../../src/app/statblocks/values/entryKeys';

/** Item identities (spec §7.2, J4): a content hash plus the occurrence among equal items. */
describe('entryItemKeys', () => {
  const bite = { name: 'Bite', desc: 'It bites.' };
  const lash = { name: 'Lash', desc: 'It lashes.' };

  it('keys an item by its content, so a key follows its item through a move', () => {
    const before = entryItemKeys([bite, lash]);
    const after = entryItemKeys([lash, bite]);
    expect(after).toEqual([before[1], before[0]]);
  });

  it('tells equal items apart by how many came before them', () => {
    const [first, second] = entryItemKeys([bite, { ...bite }]);
    expect(first).not.toBe(second);
    expect(first?.split('~')[0]).toBe(second?.split('~')[0]);
  });

  it('reads map keys in any order as the same item', () => {
    expect(entryItemKeys([{ name: 'Bite', desc: 'x' }])).toEqual(entryItemKeys([{ desc: 'x', name: 'Bite' }]));
  });

  it('keys the entries a value shows, with their place in the stored list', () => {
    const keyed = keyedEntryItems([bite, null, lash]);
    expect(keyed.map((entry) => entry.index)).toEqual([0, 2]);
    expect(keyed.map((entry) => entry.key)).toEqual([entryItemKeys([bite, null, lash])[0], entryItemKeys([bite, null, lash])[2]]);
    expect(keyedEntryItems('A lone entry.')).toHaveLength(1);
    expect(keyedEntryItems(undefined)).toEqual([]);
  });
});
