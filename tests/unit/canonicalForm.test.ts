import { describe, expect, it } from 'vitest';
import { canonicalForm, signedAreaTwice } from '../../src/app/lighting/canonicalForm';
import type { QPolygon, QShape } from '../../src/app/types/shapeTypes';

const outer: QPolygon = [0, 0, 16, 0, 16, 16, 0, 16];
const hole: QPolygon = [4, 4, 4, 12, 12, 12, 12, 4];

describe('canonical integer contours', () => {
  it('cleans the wraparound edge as well as internal duplicate and collinear vertices', () => {
    const input = [[8, 0, 16, 0, 16, 0, 16, 8, 16, 16, 0, 16, 0, 8, 0, 0, 8, 0]];
    const original = structuredClone(input);
    expect(canonicalForm(input)).toEqual([outer]);
    expect(input).toEqual(original);
  });

  it('removes cyclic runs until no collinear vertex remains', () => {
    expect(canonicalForm([[0, 8, 0, 4, 0, 0, 4, 0, 8, 0, 8, 8, 4, 8]])).toEqual([
      [0, 0, 8, 0, 8, 8, 0, 8],
    ]);
  });

  it('preserves a hole and a filled island while ordering by lowest y then x', () => {
    const island = [6, 6, 10, 6, 10, 10, 6, 10];
    expect(canonicalForm([island, hole, outer])).toEqual([outer, hole, island]);
    expect(signedAreaTwice(outer)).toBe(512n);
    expect(signedAreaTwice(hole)).toBe(-128n);
  });

  it('uses y before x to choose a start and order disconnected contours', () => {
    const left = [-20, 4, -16, 4, -16, 8, -20, 8];
    const upper = [12, 2, 8, 2, 8, -2, 12, -2];
    expect(canonicalForm([left, upper])).toEqual([
      [8, -2, 12, -2, 12, 2, 8, 2], left,
    ]);
  });

  it('orders same-start contours by role and then their second point', () => {
    const negative = [0, 0, 0, 8, 8, 0];
    const positiveLater = [0, 0, 8, 0, 8, 8];
    const positiveFirst = [0, 0, 4, 0, 4, 4];
    expect(canonicalForm([negative, positiveLater, positiveFirst])).toEqual([
      positiveFirst, positiveLater, negative,
    ]);
  });

  it('drops empty, point, line and zero-area contours', () => {
    expect(canonicalForm([[], [2, 3], [0, 0, 2, 2], [0, 0, 2, 2, 4, 4]])).toEqual([]);
  });

  it('is idempotent without mutating frozen input', () => {
    const input: QShape = Object.freeze([Object.freeze([...hole]), Object.freeze([...outer])]);
    const result = canonicalForm(input);
    expect(canonicalForm(result)).toEqual(result);
    expect(input).toEqual([hole, outer]);
  });

  it('keeps a one-unit area after large terms cancel', () => {
    const edge = 2 ** 24;
    const ring: number[] = [];
    // Each positive square is later traversed in reverse. Only the final unit triangle contributes area.
    for (let i = 0; i < 40; i++) ring.push(0, 0, edge, 0, edge, edge, 0, edge, 0, 0);
    ring.push(0, 0, 1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 40; i++) ring.push(0, 0, 0, edge, edge, edge, edge, 0, 0, 0);
    expect(signedAreaTwice(ring)).toBe(1n);
  });

  it.each([[0], [0, 0, NaN, 1], [0, 0, 1.5, 1], [0, 0, 2 ** 24 + 1, 1]])(
    'rejects invalid coordinate storage rather than dropping it', (...ring) => {
      expect(() => canonicalForm([ring])).toThrow(RangeError);
    },
  );
});
