import { describe, expect, it } from 'vitest';
import { sealedWalls } from '../../lighting/sealWalls';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility, pointInPolygon } from '../visibility';
import { crossedByHand, distanceToSegment, grazes, reachByHand, turningPoints } from './byHand';

let id = 0;
function wall(x1: number, y1: number, x2: number, y2: number, overrides: Partial<WallSegment> = {}): WallSegment {
  return { id: `j${id++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...overrides };
}
const hedge = (x1: number, y1: number, x2: number, y2: number): WallSegment => wall(x1, y1, x2, y2, { limited: true });
const sealed = (...drawn: WallSegment[]): readonly WallSegment[] => sealedWalls(drawn, 2);
const sees = (walls: readonly WallSegment[], from: Point, point: Point): boolean => pointInPolygon(point, computeVisibility(from, 3000, walls));

/** A seeded random number in [0, 1). */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
}

/** How many pixels of the line y = `y` from x = 0 to 800 the viewer does not see. */
function darkAlong(walls: readonly WallSegment[], from: Point, y: number): number {
  const seen = computeVisibility(from, 3000, walls);
  let dark = 0;
  for (let x = 0; x <= 800; x += 0.5) if (!pointInPolygon({ x, y: y + 0.13 }, seen)) dark += 0.5;
  return dark;
}

// Seeded checks with a fixed workload: 3 to 4.5 s on a hosted runner, close to the 5 s default.
describe('hedges that run together are one hedge', { timeout: 30_000 }, () => {
  const viewer = { x: 150, y: 200 };

  it.each<[string, WallSegment[]]>([
    ['ends four pixels past each other', [hedge(100, 300, 300, 300), hedge(296, 301, 500, 301)]],
    ['ends ten pixels short of each other', [hedge(100, 300, 300, 300), hedge(310, 301, 500, 301)]],
    ['drawn twice over forty pixels', [hedge(100, 300, 300, 300), hedge(260, 301, 500, 301)]],
    ['drawn twice over forty pixels, the strokes crossing', [hedge(100, 300, 320, 300), hedge(260, 301, 500, 295)]],
    ['drawn twice over its whole length', [hedge(100, 300, 500, 300), hedge(104, 303, 498, 298)]],
    ['one stroke of many short pieces', Array.from({ length: 100 }, (_, i) => hedge(100 + i * 4, 300 + Math.sin(i / 5) * 3, 104 + i * 4, 300 + Math.sin((i + 1) / 5) * 3))],
  ])('casts no dark stripe behind a row of hedges: %s', (_name, row) => {
    const walls = sealed(...row);
    expect([darkAlong(walls, viewer, 400), darkAlong(walls, viewer, 700)]).toEqual([0, 0]);
    // And it is a hedge: a second one behind it stops what passed.
    const two = sealed(...row, hedge(-200, 500, 1200, 500));
    expect(darkAlong(two, viewer, 400)).toBe(0);
    expect(sees(two, viewer, { x: 180, y: 520 })).toBe(false);
    expect(sees(two, viewer, { x: 330, y: 620 })).toBe(false);
  });

  it('counts a joint of three hedge ends once for a ray through the bridges between them', () => {
    // Three hedges whose ends stand ten pixels apart around (500, 500): the sealing joins them with a triangle of bridges.
    const walls = sealed(hedge(495, 497, 300, 400), hedge(505, 497, 700, 400), hedge(500, 506, 500, 800));
    expect(walls.length).toBeGreaterThan(5);
    // From between the left and the lower hedge, through the joint, into the space between the upper two.
    for (const from of [{ x: 420, y: 560 }, { x: 440, y: 590 }, { x: 380, y: 545 }]) {
      const to = { x: 500 + (500 - from.x) * 1.5, y: 500.5 + (500.5 - from.y) * 1.5 };
      expect([from, sees(walls, from, to)]).toEqual([from, true]);
    }
    // And no ray slips between the hedges without crossing one: beyond a second hedge it is dark.
    const fenced = sealed(...walls, hedge(300, 250, 700, 250));
    expect(sees(fenced, { x: 420, y: 560 }, { x: 600, y: 200 })).toBe(false);
  });

  it('keeps two hedges two where they cross as an X, however near they are at the crossing', () => {
    const walls = [hedge(300, 600, 700, 200), hedge(300, 200, 700, 600)];
    const from = { x: 500, y: 1000 };
    for (const x of [494, 497, 500, 503, 506]) expect([x, sees(walls, from, { x, y: 380 })]).toEqual([x, false]);
    // A shallow X too: its arms run within the join's reach of each other for a long way.
    const shallow = [hedge(100, 380, 900, 420), hedge(100, 420, 900, 380)];
    for (const x of [440, 480, 500, 520, 560]) expect([x, sees(shallow, { x: 500, y: 1000 }, { x, y: 300 })]).toEqual([x, false]);
  });

  it('counts two hedges side by side as one within the join\'s reach of each other, and as two beyond it', () => {
    const near = [hedge(0, 300, 800, 300), hedge(0, 310, 800, 310)];
    const apart = [hedge(0, 300, 800, 300), hedge(0, 320, 800, 320)];
    expect(sees(near, { x: 400, y: 100 }, { x: 420, y: 500 })).toBe(true);
    expect(sees(apart, { x: 400, y: 100 }, { x: 420, y: 500 })).toBe(false);
  });

  it('leaves no way around the end of a hedge that stops short of another: what passes the joint has crossed a hedge', () => {
    // A hedge that ends five pixels short of a long one, and a third behind the long one.
    const walls = sealed(hedge(0, 300, 800, 300), hedge(400, 305, 400, 700), hedge(0, 200, 800, 200));
    const from = { x: 300, y: 500 };
    // Right of the short hedge: one hedge crossed, seen. Above the long one: one hedge crossed, seen. Above the third: never.
    expect(sees(walls, from, { x: 500, y: 450 })).toBe(true);
    expect(sees(walls, from, { x: 350, y: 250 })).toBe(true);
    for (const x of [300, 380, 400, 404, 410, 450, 600]) expect([x, sees(walls, from, { x, y: 150 })]).toEqual([x, false]);
    // What crossed the short hedge and then the long one, well clear of the joint, is stopped at the long one.
    expect(sees(walls, from, { x: 600, y: 250 })).toBe(false);
  });

  it('agrees with counting by hand over rows of hedges with gaps, overlaps, branches and crossings', () => {
    let asked = 0, leaks = 0, hidden = 0, behindOne = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const rand = random(seed * 15_485_863);
      const drawn: WallSegment[] = [];
      // Rows of strokes that start a little before or after the last one ended, beside it.
      for (let row = 0; row < 2 + Math.floor(rand() * 2); row++) {
        let x = -500 + rand() * 100, y = -700 + row * (150 + rand() * 120);
        const slope = (rand() - 0.5) * 0.4;
        for (let piece = 0; piece < 3 + Math.floor(rand() * 3); piece++) {
          const length = 120 + rand() * 250;
          drawn.push(hedge(x, y, x + length, y + slope * length + (rand() - 0.5) * 20));
          x += length + (rand() - 0.5) * 60;
          y += slope * length + (rand() - 0.5) * 8;
        }
      }
      // A branch that ends at a row, short of it or past it, and now and then a hedge across everything.
      const stem = drawn[Math.floor(rand() * drawn.length)]!;
      const at = { x: (stem.p1.x + stem.p2.x) / 2, y: (stem.p1.y + stem.p2.y) / 2 };
      drawn.push(hedge(at.x + (rand() - 0.5) * 6, at.y + (rand() - 0.5) * 16, at.x + (rand() - 0.5) * 200, at.y + 100 + rand() * 100));
      if (rand() < 0.4) drawn.push(hedge(-400 + rand() * 200, -800, 200 + rand() * 300, -100));
      const walls = sealedWalls(drawn, 2);
      const from = { x: (rand() - 0.5) * 600, y: 100 + rand() * 200 };
      const seen = computeVisibility(from, 4000, walls);
      const turning = turningPoints(walls);
      for (let i = 0; i < 400; i++) {
        const angle = -Math.PI * rand();
        const far = { x: from.x + Math.cos(angle) * 1600, y: from.y + Math.sin(angle) * 1600 };
        if (grazes(from, far, turning, 0.5)) continue;
        const reach = reachByHand(from, angle, walls);
        for (const t of [reach - 0.75, reach + 0.75, reach + 20, reach * rand()]) {
          if (!(t > 1 && t < 1600)) continue;
          const point = { x: from.x + Math.cos(angle) * t, y: from.y + Math.sin(angle) * t };
          if (walls.some((w) => distanceToSegment(point, w.p1, w.p2) < 0.05)) continue;
          asked++;
          const inside = pointInPolygon(point, seen);
          if (t < reach && crossedByHand(from, point, walls).limited === 1) behindOne++;
          if (t > reach && inside) leaks++;
          if (t < reach && !inside) hidden++;
        }
      }
    }
    expect(asked).toBeGreaterThan(150_000);
    expect(behindOne).toBeGreaterThan(30_000);
    expect({ leaks, hidden }).toEqual({ leaks: 0, hidden: 0 });
  });
});
