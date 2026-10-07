// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a32, hashJson, hashText, sha256 } from '../../src/app/utils/hashing';
import { throwRandom } from '../../src/app/dice3d/throwSeed';
import type { Rng } from '../../src/app/dice3d/dieTour';
import * as frozen from '../oracles/helperBaseline/hashing';
import { hashText as frozenHashText } from '../oracles/helperBaseline/libraryState';
import { throwRandom as frozenThrowRandom } from '../oracles/helperBaseline/throwSeed';
import { pathDigest as frozenPathDigest } from '../oracles/helperBaseline/thumbnailDigest';
import { between, hashStrings, random } from '../helpers/hashCorpus';

type Bytes = ArrayBuffer | Uint8Array;
type Hasher<T> = (input: T) => string | Promise<string>;

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The first input on which `candidate` and `reference` disagree, or null when they agree on every one. */
async function firstMismatch<T>(candidate: Hasher<T>, reference: Hasher<T>, corpus: readonly T[]): Promise<{ input: T } | null> {
  for (const input of corpus) {
    if (await candidate(input) !== await reference(input)) return { input };
  }
  return null;
}

/** Byte inputs around SHA-256's block and padding sizes, each also as its buffer, and views into larger buffers. */
function byteInputs(): Bytes[] {
  const rng = random(0xb17e5);
  const fill = (length: number): Uint8Array<ArrayBuffer> => Uint8Array.from({ length }, () => between(rng, 0, 255));
  const lengths = [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128];
  for (let n = 0; n < 40; n++) lengths.push(between(rng, 0, 4096));
  const inputs: Bytes[] = [];
  for (const length of lengths) {
    const data = fill(length);
    inputs.push(data, data.buffer);
  }
  for (let n = 0; n < 24; n++) {
    const length = lengths[between(rng, 0, lengths.length - 1)]!;
    const offset = between(rng, 1, 64);
    inputs.push(new Uint8Array(fill(offset + length + between(rng, 1, 64)).buffer, offset, length));
  }
  inputs.push(new Uint8Array(fill(16).buffer, 8, 0));
  return inputs;
}

/** Keys that test the serialiser's order: array-index keys, keys that only look like numbers, every UTF-16 range, prototype names. */
const KEYS = ['', 'a', 'B', 'é', '😀', '\uffff', '10', '2', '01', '-1', '1.5', '4294967294', '4294967295', '__proto__', 'constructor', 'toJSON'];

/** A seeded JSON value: leaves of every kind, those JSON rewrites among them (-0, NaN, infinities, dates, undefined), containers while `depth` is below 4. */
function jsonValue(rng: () => number, strings: readonly string[], depth: number): unknown {
  switch (between(rng, 0, depth < 4 ? 13 : 11)) {
    case 0: return null;
    case 1: return rng() < 0.5;
    case 2: return between(rng, -1000, 1000);
    case 3: return (rng() - 0.5) * 1e6;
    case 4: return -0;
    case 5: return NaN;
    case 6: return rng() < 0.5 ? Infinity : -Infinity;
    case 7: return rng() < 0.5 ? 1e21 : 1e-7;
    case 8: case 9: return strings[between(rng, 0, strings.length - 1)];
    case 10: return undefined;
    case 11: return new Date(between(rng, 0, 4_000_000) * 1_000_000);
    case 12: return Array.from({ length: between(rng, 0, 5) }, () => jsonValue(rng, strings, depth + 1));
    default: return jsonObject(rng, strings, depth + 1);
  }
}

/** An object with a seeded subset of `KEYS` in seeded order; an own `__proto__` key stays a key, as when read from a file. */
function jsonObject(rng: () => number, strings: readonly string[], depth: number): Record<string, unknown> {
  const keys = KEYS.filter(() => rng() < 0.4);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = between(rng, 0, i);
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  }
  return Object.fromEntries(keys.map((key) => [key, jsonValue(rng, strings, depth)]));
}

/** 500 seeded values of depth up to 4, after the pinned inputs and an own `__proto__` key read with `JSON.parse`. */
function jsonValues(strings: readonly string[]): unknown[] {
  const rng = random(0x7a5e);
  const values: unknown[] = [
    { b: 1, a: [2, { d: null, c: 'x' }] },
    { a: 1, '10': 2, '2': 3, B: 4, 'é': 5, '😀': 6, '\uffff': 7, '': 8 },
    JSON.parse('{"__proto__":{"b":1,"a":2},"z":0}'),
  ];
  for (let n = 0; n < 500; n++) {
    values.push(rng() < 0.8 ? jsonObject(rng, strings, 1) : Array.from({ length: between(rng, 0, 5) }, () => jsonValue(rng, strings, 1)));
  }
  return values;
}

const BYTES = byteInputs();
const STRINGS = hashStrings();
const JSON_VALUES = jsonValues(STRINGS.filter((text) => text.length <= 64));
const STREAMS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 1000];

