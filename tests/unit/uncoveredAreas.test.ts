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
    const areas = uncoveredAreas([MAP], [rect(10, 10, 30, 30), rect(30, 10, 30, 30), rect(20, 20, 30, 30)], BOX);
    expect(areas).toHaveLength(1);
    expect(areas[0]!.holes).toHaveLength(1);
    expect(filled(areas)).toBe(10000 - 50 * 30 - 30 * 10);
  });

  it('keeps holes that lie apart as holes of their own', () => {
    const areas = uncoveredAreas([MAP], [rect(10, 10, 20, 20), rect(60, 60, 20, 20)], BOX);
    expect(areas.map(({ holes }) => holes.length)).toEqual([2]);
    expect(filled(areas)).toBe(10000 - 800);
  });

  it('takes a polygon that reaches past the outline out of the outline itself, leaving no hole', () => {
    const areas = uncoveredAreas([MAP], [rect(-50, 40, 100, 20), rect(80, -20, 500, 500)], BOX);
    expect(areas.map(({ holes }) => holes.length)).toEqual([0]);
    expect(filled(areas)).toBe(10000 - 50 * 20 - 20 * 100);
  });

  it('counts a polygon the same whichever way round it runs', () => {
    const clockwise = rect(10, 10, 30, 30);
    const counter = [...rect(30, 10, 30, 30)].reverse();
    expect(filled(uncoveredAreas([MAP], [clockwise, counter], BOX))).toBe(10000 - 50 * 30);
    expect(filled(uncoveredAreas([MAP, [...rect(50, 50, 100, 100)].reverse()], [], BOX))).toBe(10000 + 10000 - 2500);
  });

  it('is empty where everything is taken out, and where nothing was covered', () => {
    expect(uncoveredAreas([MAP], [rect(-10, -10, 200, 200)], BOX)).toEqual([]);
    expect(uncoveredAreas([], [MAP], BOX)).toEqual([]);
    expect(uncoveredAreas([[{ x: 0, y: 0 }, { x: 10, y: 0 }]], [], BOX)).toEqual([]);
  });

  it('cuts a polygon to the box before it is worked out, however far it reaches', () => {
    // A band a billion pixels long takes its part of the map out.
    expect(filled(uncoveredAreas([MAP], [rect(-1e9, 40, 2e9, 20)], BOX))).toBe(10000 - 100 * 20);
    // A wedge from far outside, as the sight of a token that stands a long way off.
    expect(filled(uncoveredAreas([MAP], [[{ x: 50, y: -3e6 }, { x: 80, y: 3e6 }, { x: 20, y: 3e6 }]], BOX))).toBeCloseTo(10000 - 100 * 30, 0);
    // A U whose arms leave the box and come back: what lies between the arms stays covered.
    const u = [{ x: 10, y: 1e7 }, { x: 10, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 1e7 }, { x: 70, y: 1e7 }, { x: 70, y: 40 }, { x: 30, y: 40 }, { x: 30, y: 1e7 }];
    expect(filled(uncoveredAreas([MAP], [u], BOX))).toBe(10000 - (80 * 20 + 2 * 20 * 60));
    // What is covered is cut as well, so nothing is worked out beyond the box.
    expect(filled(uncoveredAreas([rect(-1e9, -1e9, 2e9, 2e9)], [MAP], BOX))).toBe(200 * 200 - 10000);
  });

  it('refuses a corner that is no finite number, instead of leaving it out', () => {
    expect(() => uncoveredAreas([MAP], [[{ x: 0, y: 0 }, { x: NaN, y: 10 }, { x: 10, y: 10 }]], BOX)).toThrow(RangeError);
    expect(() => uncoveredAreas([MAP], [[{ x: 0, y: 0 }, { x: Infinity, y: 10 }, { x: 10, y: 10 }]], BOX)).toThrow(RangeError);
    expect(() => uncoveredAreas([[{ x: 0, y: -Infinity }, { x: 50, y: 10 }, { x: 10, y: 10 }]], [], BOX)).toThrow(RangeError);
  });
});
