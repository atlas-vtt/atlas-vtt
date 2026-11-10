import { describe, expect, it } from 'vitest';
import { BlockIdAllocator, derivedBlockId, isBlockId } from '../../../../src/app/statblocks/format/blockIds';
import { describeValue, jsonCopy, sameJson } from '../../../../src/app/statblocks/format/jsonValues';

describe('jsonCopy', () => {
  it('copies JSON values without sharing them', () => {
    const value = { a: [1, 'two', { three: true }], b: null };
    const copy = jsonCopy(value);
    expect(copy).toEqual(value);
    expect(copy).not.toBe(value);
  });

  it('writes what JSON writes for values JSON does not hold', () => {
    expect(jsonCopy({ a: undefined, b: () => 1, c: Symbol('c'), d: Number.NaN, e: [undefined, Number.POSITIVE_INFINITY] }))
      .toEqual({ d: null, e: [null, null] });
    expect(jsonCopy(undefined)).toBeUndefined();
    expect(jsonCopy(() => 1)).toBeUndefined();
  });

  it('gives up on cycles and on nesting deeper than JSON writing allows', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(jsonCopy(cycle)).toBeUndefined();
    let deep: unknown = 1;
    for (let level = 0; level < 150; level += 1) deep = [deep];
    expect(jsonCopy(deep)).toBeUndefined();
    expect(jsonCopy({ ok: 1, deep })).toBeUndefined();
  });

  it('gives up on shared children that multiply past its budget', () => {
    let shared: unknown = [1];
    for (let level = 0; level < 40; level += 1) shared = [shared, shared];
    expect(jsonCopy(shared)).toBeUndefined();
  });

  it('keeps __proto__ as an own key', () => {
    const copy = jsonCopy(JSON.parse('{"__proto__": {"x": 1}}'));
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.keys(copy as object)).toEqual(['__proto__']);
  });
});

describe('sameJson', () => {
  it('compares as JSON does', () => {
    expect(sameJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson([], {})).toBe(false);
    expect(sameJson(undefined, null)).toBe(false);
  });
});

describe('describeValue', () => {
  it('names values briefly', () => {
    expect(describeValue('x'.repeat(100))).toBe(`"${'x'.repeat(40)}…"`);
    expect([1, true, null, [], {}, undefined].map(describeValue)).toEqual(['1', 'true', 'null', 'a list', 'an object', 'nothing']);
  });
});

describe('block ids', () => {
  it('derives 8 base36 characters from a place, the same every time', () => {
    const id = derivedBlockId([2, 0, 5], 0);
    expect(isBlockId(id)).toBe(true);
    expect(derivedBlockId([2, 0, 5], 0)).toBe(id);
    expect(derivedBlockId([2, 0, 5], 1)).not.toBe(id);
    expect(derivedBlockId([20, 5], 0)).not.toBe(derivedBlockId([2, 0, 5], 0));
  });

  it('derives distinct ids for many places', () => {
    const ids = new Set<string>();
    for (let a = 0; a < 100; a += 1) for (let b = 0; b < 100; b += 1) ids.add(derivedBlockId([a, b], 0));
    expect(ids.size).toBe(10_000);
  });

  it('hands derived ids out after every claim, avoiding claimed ones', () => {
    const problems: string[] = [];
    const ids = new BlockIdAllocator(problems);
    const waiting = { id: '' };
    expect(ids.claim(undefined, 'Block 1')).toBeNull();
    ids.defer(waiting, [0]);
    expect(ids.claim(derivedBlockId([0], 0), 'Block 2')).toBe(derivedBlockId([0], 0));
    expect(ids.claim(derivedBlockId([0], 0), 'Block 3')).toBeNull();
    ids.assign();
    expect(waiting.id).toBe(derivedBlockId([0], 1));
    expect(problems).toEqual([expect.stringContaining('Block 3: its id')]);
  });

  it('accepts only 8 lowercase letters or digits', () => {
    expect(['abcdefgh', '01234567', 'a1b2c3d4'].every(isBlockId)).toBe(true);
    expect(['abcdefg', 'abcdefghi', 'ABCDEFGH', 'abcd-fgh', 12345678, null].some(isBlockId)).toBe(false);
  });
});
