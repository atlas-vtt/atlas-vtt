import { describe, expect, it } from 'vitest';
import { boxOf, grown, segmentGrid } from '../segmentGrid';
import { distanceTo, type Segment } from '../wallSides';
import { random } from './sealFixtures';

type Layout = (rand: () => number, count: number) => Segment[];
const segment = (x1: number, y1: number, x2: number, y2: number): Segment => ({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });

/** Segments as maps hold them: short ones everywhere, a heap in one spot, long slanted ones, and ones left and above of zero. */
const LAYOUTS: Record<string, Layout> = {
  short: (rand, count) => Array.from({ length: count }, () => {
    const [x, y] = [rand() * 2000, rand() * 2000];
    return segment(x, y, x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60);
  }),
  heap: (rand, count) => Array.from({ length: count }, () => segment(500 + rand() * 20, 500 + rand() * 20, 500 + rand() * 20, 500 + rand() * 20)),
  long: (rand, count) => Array.from({ length: count }, () => segment(rand() * 4000, rand() * 4000, rand() * 4000, rand() * 4000)),
  aroundZero: (rand, count) => Array.from({ length: count }, () => segment((rand() - 0.5) * 300, (rand() - 0.5) * 300, (rand() - 0.5) * 300, (rand() - 0.5) * 300)),
};

describe('segments filed by the cells of a grid', () => {
  it.each(Object.keys(LAYOUTS))('hands out every segment within reach of a point, in the order given: %s', (name) => {
    const rand = random(11);
    for (const reach of [0.5, 1.5, 40]) {
      const segments = LAYOUTS[name]!(rand, 300);
      const grid = segmentGrid(segments, reach);
      for (let query = 0; query < 400; query++) {
        const from = segments[Math.floor(rand() * segments.length)]!;
        // Half the points lie beside a segment, where the answer matters, the others anywhere.
        const point = query % 2 ? { x: from.p1.x + (rand() - 0.5) * 2 * reach, y: from.p1.y + (rand() - 0.5) * 2 * reach } : { x: rand() * 2000, y: rand() * 2000 };
        const near = grid.near(point);
        const within = segments.filter((other) => distanceTo(other, point) <= reach);
        expect(near.filter((other) => distanceTo(other, point) <= reach)).toEqual(within);
      }
    }
  });

  it.each(Object.keys(LAYOUTS))('hands out every segment whose grown box meets a box, each once, in the order given: %s', (name) => {
    const rand = random(23);
    const segments = LAYOUTS[name]!(rand, 300);
    const grid = segmentGrid(segments, 1.5);
    for (let query = 0; query < 300; query++) {
      const box = boxOf(segment(rand() * 2400 - 200, rand() * 2400 - 200, rand() * 2400 - 200, rand() * 2400 - 200));
      const meets = segments.filter((other) => {
        const own = grown(boxOf(other), 1.5);
        return own.left <= box.right && box.left <= own.right && own.top <= box.bottom && box.top <= own.bottom;
      });
      expect(grid.touching(box)).toEqual(meets);
    }
  });

  it('leaves out a segment with an end that is no number, and answers with all of them where one lies far out', () => {
    const real = segment(0, 0, 10, 0);
    expect(segmentGrid([segment(Number.NaN, 0, 5, 5), real], 1).near({ x: 5, y: 0 })).toEqual([real]);
    const far = segment(1e15, 0, 1e15 + 10, 0);
    const grid = segmentGrid([real, far], 1);
    expect(grid.near({ x: 5, y: 0 })).toEqual([real, far]);
    expect(grid.touching(boxOf(real))).toEqual([real]);
    expect(segmentGrid([real], 1).near({ x: 1e300, y: 0 })).toEqual([real]);
    expect(segmentGrid([real], 1).touching({ left: -1e300, top: -1, right: 1e300, bottom: 1 })).toEqual([real]);
    expect(segmentGrid([], 1).near({ x: 0, y: 0 })).toEqual([]);
  });
});
