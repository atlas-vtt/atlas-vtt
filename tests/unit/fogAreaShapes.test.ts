import { describe, expect, it } from 'vitest';
import { fittedArea, joinedArea, simplifiedOutline, trimmedArea } from '../../src/app/fog/fogAreas';
import type { Point } from '../../src/app/types/visionTypes';

const box = (x: number, y: number, width: number, height: number): Point[] =>
  [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];

/** The corners of an outline in an order that does not depend on where it starts or which way it runs. */
const corners = (outline: readonly Point[] | null): string[] => (outline ?? []).map((point) => `${point.x},${point.y}`).sort();
const at = (...points: [number, number][]): string[] => points.map(([x, y]) => `${x},${y}`).sort();

function area(outline: readonly Point[]): number {
  let twice = 0;
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

describe('a new area fitted to its neighbours', () => {
  it('loses what a neighbour covers of it', () => {
    const fitted = fittedArea(box(50, 0, 150, 100), [box(0, 0, 100, 100)]);
    expect(corners(fitted)).toEqual(at([100, 0], [200, 0], [200, 100], [100, 100]));
  });

  it('is cut around a neighbour in its corner, to an L', () => {
    const fitted = fittedArea(box(0, 0, 100, 100), [box(50, 50, 100, 100)]);
    expect(corners(fitted)).toEqual(at([0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]));
    expect(area(fitted)).toBe(7500);
  });

  it('is cut by several neighbours at once', () => {
    const fitted = fittedArea(box(0, 0, 300, 100), [box(-50, -50, 100, 300), box(250, -50, 100, 300)]);
    expect(corners(fitted)).toEqual(at([50, 0], [250, 0], [250, 100], [50, 100]));
  });

  it('stays as drawn where it meets no neighbour, also one it only touches', () => {
    const drawn = box(100, 0, 100.3, 100);
    expect(fittedArea(drawn, [])).toEqual(drawn);
    expect(fittedArea(drawn, [box(0, 0, 100, 100), box(500, 500, 10, 10)])).toEqual(drawn);
    // A copy: the shape handed in is not the one handed back.
    expect(fittedArea(drawn, [])).not.toBe(drawn);
  });

  it('stays as drawn where a neighbour would cut it in two', () => {
    const drawn = box(0, 25, 300, 50);
    expect(fittedArea(drawn, [box(100, 0, 50, 100)])).toEqual(drawn);
  });

  it('stays as drawn where a neighbour would leave a hole in it', () => {
    const drawn = box(0, 0, 100, 100);
    expect(fittedArea(drawn, [box(40, 40, 20, 20)])).toEqual(drawn);
  });

  it('stays as drawn where the neighbours cover it whole', () => {
    const drawn = box(10, 10, 20, 20);
    expect(fittedArea(drawn, [box(0, 0, 100, 100)])).toEqual(drawn);
  });

  it('stays as drawn where it cannot be read', () => {
    const drawn = [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 0, y: 10 }];
    expect(fittedArea(drawn, [box(0, 0, 100, 100)])).toEqual(drawn);
  });
});

describe('a shape joined to an area', () => {
  it('makes one outline with a shape that shares an edge', () => {
    const joined = joinedArea(box(0, 0, 100, 100), box(100, 0, 100, 50));
    expect(corners(joined)).toEqual(at([0, 0], [200, 0], [200, 50], [100, 50], [100, 100], [0, 100]));
  });

  it('makes one outline with a shape that overlaps it', () => {
    const joined = joinedArea(box(0, 0, 100, 100), box(50, 25, 100, 50));
    expect(joined && area(joined)).toBe(10000 + 2500);
  });

  it('is the area itself where the shape lies inside it', () => {
    expect(corners(joinedArea(box(0, 0, 100, 100), box(20, 20, 10, 10)))).toEqual(at([0, 0], [100, 0], [100, 100], [0, 100]));
  });

  it('is refused where the shape lies apart', () => {
    expect(joinedArea(box(0, 0, 100, 100), box(150, 0, 50, 50))).toBeNull();
  });

  it('is refused where the two enclose a hole', () => {
    // A U, and the bar that closes it.
    const u = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 200, y: 300 }, { x: 200, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 300 }, { x: 0, y: 300 }];
    expect(joinedArea(u, box(0, 250, 300, 50))).toBeNull();
  });

  it('is refused where either cannot be read', () => {
    expect(joinedArea(box(0, 0, 100, 100), [{ x: 0, y: 0 }, { x: 1e12, y: 0 }, { x: 0, y: 5 }])).toBeNull();
  });
});

