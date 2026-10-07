import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { restore, towards } from '../../src/app/stores/history/towards';
import type { HistorySnapshot } from '../../src/app/stores/history';

const RUNS = Number(process.env.VITE_HISTORY_RUNS ?? 300);

type Entities = Record<string, { v: number }>;
const keys = (record: object | undefined): string[] => (record ? Object.keys(record) : []);
const objectsOf = (slice: HistorySnapshot): Record<string, Entities> => slice.objects as Record<string, Entities>;
const slice = (objects: Record<string, Entities>, rest: Partial<HistorySnapshot> = {}): HistorySnapshot => ({
  objects, grid: null, background: null, widgetValues: {}, exploredEdits: 0, ...rest,
});

describe('putting back what a step changed', () => {
  it('puts a deleted entity back at its old place, among the ones added since', () => {
    const a = { v: 1 }; const b = { v: 2 }; const c = { v: 3 }; const d = { v: 4 };
    const before = { a, b, c };
    const after = { a, c };
    const result = towards({ a, c, d }, after, before, 1) as Entities;
    expect(keys(result)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.b).toBe(b);
  });

  it('leaves the first light zone absent again once it is undone', () => {
    const tokens = { t: { v: 1 } };
    const before = slice({ tokens });
    const after = slice({ tokens, lightZones: { z: { v: 1 } } });
    const current = slice({ tokens: { ...tokens, u: { v: 2 } }, lightZones: { z: { v: 1 } } });
    const result = restore(current, after, before);
    expect(keys(result.objects as object)).toEqual(['tokens']);
    expect(objectsOf(result).tokens).toBe(current.objects && objectsOf(current).tokens);
  });

  it('keeps a light zone added since beside the first one', () => {
    const z = { v: 1 }; const y = { v: 2 };
    const before = slice({ tokens: {} });
    const after = slice({ tokens: {}, lightZones: { z } });
    const result = restore(slice({ tokens: {}, lightZones: { z, y } }), after, before);
    expect(objectsOf(result).lightZones).toEqual({ y });
  });

  it('puts back an order the step changed', () => {
    const a = { v: 1 }; const b = { v: 2 }; const c = { v: 3 };
    const before = { a, b };
    const after = { b, a };
    expect(towards(after, after, before, 1)).toBe(before);
    expect(keys(towards({ b, a, c }, after, before, 1) as object)).toEqual(['a', 'b', 'c']);
  });

  it('keeps entities added since, and their values', () => {
    const a = { v: 1 }; const a2 = { v: 2 }; const x = { v: 9 };
    const result = towards({ a: a2, x }, { a: a2 }, { a }, 1) as Entities;
    expect(result).toEqual({ a, x });
    expect(result.x).toBe(x);
  });

  it('keeps integer-like ids in their order', () => {
    const one = { v: 1 }; const two = { v: 2 }; const ten = { v: 10 }; const b = { v: 0 };
    const result = towards({ 1: one, 10: ten, b }, { 1: one, 10: ten }, { 1: one, 2: two, 10: ten }, 1) as Entities;
    expect(keys(result)).toEqual(['1', '2', '10', 'b']);
  });

  it('writes a changed value in its place when an earlier entity was removed since', () => {
    const a = { v: 1 }; const b = { v: 2 }; const b2 = { v: 3 }; const c = { v: 4 };
    const result = towards({ b: b2, c }, { a, b: b2, c }, { a, b, c }, 1) as Entities;
    expect(keys(result)).toEqual(['b', 'c']);
    expect(result.b).toBe(b);
  });

  it('keeps an entity whose id is __proto__, as a map file may name one', () => {
    const odd = { v: 1 }; const b = { v: 2 }; const b2 = { v: 3 }; const c = { v: 4 };
    const before = Object.fromEntries([['__proto__', odd], ['b', b]]) as Entities;
    const after = { ...before, b: b2 };
    const result = towards({ ...after, c }, after, before, 1) as Entities;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(keys(result)).toEqual(['__proto__', 'b', 'c']);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe(odd);
    expect(result.b).toBe(b);
  });

  it('gives back the old objects themselves where nothing else changed since', () => {
    const before = slice({ tokens: { a: { v: 1 } } }, { grid: { size: 70 } });
    const after = slice({ tokens: { a: { v: 2 } } }, { grid: { size: 50 } });
    const result = restore(after, after, before);
    expect(result.objects).toBe(before.objects);
    expect(result.grid).toBe(before.grid);
  });

  it('leaves branches the step did not change as they are now', () => {
    const before = slice({ tokens: {} });
    const after = { ...before, background: 'map.webp' };
    const current = { ...after, grid: { size: 50 } };
    const result = restore(current, after, before);
    expect(result.grid).toBe(current.grid);
    expect(result.background).toBeNull();
  });
});

const entity = fc.integer({ min: 0, max: 3 }).map((v) => ({ v }));
const id = fc.constantFrom('a', 'b', 'c', 'd', '1', '2', '10', '07');
const entities = fc.dictionary(id, entity, { maxKeys: 6 });
const objects = fc.record({ tokens: entities, walls: entities, lightZones: entities }, { requiredKeys: ['tokens'] });
const tracked = fc.record({
  objects,
  grid: fc.option(fc.record({ size: fc.integer({ min: 10, max: 90 }) })),
  background: fc.option(fc.constantFrom('a.webp', 'b.webp')),
  widgetValues: fc.dictionary(fc.constantFrom('w1', 'w2', '3'), fc.integer({ min: 0, max: 5 }), { maxKeys: 3 }),
  exploredEdits: fc.integer({ min: 0, max: 3 }),
});

/** A copy with every object new and every key in its place. */
function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = clone((value as Record<string, unknown>)[key]);
  return copy as T;
}

const order = (value: unknown): unknown => (value && typeof value === 'object' ? Object.keys(value).map((key) => [key, order((value as Record<string, unknown>)[key])]) : value);

describe('putting back towards a side, for any two sides', () => {
  it('gives that side, key order included, from a copy of the other side', () => {
    fc.assert(fc.property(tracked, tracked, (from, to) => {
      const result = restore(clone(from), from, to);
      expect(order(result)).toEqual(order(to));
    }), { numRuns: RUNS });
  });

  it('gives that side itself from the other side itself', () => {
    fc.assert(fc.property(tracked, tracked, (from, to) => {
      const result = restore(from, from, to);
      for (const branch of ['objects', 'grid', 'background', 'widgetValues', 'exploredEdits'] as const) {
        expect(result[branch]).toBe(to[branch]);
      }
    }), { numRuns: RUNS });
  });
});