/** The first eight draws of every stream of a roll, as text that holds each number exactly. */
const draws = (make: (rollId: string, stream: number) => Rng) => (rollId: string): string =>
  STREAMS.map((stream) => {
    const rng = make(rollId, stream);
    return Array.from({ length: 8 }, () => rng()).join(',');
  }).join(';');

const isView = (data: Bytes): boolean => data instanceof Uint8Array && data.byteLength !== data.buffer.byteLength;

describe('hashes compared with the code they replaced', () => {
  it('hashes every byte input as before', async () => {
    expect(BYTES.filter(isView).length).toBeGreaterThanOrEqual(21);
    expect(await firstMismatch(sha256, frozen.sha256, BYTES)).toBeNull();
  });

  it('keeps every stored fingerprint of JSON values', async () => {
    expect(await firstMismatch(hashJson, frozen.hashJson, JSON_VALUES)).toBeNull();
    expect(await firstMismatch((value) => sha256(encode(canonicalJson(value))), frozen.hashJson, JSON_VALUES)).toBeNull();
  });

  it('stamps every text as before', async () => {
    expect(await firstMismatch(hashText, frozenHashText, STRINGS)).toBeNull();
  });

  it('gives every path the digest its thumbnail is named by', async () => {
    const digest = (text: string): string => fnv1a32(text).toString(16).padStart(8, '0');
    expect(await firstMismatch(digest, frozenPathDigest, STRINGS)).toBeNull();
  });

  it('throws every roll as before', async () => {
    expect(await firstMismatch(draws(throwRandom), draws(frozenThrowRandom), STRINGS.slice(0, 200))).toBeNull();
  });
});

/** cyrb53 as the library state module had it, with its first seed one lower. */
function cyrb53OtherSeed(text: string): string {
  let h1 = 0xdeadbeee;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const hex = (value: number): string => value.toString(16).padStart(8, '0');

function fnvOverUtf8(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return hex(h >>> 0);
}

function fnvSigned(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hex(h);
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** JSON whose object keys `JSON.stringify` writes in the order `compare` sorts them, rebuilt as the old serialiser did. */
const sortedBy = (compare: (a: string, b: string) => number) => (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => compare(a, b)));
  });

/** JSON written key by key in UTF-16 order, so array-index keys are not moved first. */
function inCodeUnitOrder(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inCodeUnitOrder).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(byCodeUnits).map((key) => `${JSON.stringify(key)}:${inCodeUnitOrder(record[key])}`).join(',')}}`;
}

function topLevelSorted(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => byCodeUnits(a, b))));
}

const hashedWith = (serialise: (value: unknown) => string) => (value: unknown): Promise<string> =>
  frozen.sha256(encode(serialise(value)));

describe('the comparisons can fail', () => {
  it('tells a cyrb53 with another seed apart', async () => {
    expect(await firstMismatch(cyrb53OtherSeed, frozenHashText, STRINGS)).not.toBeNull();
  });

  it('tells FNV-1a over UTF-8 bytes apart on text beyond ASCII', async () => {
    const found = await firstMismatch(fnvOverUtf8, frozenPathDigest, STRINGS);
    expect(found && /[^\u0000-\u007f]/.test(found.input)).toBe(true);
  });

  it('tells an FNV-1a left signed apart', async () => {
    const found = await firstMismatch(fnvSigned, frozenPathDigest, STRINGS);
    expect(found?.input).not.toBe('');
    expect(await firstMismatch(fnvSigned, frozenPathDigest, ['a'])).not.toBeNull();
    expect(await firstMismatch(fnvSigned, frozenPathDigest, [''])).toBeNull();
  });

  it('tells keys sorted by locale apart', async () => {
    expect(await firstMismatch(hashedWith(sortedBy((a, b) => a.localeCompare(b))), frozen.hashJson, JSON_VALUES)).not.toBeNull();
  });

  it('tells keys in plain UTF-16 order apart', async () => {
    expect(await firstMismatch(hashedWith(inCodeUnitOrder), frozen.hashJson, JSON_VALUES)).not.toBeNull();
    expect(await firstMismatch(hashedWith(inCodeUnitOrder), frozen.hashJson, [{ a: 1, '2': 2 }])).toBeNull();
  });

  it('tells keys sorted only at the top apart', async () => {
    expect(await firstMismatch(hashedWith(topLevelSorted), frozen.hashJson, JSON_VALUES)).not.toBeNull();
  });

  it('tells unsorted keys apart', async () => {
    expect(await firstMismatch(hashedWith((value) => JSON.stringify(value)), frozen.hashJson, JSON_VALUES)).not.toBeNull();
  });

  it('tells hashing a view’s whole buffer apart', async () => {
    const wholeBuffer = (data: Bytes): Promise<string> => frozen.sha256(data instanceof Uint8Array ? new Uint8Array(data.buffer) : data);
    const found = await firstMismatch(wholeBuffer, frozen.sha256, BYTES);
    expect(found !== null && isView(found.input)).toBe(true);
  });
});
