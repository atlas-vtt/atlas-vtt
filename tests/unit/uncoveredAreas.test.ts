import { describe, expect, it } from 'vitest';
import { uncoveredAreas, type FilledArea } from '../../src/app/lighting/uncoveredAreas';
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

describe('what is left of an area once others are taken out', () => {
  it('makes one hole of polygons that overlap, however many lie on a point', () => {
    const areas = uncoveredAreas([MAP], [rect(10, 10, 30, 30), rect(30, 10, 30, 30), rect(20, 20, 30, 30)]);
    expect(areas).toHaveLength(1);
    expect(areas[0]!.holes).toHaveLength(1);
    expect(filled(areas)).toBe(10000 - 50 * 30 - 30 * 10);
  });

  it('keeps holes that lie apart as holes of their own', () => {
    const areas = uncoveredAreas([MAP], [rect(10, 10, 20, 20), rect(60, 60, 20, 20)]);
    expect(areas.map(({ holes }) => holes.length)).toEqual([2]);
    expect(filled(areas)).toBe(10000 - 800);
  });

  it('takes a polygon that reaches past the outline out of the outline itself, leaving no hole', () => {
    const areas = uncoveredAreas([MAP], [rect(-50, 40, 100, 20), rect(80, -20, 500, 500)]);
    expect(areas.map(({ holes }) => holes.length)).toEqual([0]);
    expect(filled(areas)).toBe(10000 - 50 * 20 - 20 * 100);
  });

  it('counts a polygon the same whichever way round it runs', () => {
    const clockwise = rect(10, 10, 30, 30);
    const counter = [...rect(30, 10, 30, 30)].reverse();
    expect(filled(uncoveredAreas([MAP], [clockwise, counter]))).toBe(10000 - 50 * 30);
    expect(filled(uncoveredAreas([MAP, [...rect(50, 50, 100, 100)].reverse()], []))).toBe(10000 + 10000 - 2500);
  });

  it('is empty where everything is taken out, and where nothing was covered', () => {
    expect(uncoveredAreas([MAP], [rect(-10, -10, 200, 200)])).toEqual([]);
    expect(uncoveredAreas([], [MAP])).toEqual([]);
    expect(uncoveredAreas([[{ x: 0, y: 0 }, { x: 10, y: 0 }]], [])).toEqual([]);
  });

  it('refuses a corner that is no number or lies out of range, instead of leaving it out', () => {
    expect(() => uncoveredAreas([MAP], [[{ x: 0, y: 0 }, { x: NaN, y: 10 }, { x: 10, y: 10 }]])).toThrow(RangeError);
    expect(() => uncoveredAreas([MAP], [[{ x: 0, y: 0 }, { x: 1e9, y: 10 }, { x: 10, y: 10 }]])).toThrow(RangeError);
  });
});
