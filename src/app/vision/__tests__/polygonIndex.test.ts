import { describe, expect, it } from 'vitest';
import { insidePolygon } from '../polygonIndex';
import { computeVisibility, pointInPolygon, type Polygon } from '../visibility';
import type { WallSegment } from '../../types/wallTypes';

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points on and around the polygon's corners and edges, where rounding decides, and anywhere in its box. */
function probes(polygon: Polygon, random: () => number): { x: number; y: number }[] {
  const points = polygon.flatMap((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    const t = random();
    return [p, { x: p.x + 1e-9, y: p.y }, { x: p.x, y: p.y - 1e-9 }, { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }];
  });
  for (let i = 0; i < 200; i++) points.push({ x: -50 + random() * 700, y: -50 + random() * 500 });
  return [...points, { x: Number.NaN, y: 10 }, { x: 10, y: Number.NaN }];
}

function expectSameAnswers(polygon: Polygon, random: () => number): void {
  for (const point of probes(polygon, random)) {
    // Twice: the first question is answered without bands, every later one with them.
    expect(insidePolygon(point, polygon)).toBe(pointInPolygon(point, polygon));
    expect(insidePolygon(point, polygon)).toBe(pointInPolygon(point, polygon));
  }
}

describe('insidePolygon', () => {
  it('answers as pointInPolygon on random polygons, level edges, repeated corners and ends that are no number', () => {
    const random = rng(7);
    for (let trial = 0; trial < 60; trial++) {
      const n = 3 + Math.floor(random() * 80);
      const grid = trial % 3 === 0;
      const polygon = Array.from({ length: n }, () => ({ x: grid ? Math.round(random() * 12) * 50 : random() * 600, y: grid ? Math.round(random() * 8) * 50 : random() * 400 }));
      if (trial % 5 === 0) polygon.push({ ...polygon[0]! }, { x: Number.NaN, y: 100 }, { x: 200, y: Number.NaN });
      expectSameAnswers(polygon, random);
    }
    expectSameAnswers([{ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 5 }], random);
    expectSameAnswers([{ x: 0, y: 0 }, { x: 10, y: Number.POSITIVE_INFINITY }, { x: 20, y: 0 }], random);
  });

  it('answers as pointInPolygon on what walls leave of sight', () => {
    const random = rng(11);
    for (let trial = 0; trial < 10; trial++) {
      const walls: WallSegment[] = Array.from({ length: 40 }, (_, i) => {
        const p1 = { x: random() * 600, y: random() * 400 };
        return { id: `w${i}`, kind: 'wall', type: 'solid', p1, p2: { x: p1.x + (random() - 0.5) * 200, y: p1.y + (random() - 0.5) * 200 } } as WallSegment;
      });
      expectSameAnswers(computeVisibility({ x: 300, y: 200 }, 250 + random() * 400, walls), random);
    }
  });
});
