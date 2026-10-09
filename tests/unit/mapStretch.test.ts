import { describe, expect, it } from 'vitest';
import { isStretchableAspect, NO_STRETCH, readMapStretch, sameStretch, stretchForAspect } from '../../src/app/grid/mapStretch';

describe('map stretch', () => {
  it('grows the map along the axis its cells are too short on, and never shrinks it', () => {
    // Rows 5 % too far apart: the cells are too narrow, the map is drawn wider.
    expect(stretchForAspect(1.05)).toEqual({ x: 1.05, y: 1 });
    // Rows too close together: the map is drawn taller.
    expect(stretchForAspect(0.8)).toEqual({ x: 1, y: 1.25 });
    expect(stretchForAspect(1)).toBe(NO_STRETCH);
    expect(stretchForAspect(Number.NaN)).toBe(NO_STRETCH);
  });

  it('reads a stored stretch only where it is a pair of factors in range', () => {
    expect(readMapStretch({ x: 1.048, y: 1 })).toEqual({ x: 1.048, y: 1 });
    for (const value of [undefined, null, 'wide', { x: 1 }, { x: 1, y: 1 }, { x: 0.9, y: 1 }, { x: 4, y: 1 }, { x: Number.NaN, y: 1 }, { x: '1.1', y: 1 }]) {
      expect(readMapStretch(value)).toBe(NO_STRETCH);
    }
  });

  it('takes only aspects whose stretch it would also read back', () => {
    for (const aspect of [1, 1.048, 0.8, 1.5, 1 / 1.5]) {
      expect(isStretchableAspect(aspect)).toBe(true);
      const stretch = stretchForAspect(aspect);
      expect(readMapStretch(stretch)).toEqual(stretch);
    }
    for (const aspect of [1.6, 0.6, Number.NaN]) expect(isStretchableAspect(aspect)).toBe(false);
  });

  it('compares stretches by their factors', () => {
    expect(sameStretch({ x: 1.1, y: 1 }, { x: 1.1, y: 1 })).toBe(true);
    expect(sameStretch({ x: 1.1, y: 1 }, { x: 1, y: 1.1 })).toBe(false);
  });
});
