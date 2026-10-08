import { describe, expect, it } from 'vitest';
import { canonicalForm, signedAreaTwice } from '../../src/app/lighting/canonicalForm';
import { inflatePolyline, normalizePolygon, subtractShapes, subtractToAreas, unionShapes } from '../../src/app/lighting/polygonClip';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import { MAX_Q } from '../../src/app/types/shapeTypes';
import { hasCrossing, qRectangle } from '../helpers/fogShapeAssertions';

describe('integer polygon operations', () => {
  it('merges painted rectangles and preserves holes and islands after erasing', () => {
    const outer = unionShapes([qRectangle(0, 0, 80, 80)], [qRectangle(40, 0, 80, 80)]);
    expect(outer).toEqual([qRectangle(0, 0, 120, 80)]);
    const hole = subtractShapes(outer, [qRectangle(16, 16, 88, 48)]);
    const island = unionShapes(hole, [qRectangle(32, 32, 16, 16)]);
    expect(island.map(signedAreaTwice)).toEqual([19200n, -8448n, 512n]);
    expect(shapeContains(island, { x: 1, y: 1 })).toBe(true);
    expect(shapeContains(island, { x: 3, y: 3 })).toBe(false);
    expect(shapeContains(island, { x: 5, y: 5 })).toBe(true);
  });

  it('normalizes a zero-signed-area crossing outline before discarding degenerate rings', () => {
    const bow = [0, 0, 80, 80, 0, 80, 80, 0];
    expect(signedAreaTwice(bow)).toBe(0n);
    const result = normalizePolygon(bow);
    expect(result.reduce((sum, ring) => sum + signedAreaTwice(ring), 0n)).toBe(6400n);
    expect(shapeContains(result, { x: 5, y: 1 })).toBe(true);
    expect(shapeContains(result, { x: 1, y: 5 })).toBe(false);
    expect(hasCrossing([bow])).toBe(true);
    expect(hasCrossing(result)).toBe(false);
  });

  it('keeps touching and disjoint contours deterministic', () => {
    const result = unionShapes([qRectangle(0, 0, 16, 16)], [qRectangle(16, 16, 16, 16)]);
    expect(canonicalForm(result)).toEqual(result);
    expect(result.reduce((sum, ring) => sum + signedAreaTwice(ring), 0n)).toBe(1024n);
    expect(subtractShapes(result, result)).toEqual([]);
  });

  it('retains the integer scanline half-tie convention', () => {
    const result = unionShapes(
      normalizePolygon([849, -25547, 1205, -25911, 1240, -25941]),
      normalizePolygon([-232, -25914, 1283, -25914, -232, -14771]),
    );
    // The exact crossing at x=1208.5 takes the even integer coordinate, 1208.
    expect(result).toEqual([[1240, -25941, 1213, -25914, 1283, -25914, -232, -14771, -232, -25914, 1208, -25914]]);
  });

  it('keeps positive-radius point and repeated-point brushes nonempty', () => {
    expect(inflatePolyline([0, 0], 1)).toEqual([[0, -1, 1, 0, 0, 1, -1, 0]]);
    for (const radius of [1, 2, 8, 160]) {
      const result = inflatePolyline([16, -16, 16, -16], radius);
      expect(result.length).toBeGreaterThan(0);
      expect(shapeContains(result, { x: 2, y: -2 })).toBe(true);
      expect(hasCrossing(result)).toBe(false);
      expect(canonicalForm(result)).toEqual(result);
    }
  });

  it('uses round caps on an open line', () => {
    const shape = inflatePolyline([0, 0, 80, 0], 16);
    expect(shapeContains(shape, { x: -1.5, y: 0 })).toBe(true);
    expect(shapeContains(shape, { x: 11.5, y: 0 })).toBe(true);
    expect(shapeContains(shape, { x: -2, y: -2 })).toBe(false);
    expect(shapeContains(shape, { x: 5, y: 3 })).toBe(false);
  });

  it('normalizes inflated overlapping bends before exposing their rings', () => {
    const path = [22956, 1986, 24672, 3022, 23869, 3272, 26023, 4878, 23917, 4020, 25977, 1467,
      23035, 4722, 23453, 4909, 23732, 2711, 21674, 794, 25903, 1200, 21587, 5484, 25155, 4597,
      24102, 2334, 25834, 3508, 24206, 2862, 21967, 2299];
    const shape = inflatePolyline(path, 54);
    expect(shape.length).toBeGreaterThan(0);
    expect(hasCrossing(shape)).toBe(false);
    expect(unionShapes(shape, [])).toEqual(shape);
  });

  it('accepts empty paths and zero radius while still rejecting invalid numbers', () => {
    expect(inflatePolyline([], 8)).toEqual([]);
    expect(inflatePolyline([0, 0, 8, 0], 0)).toEqual([]);
    expect(normalizePolygon([0, 0, 8, 8])).toEqual([]);
    expect(() => inflatePolyline([NaN, 0], 0)).toThrow(RangeError);
    expect(() => inflatePolyline([], -1)).toThrow(RangeError);
    expect(() => normalizePolygon([0])).toThrow(RangeError);
  });

  it('rejects generated coordinates outside the supported range', () => {
    expect(() => inflatePolyline([MAX_Q, 0], 8)).toThrow(RangeError);
    expect(() => unionShapes([[Infinity, 0]], [])).toThrow(RangeError);
  });

  it('gives each hole to the outline it lies in, and what is filled inside a hole an area of its own', () => {
    // Four bars that overlap at their ends make a frame; two small squares lie apart in the second outline.
    const frame = [qRectangle(16, 16, 88, 24), qRectangle(16, 80, 88, 24), qRectangle(16, 16, 24, 88), qRectangle(80, 16, 24, 88)];
    const areas = subtractToAreas([qRectangle(0, 0, 120, 120), qRectangle(200, 0, 48, 48)], [...frame, qRectangle(208, 8, 8, 8), qRectangle(224, 24, 8, 8)]);
    const summary = areas.map(({ outline, holes }) => ({ outline: signedAreaTwice(outline), holes: holes.map(signedAreaTwice) }));
    summary.sort((a, b) => Number(a.outline - b.outline));
    expect(summary).toEqual([
      { outline: 3200n, holes: [] },
      { outline: 4608n, holes: [-128n, -128n] },
      { outline: 28800n, holes: [-15488n] },
    ]);
  });

  it('counts an outline the same whichever way round it runs, and one that crosses itself by what it fills', () => {
    // qRectangle(40, 0, 80, 80) with its corners the other way round.
    const reversed = [40, 80, 120, 80, 120, 0, 40, 0];
    const twice = (areas: ReturnType<typeof subtractToAreas>): bigint => areas.reduce((sum, { outline, holes }) => sum + signedAreaTwice(outline) + holes.reduce((inner, hole) => inner + signedAreaTwice(hole), 0n), 0n);
    expect(twice(subtractToAreas([qRectangle(0, 0, 80, 80), reversed], []))).toBe(2n * 120n * 80n);
    expect(twice(subtractToAreas([qRectangle(0, 0, 200, 80)], [qRectangle(0, 0, 80, 80), reversed]))).toBe(2n * 80n * 80n);
    // A bow: two triangles that wind opposite ways are both taken out.
    expect(twice(subtractToAreas([qRectangle(0, 0, 80, 80)], [[0, 0, 80, 80, 0, 80, 80, 0]]))).toBe(2n * 6400n - 6400n);
    expect(subtractToAreas([qRectangle(0, 0, 80, 80)], [qRectangle(0, 0, 80, 80)])).toEqual([]);
    expect(() => subtractToAreas([[NaN, 0, 8, 0, 8, 8]], [])).toThrow(RangeError);
  });
});