describe('a shape taken away from an area', () => {
  it('cuts a corner off, to an L', () => {
    const trimmed = trimmedArea(box(0, 0, 100, 100), box(50, 50, 100, 100));
    expect(corners(trimmed)).toEqual(at([0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]));
  });

  it('leaves the area as it is where the shape lies apart', () => {
    expect(corners(trimmedArea(box(0, 0, 100, 100), box(200, 200, 50, 50)))).toEqual(at([0, 0], [100, 0], [100, 100], [0, 100]));
  });

  it('is refused where it would split the area in two', () => {
    expect(trimmedArea(box(0, 0, 100, 100), box(40, -10, 20, 120))).toBeNull();
  });

  it('is refused where it would leave a hole', () => {
    expect(trimmedArea(box(0, 0, 100, 100), box(40, 40, 20, 20))).toBeNull();
  });

  it('is refused where nothing of the area would be left', () => {
    expect(trimmedArea(box(10, 10, 20, 20), box(0, 0, 100, 100))).toBeNull();
  });
});

describe('an outline thinned to few enough corners', () => {
  it('is left as it is where it has no more than it may', () => {
    const outline = box(0.5, 0.25, 10, 10);
    expect(simplifiedOutline(outline, 4)).toEqual(outline);
    expect(simplifiedOutline(outline, 4)).not.toBe(outline);
  });

  it('loses the corners that lie on its straight sides first', () => {
    // A square of 100 with a corner every pixel along its sides.
    const dense: Point[] = [];
    for (let i = 0; i < 100; i++) dense.push({ x: i, y: 0 });
    for (let i = 0; i < 100; i++) dense.push({ x: 100, y: i });
    for (let i = 0; i < 100; i++) dense.push({ x: 100 - i, y: 100 });
    for (let i = 0; i < 100; i++) dense.push({ x: 0, y: 100 - i });
    expect(corners(simplifiedOutline(dense, 200))).toEqual(at([0, 0], [100, 0], [100, 100], [0, 100]));
  });

  it('keeps a round outline round, within a tolerance that grows until the corners fit', () => {
    const circle = Array.from({ length: 3000 }, (_, i) => ({ x: 1000 * Math.cos((i / 3000) * 2 * Math.PI), y: 1000 * Math.sin((i / 3000) * 2 * Math.PI) }));
    for (const most of [200, 40, 8]) {
      const thinned = simplifiedOutline(circle, most);
      expect(thinned.length).toBeLessThanOrEqual(most);
      expect(thinned.length).toBeGreaterThanOrEqual(3);
      // Every corner left is one of the circle's own.
      for (const point of thinned) expect(Math.hypot(point.x, point.y)).toBeCloseTo(1000, 6);
    }
    // 200 corners lose less than a hundredth of the circle.
    expect(area(simplifiedOutline(circle, 200))).toBeGreaterThan(Math.PI * 1000 * 1000 * 0.99);
  });

  it('never comes to fewer than three corners, however small the outline is', () => {
    const scribble = Array.from({ length: 900 }, (_, i) => ({ x: (i % 2) * 0.2 + i * 0.0001, y: ((i >> 1) % 2) * 0.2 }));
    const thinned = simplifiedOutline(scribble, 200);
    expect(thinned.length).toBeGreaterThanOrEqual(3);
    expect(thinned.length).toBeLessThanOrEqual(200);
  });
});
