import { describe, expect, it } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { canonicalForm } from '../../src/app/lighting/canonicalForm';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { fogRectangle } from '../helpers/fogOperations';

describe('committed fog coverage', () => {
  it('replays timestamps rather than record or id order', () => {
    const paint = fogRectangle({ id: 'z', timestamp: 1 });
    const erase = fogRectangle({ id: 'a', timestamp: 2, isErasing: true, x: 4, y: 4, width: 12, height: 12 });
    const island = fogRectangle({ id: 'm', timestamp: 3, x: 8, y: 8, width: 4, height: 4 });
    const coverage = fogCoverage({ island, erase, paint });
    expect(coverage.covers({ x: 1, y: 1 })).toBe(true);
    expect(coverage.covers({ x: 5, y: 5 })).toBe(false);
    expect(coverage.covers({ x: 9, y: 9 })).toBe(true);
    expect(canonicalForm(coverage.shape)).toEqual(coverage.shape);
  });

  it('preserves record enumeration order when timestamps tie', () => {
    const paint = fogRectangle({ id: 'z' });
    const erase = fogRectangle({ id: 'a', isErasing: true });
    expect(fogCoverage({ paint, erase }).shape).toEqual([]);
    expect(fogCoverage({ erase, paint }).covers({ x: 5, y: 5 })).toBe(true);
  });

  it('paints opposite-winding lassos independently instead of cancelling overlap', () => {
    const first: FogOperation = { ...fogRectangle(), type: 'lasso', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }] };
    const second: FogOperation = { ...first, id: 'second', points: [{ x: 4, y: 4 }, { x: 4, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 4 }] };
    const coverage = fogCoverage({ first, second });
    expect(coverage.covers({ x: 6, y: 6 })).toBe(true);
    expect(coverage.covers({ x: 1, y: 1 })).toBe(true);
    expect(coverage.covers({ x: 10, y: 10 })).toBe(true);
  });

  it('returns an empty shape for no operations or erase-only data', () => {
    expect(fogCoverage({}).shape).toEqual([]);
    expect(fogCoverage({ erase: fogRectangle({ isErasing: true }) }).shape).toEqual([]);
  });

  it('rejects invalid operations instead of exposing partly rebuilt coverage', () => {
    expect(() => fogCoverage({ paint: fogRectangle(), invalid: fogRectangle({ timestamp: Infinity, isErasing: true }) })).toThrow(RangeError);
  });
});
