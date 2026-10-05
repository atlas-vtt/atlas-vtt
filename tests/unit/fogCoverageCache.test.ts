import { afterEach, describe, expect, it, vi } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import * as operations from '../../src/app/fog/fogOperationShape';
import { fogRectangle } from '../helpers/fogOperations';

afterEach(() => vi.restoreAllMocks());

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
