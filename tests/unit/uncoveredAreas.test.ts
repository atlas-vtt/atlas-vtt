import { describe, expect, it } from 'vitest';
import { uncoveredAreas, type FilledArea } from '../../src/app/lighting/uncoveredAreas';
import type { Rect } from '../../src/app/lighting/segments';
import type { Point } from '../../src/app/types/visionTypes';

function rect(x: number, y: number, width: number, height: number): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function area(ring: readonly number[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const next = (i + 2) % ring.length;
    twice += ring[i]! * ring[next + 1]! - ring[i + 1]! * ring[next]!;
  }
  return Math.abs(twice) / 2;
}

/** The size of what is filled: every outline without its holes. */
function filled(areas: readonly FilledArea[]): number {
  return areas.reduce((sum, { outline, holes }) => sum + area(outline) - holes.reduce((inner, hole) => inner + area(hole), 0), 0);
}

const MAP = rect(0, 0, 100, 100);
/** The map and a margin around it. */
const BOX: Rect = [-50, -50, 200, 200];

describe('what is left of an area once others are taken out', () => {
  it('makes one hole of polygons that overlap, however many lie on a point', () => {
    const areas = uncoveredAreas([{ covered: [MAP], open: [rect(10, 10, 30, 30), rect(30, 10, 30, 30), rect(20, 20, 30, 30)] }], BOX, 0);
    expect(areas).toHaveLength(1);
    expect(areas[0]!.holes).toHaveLength(1);
    expect(filled(areas)).toBe(10000 - 50 * 30 - 30 * 10);
  });

  it('keeps holes that lie apart as holes of their own', () => {
    const areas = uncoveredAreas([{ covered: [MAP], open: [rect(10, 10, 20, 20), rect(60, 60, 20, 20)] }], BOX, 0);
    expect(areas.map(({ holes }) => holes.length)).toEqual([2]);
    expect(filled(areas)).toBe(10000 - 800);
  });

  it('takes a polygon that reaches past the outline out of the outline itself, leaving no hole', () => {
    const areas = uncoveredAreas([{ covered: [MAP], open: [rect(-50, 40, 100, 20), rect(80, -20, 500, 500)] }], BOX, 0);
    expect(areas.map(({ holes }) => holes.length)).toEqual([0]);
    expect(filled(areas)).toBe(10000 - 50 * 20 - 20 * 100);
  });

  it('counts a polygon the same whichever way round it runs', () => {
    const clockwise = rect(10, 10, 30, 30);
    const counter = [...rect(30, 10, 30, 30)].reverse();
    expect(filled(uncoveredAreas([{ covered: [MAP], open: [clockwise, counter] }], BOX, 0))).toBe(10000 - 50 * 30);
    expect(filled(uncoveredAreas([{ covered: [MAP, [...rect(50, 50, 100, 100)].reverse()], open: [] }], BOX, 0))).toBe(10000 + 10000 - 2500);
  });

  it('is empty where everything is taken out, and where nothing was covered', () => {
    expect(uncoveredAreas([{ covered: [MAP], open: [rect(-10, -10, 200, 200)] }], BOX, 0)).toEqual([]);
    expect(uncoveredAreas([{ covered: [], open: [MAP] }], BOX, 0)).toEqual([]);
    expect(uncoveredAreas([{ covered: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]], open: [] }], BOX, 0)).toEqual([]);
  });

  it('cuts a polygon to the box before it is worked out, however far it reaches', () => {
    // A band a billion pixels long takes its part of the map out.
    expect(filled(uncoveredAreas([{ covered: [MAP], open: [rect(-1e9, 40, 2e9, 20)] }], BOX, 0))).toBe(10000 - 100 * 20);
    // A wedge from far outside, as the sight of a token that stands a long way off.
    expect(filled(uncoveredAreas([{ covered: [MAP], open: [[{ x: 50, y: -3e6 }, { x: 80, y: 3e6 }, { x: 20, y: 3e6 }]] }], BOX, 0))).toBeCloseTo(10000 - 100 * 30, 0);
    // A U whose arms leave the box and come back: what lies between the arms stays covered.
    const u = [{ x: 10, y: 1e7 }, { x: 10, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 1e7 }, { x: 70, y: 1e7 }, { x: 70, y: 40 }, { x: 30, y: 40 }, { x: 30, y: 1e7 }];
    expect(filled(uncoveredAreas([{ covered: [MAP], open: [u] }], BOX, 0))).toBe(10000 - (80 * 20 + 2 * 20 * 60));
    // What is covered is cut as well, so nothing is worked out beyond the box.
    expect(filled(uncoveredAreas([{ covered: [rect(-1e9, -1e9, 2e9, 2e9)], open: [MAP] }], BOX, 0))).toBe(200 * 200 - 10000);
  });

  it('refuses a corner that is no finite number, instead of leaving it out', () => {
    expect(() => uncoveredAreas([{ covered: [MAP], open: [[{ x: 0, y: 0 }, { x: NaN, y: 10 }, { x: 10, y: 10 }]] }], BOX, 0)).toThrow(RangeError);
    expect(() => uncoveredAreas([{ covered: [MAP], open: [[{ x: 0, y: 0 }, { x: Infinity, y: 10 }, { x: 10, y: 10 }]] }], BOX, 0)).toThrow(RangeError);
    expect(() => uncoveredAreas([{ covered: [[{ x: 0, y: -Infinity }, { x: 50, y: 10 }, { x: 10, y: 10 }]], open: [] }], BOX, 0)).toThrow(RangeError);
  });

  it('makes one shape of its parts, and grows a part marked so by the margin: two that meet leave no seam', () => {
    const left = rect(0, 0, 50, 100);
    // The right part starts a quarter pixel short of the left one, as outlines that coincide do once they are rounded.
    const right = rect(50.25, 0, 49.75, 100);
    expect(uncoveredAreas([{ covered: [left], open: [] }, { covered: [right], open: [] }], BOX, 0.5)).toHaveLength(2);
    const joined = uncoveredAreas([{ covered: [left], open: [] }, { covered: [right], open: [], grown: true }], BOX, 0.5);
    expect(joined).toHaveLength(1);
    expect(joined[0]!.holes).toEqual([]);
    // Grown by half a pixel on every side, less what the left part already covers.
    expect(filled(joined)).toBe(50 * 100 + 50.75 * 101 - 0.25 * 100);
  });

  it('shrinks what is open by the margin, which leaves a covered line between two open polygons that rounding parted', () => {
    // One hole, half a pixel smaller on every side.
    expect(filled(uncoveredAreas([{ covered: [MAP], open: [rect(20, 20, 40, 40)] }], BOX, 0.5))).toBe(10000 - 39 * 39);
    // Two that end on one line to the eighth of a pixel are one, shrunk as one.
    expect(filled(uncoveredAreas([{ covered: [MAP], open: [rect(20, 20, 20, 40), rect(40, 20, 20, 40)] }], BOX, 0.5))).toBe(10000 - 39 * 39);
    // Two that rounding parted by an eighth each keep their margin: a covered line between them.
    const parted = uncoveredAreas([{ covered: [MAP], open: [rect(20, 20, 20, 40), rect(40.125, 20, 20, 40)] }], BOX, 0.5);
    expect(parted.map(({ holes }) => holes.length)).toEqual([2]);
    expect(filled(parted)).toBe(10000 - 2 * 19 * 39);
  });

  it('takes out of each part only what is open in it', () => {
    const areas = uncoveredAreas([{ covered: [MAP], open: [rect(20, 20, 60, 60)] }, { covered: [rect(30, 30, 20, 20)], open: [rect(35, 35, 5, 5)] }], BOX, 0);
    expect(filled(areas)).toBe(10000 - 3600 + 400 - 25);
    // The second part lies in the hole of the first, with the hole of its own.
    expect(areas.map(({ holes }) => holes.length)).toEqual([1, 1]);
  });
});
