import { describe, expect, it } from 'vitest';
import { assertQ, quantizeCoordinate } from '../../src/app/lighting/quantizedPoint';
import { MAX_Q, Q_SCALE } from '../../src/app/types/shapeTypes';

describe('eighth-pixel coordinates', () => {
  it('rounds world pixels once, including negative half ties', () => {
    expect(Q_SCALE).toBe(8);
    expect(quantizeCoordinate(1.1875)).toBe(10);
    expect(quantizeCoordinate(-1.1875)).toBe(-9);
    expect(quantizeCoordinate(-0.01)).toBe(0);
    expect(Object.is(quantizeCoordinate(-0.01), -0)).toBe(false);
  });

  it('accepts the inclusive coordinate bounds', () => {
    expect(MAX_Q).toBe(2 ** 24);
    expect(quantizeCoordinate(MAX_Q / 8)).toBe(MAX_Q);
    expect(quantizeCoordinate(-MAX_Q / 8)).toBe(-MAX_Q);
    expect(() => assertQ(MAX_Q)).not.toThrow();
    expect(() => assertQ(-MAX_Q)).not.toThrow();
  });

  it.each([NaN, Infinity, -Infinity, (2 ** 24 + 1) / 8, -(2 ** 24 + 1) / 8])(
    'rejects an invalid world coordinate %s', value => {
      expect(() => quantizeCoordinate(value)).toThrow(RangeError);
    },
  );

  it.each([NaN, Infinity, -Infinity, 0.25, 2 ** 24 + 1, -(2 ** 24 + 1)])(
    'rejects an invalid integer coordinate %s', value => {
      expect(() => assertQ(value)).toThrow(RangeError);
    },
  );
});
