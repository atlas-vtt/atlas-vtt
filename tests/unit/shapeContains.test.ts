import { describe, expect, it } from 'vitest';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import type { QShape } from '../../src/app/types/shapeTypes';

const nested: QShape = [
  [0, 0, 80, 0, 80, 80, 0, 80],
  [16, 16, 16, 64, 64, 64, 64, 16],
  [32, 32, 48, 32, 48, 48, 32, 48],
];

describe('shape membership', () => {
  it('reads world pixels and keeps a hole empty except for its filled island', () => {
    expect(shapeContains(nested, { x: 1, y: 1 })).toBe(true);
    expect(shapeContains(nested, { x: 3, y: 3 })).toBe(false);
    expect(shapeContains(nested, { x: 5, y: 5 })).toBe(true);
    expect(shapeContains(nested, { x: 11, y: 5 })).toBe(false);
  });

  it.each([[0, 0], [10, 5], [5, 0], [2, 2], [2, 5], [8, 8]])(
    'includes boundary point (%s, %s)', (x, y) => {
      expect(shapeContains(nested, { x, y })).toBe(true);
    },
  );

  it('does not round a query across an edge', () => {
    expect(shapeContains(nested, { x: -0.001, y: 1 })).toBe(false);
    expect(shapeContains(nested, { x: 0.001, y: 1 })).toBe(true);
    expect(shapeContains(nested, { x: 2.001, y: 3 })).toBe(false);
    expect(shapeContains(nested, { x: 1.999, y: 3 })).toBe(true);
  });

  it('keeps fractional queries on the correct side of a long nearly diagonal edge', () => {
    const bound = 2 ** 24;
    const shape = [[-bound, -bound, bound, bound - 1, -bound, bound]];
    // This edge crosses x=0 at y=-0.5 Q. A positive x at the same y lies outside.
    expect(shapeContains(shape, { x: 1.25e-11, y: -0.0625 })).toBe(false);
    expect(shapeContains(shape, { x: -1.25e-11, y: -0.0625 })).toBe(true);
    expect(shapeContains(shape, { x: 0, y: -0.0625 })).toBe(true);
  });

  it('uses NonZero winding rather than toggling for overlapping positive rings', () => {
    const shape = [[0, 0, 32, 0, 32, 32, 0, 32], [16, 16, 48, 16, 48, 48, 16, 48]];
    expect(shapeContains(shape, { x: 3, y: 3 })).toBe(true);
  });

  it('handles negative coordinates, sloped edges and a concavity', () => {
    const shape = [[-16, -16, 16, -16, 0, 0, 16, 16, -16, 16]];
    expect(shapeContains(shape, { x: -1, y: 0 })).toBe(true);
    expect(shapeContains(shape, { x: 1, y: 0 })).toBe(false);
    expect(shapeContains(shape, { x: 1, y: -1 })).toBe(true);
  });

  it('has no coverage when the shape is empty', () => {
    expect(shapeContains([], { x: 0, y: 0 })).toBe(false);
  });

  it('returns false for a finite query beyond the bounded geometry', () => {
    expect(shapeContains(nested, { x: 1e308, y: 0 })).toBe(false);
    expect(shapeContains(nested, { x: 0, y: -1e308 })).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a nonfinite query coordinate %s', value => {
    expect(() => shapeContains(nested, { x: value, y: 0 })).toThrow(RangeError);
    expect(() => shapeContains(nested, { x: 0, y: value })).toThrow(RangeError);
  });
});
