import { describe, expect, it } from 'vitest';
import { areaBadgePoint } from '../../src/app/fog/fogAreas';
import type { Point } from '../../src/app/types/visionTypes';
import { pointInPolygon } from '../../src/app/vision/visibility';

const of = (...points: [number, number][]): Point[] => points.map(([x, y]) => ({ x, y }));

function edgeDistance(outline: readonly Point[], point: Point): number {
  let nearest = Infinity;
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const along = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length));
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - along * (b.x - a.x), point.y - a.y - along * (b.y - a.y)));
  });
  return nearest;
}

const L = of([0, 0], [300, 0], [300, 100], [100, 100], [100, 300], [0, 300]);
const U = of([0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]);
/** The largest circle in the corner of arms 100 wide touches both outer sides and the inner corner. */
const CORNER_RADIUS = (100 * Math.SQRT2) / (1 + Math.SQRT2);

describe('where an area\'s badge sits', () => {
  it('is the middle of a square and of a rectangle\'s short side', () => {
    const square = areaBadgePoint(of([0, 0], [100, 0], [100, 100], [0, 100]));
    expect(square?.x).toBeCloseTo(50, 0);
    expect(square?.y).toBeCloseTo(50, 0);
    const wide = of([10, 20], [410, 20], [410, 120], [10, 120]);
    const spot = areaBadgePoint(wide)!;
    expect(spot.y).toBeCloseTo(70, 0);
    expect(edgeDistance(wide, spot)).toBeGreaterThan(49);
  });

  it('is in the corner of an L, where it is widest', () => {
    const spot = areaBadgePoint(L)!;
    expect(spot.x).toBeCloseTo(CORNER_RADIUS, -1);
    expect(spot.y).toBeCloseTo(CORNER_RADIUS, -1);
    expect(edgeDistance(L, spot)).toBeGreaterThan(CORNER_RADIUS - 2);
  });

  it('is inside an outline that bends around its own middle', () => {
    // The U's centre of gravity lies in its notch, outside it.
    expect(pointInPolygon({ x: 150, y: 136 }, U)).toBe(false);
    const spot = areaBadgePoint(U)!;
    expect(pointInPolygon(spot, U)).toBe(true);
    expect(edgeDistance(U, spot)).toBeGreaterThan(CORNER_RADIUS - 2);
  });

  it('is the same whichever way the outline runs', () => {
    const there = areaBadgePoint(L)!;
    const back = areaBadgePoint([...L].reverse())!;
    expect(edgeDistance(L, back)).toBeCloseTo(edgeDistance(L, there), 0);
  });

  it('is inside a sliver thinner than the search looks', () => {
    const sliver = of([0, 0], [4000, 3000], [4000, 3000.4]);
    const spot = areaBadgePoint(sliver)!;
    expect(spot).not.toBeNull();
    expect(pointInPolygon(spot, sliver)).toBe(true);
  });

  it('is inside one of the lobes of an outline that crosses itself', () => {
    const bow = of([0, 0], [100, 100], [100, 0], [0, 100]);
    const spot = areaBadgePoint(bow)!;
    // Left or right of the crossing, and within the triangle on that side.
    expect(Math.abs(spot.x - 50)).toBeGreaterThan(5);
    expect(Math.abs(spot.y - 50)).toBeLessThan(Math.abs(spot.x - 50));
  });

  it('is none where the outline encloses nothing', () => {
    expect(areaBadgePoint([])).toBeNull();
    expect(areaBadgePoint(of([0, 0], [10, 10]))).toBeNull();
    expect(areaBadgePoint(of([0, 0], [10, 10], [20, 20]))).toBeNull();
    expect(areaBadgePoint(of([5, 5], [5, 5], [5, 5]))).toBeNull();
    expect(areaBadgePoint(of([0, 0], [10, 0], [Number.NaN, 5]))).toBeNull();
    expect(areaBadgePoint(of([0, 0], [Infinity, 0], [0, 5]))).toBeNull();
  });

  it('costs no more for an outline of many corners', () => {
    const star = Array.from({ length: 200 }, (_, i) => {
      const radius = i % 2 === 0 ? 500 : 200;
      return { x: radius * Math.cos((i / 200) * 2 * Math.PI), y: radius * Math.sin((i / 200) * 2 * Math.PI) };
    });
    const spot = areaBadgePoint(star)!;
    expect(Math.hypot(spot.x, spot.y)).toBeLessThan(20);
  });
});
