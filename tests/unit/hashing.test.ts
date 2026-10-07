// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a32, hashJson, hashText, sha256 } from '../../src/app/utils/hashing';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The two inputs whose text is pinned: nested and reordered, and every kind of key the order sets apart. */
const NESTED = { b: 1, a: [2, { d: null, c: 'x' }] };
const KEY_KINDS = { a: 1, '10': 2, '2': 3, B: 4, 'é': 5, '😀': 6, '\uffff': 7, '': 8 };

describe('sha256', () => {
  it('gives the published SHA-256 of the empty string and of "abc"', async () => {
    expect(await sha256(bytes(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes an array and its buffer alike', async () => {
    const data = new Uint8Array(bytes('atlas-vtt/collections/Cairn/maps/map-1.json'));
    expect(await sha256(data.buffer)).toBe(await sha256(data));
  });

  it('hashes only the bytes a view shows', async () => {
    const data = bytes('abcdef');
    expect(await sha256(data.subarray(1, 4))).toBe(await sha256(bytes('bcd')));
  });
});

describe('canonicalJson', () => {
  it('sorts the keys of nested objects and keeps arrays in order', () => {
    expect(canonicalJson(NESTED)).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('orders keys as before: array-index keys first by value, then the rest by UTF-16 code units', () => {
    expect(canonicalJson(KEY_KINDS)).toBe('{"2":3,"10":2,"":8,"B":4,"a":1,"é":5,"😀":6,"\uffff":7}');
    expect(canonicalJson({ '4294967295': 1, '4294967294': 2, '01': 3, '-1': 4, '1.5': 5, '1': 6 }))
      .toBe('{"1":6,"4294967294":2,"-1":4,"01":3,"1.5":5,"4294967295":1}');
  });

  it('writes numbers, dates and missing values as JSON does', () => {
    const value = {
      z: -0, n: NaN, big: 1e21, small: 1e-7, inf: Infinity, ninf: -Infinity, u: undefined,
      d: new Date(Date.UTC(2026, 9, 7)), arr: [undefined, -0, NaN],
    };
    expect(canonicalJson(value))
      .toBe('{"arr":[null,0,null],"big":1e+21,"d":"2026-10-07T00:00:00.000Z","inf":null,"n":null,"ninf":null,"small":1e-7,"z":0}');
  });

  it('keeps an own __proto__ key read from a file', () => {
    expect(canonicalJson(JSON.parse('{"__proto__":{"b":1,"a":2},"z":0}'))).toBe('{"__proto__":{"a":2,"b":1},"z":0}');
  });
});

describe('hashJson', () => {
  it('keeps every stored fingerprint: the same hash whatever the key order', async () => {
    const pinned = '41f05899d3459a3ecc94ff088afcd290b9ae4f51dc9ddaa35a82a642ddb55070';
    expect(await hashJson(NESTED)).toBe(pinned);
    expect(await hashJson({ a: [2, { c: 'x', d: null }], b: 1 })).toBe(pinned);
  });

  it('tells arrays in another order apart', async () => {
    expect(await hashJson([1, 2])).not.toBe(await hashJson([2, 1]));
  });
});

describe('hashText', () => {
  it('keeps the stamps and ids it made before', () => {
    expect(hashText('')).toBe('wvjl67o803');
    expect(hashText('a')).toBe('262p94epp1d');
    expect(hashText('default')).toBe('1gw49ft1ahw');
    expect(hashText('Default')).toBe('2faaveaf735');
    expect(hashText('atlas-vtt/collections/default/tokens/orc.png')).toBe('1m05cx4wlif');
    expect(hashText('é😀')).toBe('3yjaate3wu');
  });
});

describe('fnv1a32', () => {
  it('gives the published FNV-1a values', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
    expect(fnv1a32('é😀')).toBe(0x44cc4da1);
  });

  it('returns an unsigned 32-bit integer for a long text outside the basic plane', () => {
    const value = fnv1a32('😀'.repeat(50_000));
    expect(value).toBe(0xfd491105);
    expect(Number.isInteger(value) && value >= 0 && value <= 0xffffffff).toBe(true);
  });
});
