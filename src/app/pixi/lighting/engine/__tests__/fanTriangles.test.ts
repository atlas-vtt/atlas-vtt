import { describe, expect, it } from 'vitest';
import type { Point } from '../../../../types/visionTypes';
import { computeVisibility } from '../../../../vision/visibility';
import type { WallSegment } from '../../../../types/wallTypes';
import { fanTriangles } from '../fanTriangles';

const TOLERANCE = 1 / 8;

const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function shoelace(polygon: readonly Point[]): number {
  return polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);
}

/** What a rasteriser needs of the triangles: all one way round, covering the polygon's area, and no edge inside the polygon ending on another's corner. */
function holdsWatertight(origin: Point, polygon: readonly Point[]): void {
  const indices = fanTriangles(origin, polygon, TOLERANCE);
  const points = [origin, ...polygon];
  const open = new Map<string, number>();
  let area = 0;
  const way = Math.sign(shoelace(polygon.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }))));
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    const signed = cross(points[a]!, points[b]!, points[c]!) / 2;
    expect(signed * way, `triangle ${a} ${b} ${c}`).toBeGreaterThanOrEqual(-1);
    area += signed;
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const back = `${to}>${from}`;
      if ((open.get(back) ?? 0) > 0) open.set(back, open.get(back)! - 1);
      else open.set(`${from}>${to}`, (open.get(`${from}>${to}`) ?? 0) + 1);
    }
  }
  expect(Math.abs(area - shoelace(polygon))).toBeLessThan(TOLERANCE * polygon.length * 200);
  // What is left open is the outline: no edge from the origin, whose neighbour would end on another line.
  for (const [edge, count] of open) if (count > 0) expect(edge.startsWith('0>') || edge.endsWith('>0'), `open edge ${edge}`).toBe(false);
}

const wall = (x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id: `${x1},${y1},${x2},${y2}`, type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } } as unknown as WallSegment);

describe('the triangles of a fan', () => {
  it('make a plain fan of a polygon with nothing along a ray', () => {
    const square = [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }];
    expect(fanTriangles({ x: 0, y: 0 }, square, TOLERANCE)).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
  });

  it('end on the near corner on both sides of a ray the outline runs along', () => {
    // The outline leaves the far wall at (100, 0)'s bearing, comes in along the ray to the corner at (50, 0), and goes on from there.
    const origin = { x: 0, y: 0 };
    const polygon = [{ x: 100, y: -100 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: -100, y: 100 }, { x: -100, y: -100 }];
    const triangles = fanTriangles(origin, polygon, TOLERANCE);
    holdsWatertight(origin, polygon);
    // The edge from the origin goes to the near corner (index 3), never to the far one (index 2).
    const fromOrigin = new Set<number>();
    for (let i = 0; i < triangles.length; i += 3) if (triangles[i] === 0) fromOrigin.add(triangles[i + 1]!).add(triangles[i + 2]!);
    expect(fromOrigin.has(3)).toBe(true);
    expect(fromOrigin.has(2)).toBe(false);
  });

  it('leave out what a beam does not reach: the outline comes back through the origin', () => {
    const origin = { x: 0, y: 0 };
    const beam = [origin, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const triangles = fanTriangles(origin, beam, TOLERANCE);
    const points = [origin, ...beam];
    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) area += cross(points[triangles[i]!]!, points[triangles[i + 1]!]!, points[triangles[i + 2]!]!) / 2;
    expect(area).toBeCloseTo(10_000, 3);
  });

  it('give nothing for a polygon that lies along one ray', () => {
    expect(fanTriangles({ x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], TOLERANCE)).toEqual([]);
  });

  it('hold for the polygons walls on a grid give, with the light on the grid and off it', () => {
    let seed = 7;
    const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const walls: WallSegment[] = [];
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(random() * 14) * 70; const y = Math.floor(random() * 14) * 70; const len = Math.floor(random() * 3 + 1) * 70;
      walls.push(random() < 0.5 ? wall(x, y, x + len, y) : wall(x, y, x, y + len));
    }
    for (let i = 0; i < 300; i++) {
      const origin = i % 3 === 0 ? { x: Math.floor(random() * 28) * 35 + 0.5, y: Math.floor(random() * 28) * 35 + 0.5 } : { x: random() * 980, y: random() * 980 };
      const polygon = computeVisibility(origin, 400, walls);
      if (polygon.length >= 3) holdsWatertight(origin, polygon);
    }
  });
});
