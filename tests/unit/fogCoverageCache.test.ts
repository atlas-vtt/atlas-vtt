import { afterEach, describe, expect, it, vi } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import * as coverage from '../../src/app/fog/fogCoverage';
import { FogCoverageCache } from '../../src/app/fog/FogCoverageCache';
import * as operations from '../../src/app/fog/fogOperationShape';
import { fogRectangle } from '../helpers/fogOperations';

afterEach(() => vi.restoreAllMocks());

describe('shared committed fog cache', () => {
  it('shares one coverage across readers without enumerating an unchanged record again', () => {
    const cache = new FogCoverageCache();
    let enumerations = 0;
    const record = new Proxy({ paint: fogRectangle() }, { ownKeys(target): string[] { enumerations++; return Object.keys(target); } });
    const first = cache.get(record, 'a');
    expect(first?.covers({ x: 10, y: 10 })).toBe(true);
    expect(cache.get(record, 'a')).toBe(first);
    expect(cache.get(record, 'a')).toBe(first);
    expect(enumerations).toBe(1);
  });

  it('appends a new operation but fully replays restored undo and redo records', () => {
    const cache = new FogCoverageCache();
    const first = { paint: fogRectangle() };
    const second = { ...first, erase: fogRectangle({ id: 'erase', timestamp: 2, width: 10, isErasing: true }) };
    const build = vi.spyOn(coverage, 'fogCoverage');
    const initial = cache.get(first);
    const appended = cache.get(second);
    expect(build.mock.calls[1]?.[1]).toBe(initial);
    expect(appended?.covers({ x: 5, y: 5 })).toBe(false);
    const restored = cache.get(first);
    expect(build.mock.calls[2]?.[1]).toBeUndefined();
    expect(restored?.covers({ x: 5, y: 5 })).toBe(true);
    expect(cache.get(second)?.shape).toEqual(appended?.shape);
    expect(build.mock.calls[3]?.[1]).toBeUndefined();
    cache.get(second);
    expect(build).toHaveBeenCalledTimes(4);
  });

  it('resets on map lookup before renderer subscribers, even for a shared record', () => {
    const cache = new FogCoverageCache();
    const record = { paint: fogRectangle() };
    const build = vi.spyOn(coverage, 'fogCoverage');
    const a = cache.get(record, 'a');
    const b = cache.get(record, 'b');
    expect(b).not.toBe(a);
    expect(cache.get(record, 'b')).toBe(b);
    const back = cache.get(record, 'a');
    expect(back).not.toBe(a);
    expect(cache.get(record, 'a')).toBe(back);
    expect(build).toHaveBeenCalledTimes(3);
    expect(build.mock.calls.every(call => call[1] === undefined)).toBe(true);
  });

  it('caches invalid geometry as null and recovers when the record changes', () => {
    const cache = new FogCoverageCache();
    const valid = { paint: fogRectangle() };
    const invalid = { paint: fogRectangle({ width: Number.NaN }) };
    const build = vi.spyOn(coverage, 'fogCoverage');
    expect(cache.get(valid)?.covers({ x: 10, y: 10 })).toBe(true);
    expect(cache.get(invalid)).toBeNull();
    expect(cache.get(invalid)).toBeNull();
    expect(build).toHaveBeenCalledTimes(2);
    expect(cache.get(valid)?.covers({ x: 10, y: 10 })).toBe(true);
    expect(build.mock.calls[2]?.[1]).toBeUndefined();
  });

  it('distinguishes valid empty coverage from invalid geometry', () => {
    const cache = new FogCoverageCache();
    expect(cache.get({})?.covers({ x: 10, y: 10 })).toBe(false);
    expect(cache.get({ paint: fogRectangle({ width: 0 }) })?.shape).toEqual([]);
    expect(cache.get({ paint: fogRectangle({ width: 0, offsetX: Infinity }) })).toBeNull();
  });

  it('reset forgets both coverage and observed records', () => {
    const cache = new FogCoverageCache();
    const first = { paint: fogRectangle() };
    const second = { ...first, erase: fogRectangle({ id: 'erase', timestamp: 2, isErasing: true }) };
    cache.get(first, 'a');
    cache.get(second, 'a');
    cache.reset();
    const build = vi.spyOn(coverage, 'fogCoverage');
    const initial = cache.get(first, 'a');
    cache.get(second, 'a');
    expect(build.mock.calls[0]?.[1]).toBeUndefined();
    expect(build.mock.calls[1]?.[1]).toBe(initial);
  });
});

describe('fog coverage reuse', () => {
  it('returns the same object without enumeration or geometry for an unchanged record', () => {
    let enumerations = 0;
    const record = new Proxy({ paint: fogRectangle() }, { ownKeys(target): string[] { enumerations++; return Object.keys(target); } });
    const first = fogCoverage(record);
    const convert = vi.spyOn(operations, 'fogOperationShape');
    expect(fogCoverage(record, first)).toBe(first);
    expect(enumerations).toBe(1);
    expect(convert).not.toHaveBeenCalled();
  });

  it('converts only one appended latest operation, including an equal timestamp', () => {
    for (const timestamp of [1, 2]) {
      const record = { paint: fogRectangle() };
      const first = fogCoverage(record);
      const next = { ...record, erase: fogRectangle({ id: 'erase', timestamp, isErasing: true, width: 10 }) };
      const convert = vi.spyOn(operations, 'fogOperationShape');
      const appended = fogCoverage(next, first);
      expect(convert).toHaveBeenCalledTimes(1);
      convert.mockRestore();
      expect(appended.shape).toEqual(fogCoverage(next).shape);
    }
  });

  it('fully replays edited, replaced, reordered, deleted and earlier-inserted records', () => {
    const a = fogRectangle({ timestamp: 2 });
    const b = fogRectangle({ id: 'b', timestamp: 3, x: 4, width: 8, isErasing: true });
    const record = { a, b };
    const first = fogCoverage(record);
    const changes = [{ a: { ...a, offsetX: 4 }, b }, { a: { ...a }, b }, { b, a }, { a },
      { a, b, earlier: fogRectangle({ id: 'earlier', timestamp: 1 }) }];
    for (const next of changes) {
      const convert = vi.spyOn(operations, 'fogOperationShape');
      const rebuilt = fogCoverage(next, first);
      expect(convert).toHaveBeenCalledTimes(Object.keys(next).length);
      convert.mockRestore();
      expect(rebuilt.shape).toEqual(fogCoverage(next).shape);
    }
  });

  it('fully rebuilds a bulk append and never mutates prior coverage', () => {
    const a = fogRectangle();
    const first = fogCoverage({ a });
    const snapshot = structuredClone(first.shape);
    const record = { a, b: fogRectangle({ id: 'b', x: 40 }), c: fogRectangle({ id: 'c', y: 40 }) };
    const convert = vi.spyOn(operations, 'fogOperationShape');
    const next = fogCoverage(record, first);
    expect(convert).toHaveBeenCalledTimes(3);
    expect(first.shape).toEqual(snapshot);
    expect(next).not.toBe(first);
  });
});
