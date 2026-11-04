import { describe, expect, it } from 'vitest';
import { isUnitDistance, MAX_UNIT_DISTANCE, MIN_UNIT_DISTANCE, typedDistance } from '../../src/app/grid/unitDistance';

describe('typedDistance', () => {
  it('reads a comma and a point as the decimal sign', () => {
    expect(typedDistance('1,5')).toBe(1.5);
    expect(typedDistance('1.5')).toBe(1.5);
    expect(typedDistance(' 5 ')).toBe(5);
    expect(typedDistance(',5')).toBe(0.5);
  });

  it('reads a number that is still being typed', () => {
    expect(typedDistance('1,')).toBe(1);
    expect(typedDistance('1.')).toBe(1);
  });

  it('tells an empty field from text that is no distance', () => {
    expect(typedDistance('')).toBeUndefined();
    expect(typedDistance('   ')).toBeUndefined();
    expect(['0', '0,0', '-2', '1,5,2', '1e3', 'five', ','].map(typedDistance)).toEqual([null, null, null, null, null, null, null]);
  });

  it('takes no number too long to be one: 309 digits are no finite number, 22 are written as a power of ten', () => {
    expect(Number('9'.repeat(309))).toBe(Infinity);
    expect(typedDistance('9'.repeat(309))).toBeNull();
    expect(String(Number('1'.repeat(22)))).toContain('e+');
    expect(typedDistance('1'.repeat(22))).toBeNull();
    expect(typedDistance('1000001')).toBeNull();
    expect(typedDistance('0,0000001')).toBeNull();
  });

  it('reads back every distance it takes, as a field shows it', () => {
    const typed = ['1000000', '0.000001', '0,0000015', '999999,9999999999999', '1.23456789012345678', '0.1', '12345.678', '.5', '70,3'];
    for (const text of typed) {
      const distance = typedDistance(text);
      expect(isUnitDistance(distance), text).toBe(true);
      expect(typedDistance(String(distance)), text).toBe(distance);
    }
  });
});

describe('isUnitDistance', () => {
  it('takes numbers from a millionth to a million', () => {
    expect([MIN_UNIT_DISTANCE, 0.5, 1, 1.5, 5, MAX_UNIT_DISTANCE].map(isUnitDistance)).toEqual([true, true, true, true, true, true]);
  });

  it('takes nothing else', () => {
    const none = [0, -1, MIN_UNIT_DISTANCE / 2, MAX_UNIT_DISTANCE + 1, 1e23, Infinity, NaN, null, undefined, '5'];
    expect(none.filter(isUnitDistance)).toEqual([]);
  });
});
