import { deepEqual, findItemIndex, isFieldMap, matchingIndexes } from '../../../../src/app/statblocks/notes/listIdentity';

describe('deepEqual', () => {
  it('compares scalars by type and value', () => {
    expect(deepEqual(5, 5)).toBe(true);
    expect(deepEqual(5, '5')).toBe(false);
    expect(deepEqual('1/4', '1/4')).toBe(true);
    expect(deepEqual(true, 'true')).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(0, -0)).toBe(true);
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEqual('', null)).toBe(false);
  });

  it('compares lists in order and maps in any key order', () => {
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1], [1, 1])).toBe(false);
    expect(deepEqual({ name: 'Bite', desc: 'x' }, { desc: 'x', name: 'Bite' })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: null }, {})).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ 0: 'a' }, ['a'])).toBe(false);
  });
});

describe('findItemIndex', () => {
  const list = [{ name: 'A' }, { name: 'B' }, { name: 'A' }, 'x', 5];

  it('finds the first match without a preference', () => {
    expect(findItemIndex(list, { name: 'A' })).toBe(0);
    expect(findItemIndex(list, 'x')).toBe(3);
    expect(findItemIndex(list, '5')).toBe(-1);
  });

  it('keeps the preferred index when it holds the item, else takes the nearest match', () => {
    expect(findItemIndex(list, { name: 'A' }, 2)).toBe(2);
    expect(findItemIndex(list, { name: 'A' }, 3)).toBe(2);
    expect(findItemIndex(list, { name: 'A' }, 1)).toBe(0);
    expect(findItemIndex(list, { name: 'B' }, 4)).toBe(1);
    expect(findItemIndex(list, { name: 'C' }, 0)).toBe(-1);
    expect(findItemIndex(list, 5, 99)).toBe(4);
  });
});

describe('helpers', () => {
  it('lists matching indexes and tells maps from lists', () => {
    expect(matchingIndexes(['a', 'b', 'a'], (index) => index !== 1)).toEqual([0, 2]);
    expect(isFieldMap({})).toBe(true);
    expect(isFieldMap([])).toBe(false);
    expect(isFieldMap(null)).toBe(false);
    expect(isFieldMap(undefined)).toBe(false);
  });
});
