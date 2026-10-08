import { describe, expect, it } from 'vitest';
import { typedDistance } from '../../src/app/grid/typedDistance';

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

  it('tells an empty field from text that is no positive number', () => {
    expect(typedDistance('')).toBeUndefined();
    expect(typedDistance('   ')).toBeUndefined();
    expect(['0', '-2', '1,5,2', '1e3', 'five', ','].map(typedDistance)).toEqual([null, null, null, null, null, null]);
  });
});
