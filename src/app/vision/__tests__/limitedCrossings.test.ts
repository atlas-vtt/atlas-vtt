import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility, pointInPolygon } from '../visibility';
import { crossedByHand, crossingPoint, distanceToSegment as distance, grazes, reachByHand, turningPoints } from './byHand';

let id = 0;
function wall(x1: number, y1: number, x2: number, y2: number, overrides: Partial<WallSegment> = {}): WallSegment {
  return { id: `x${id++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...overrides };
}
const hedge = (x1: number, y1: number, x2: number, y2: number): WallSegment => wall(x1, y1, x2, y2, { limited: true });

/** A seeded random number in [0, 1). */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
}

const RADIUS = 4000;

interface Tally { asked: number; leaks: number; deepest: number; hidden: number; behindOne: number }

/**
 * Holds the sweep's polygon against the reference along rays from `from`: aimed at every
 * crossing of two walls and close beside it, and all around. A point a ray reaches must lie in
 * the polygon and one beyond its reach must not; a ray within half a pixel of a wall's end, of
 * the crossing itself or of the place where two hedges begin to run together is anyone's.
 */
function compare(from: Point, walls: readonly WallSegment[], rand: () => number, tally: Tally): void {
  const seen = computeVisibility(from, RADIUS, walls);
  const ends = turningPoints(walls);
  const angles: number[] = [];
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const at = crossingPoint(walls[i]!, walls[j]!);
      if (!at) continue;
      const angle = Math.atan2(at.y - from.y, at.x - from.x);
      for (let k = 0; k < 24; k++) angles.push(angle + (rand() - 0.5) * 10 ** -(1 + Math.floor(rand() * 4)));
    }
  }
  for (let k = 0; k < 60; k++) angles.push((rand() - 0.5) * Math.PI * 2);
  for (const angle of angles) {
    const far = { x: from.x + Math.cos(angle) * 1500, y: from.y + Math.sin(angle) * 1500 };
    if (grazes(from, far, ends, 0.5)) continue;
    const reach = reachByHand(from, angle, walls);
    for (const t of [reach - 0.75, reach + 0.75, reach + 4, reach + 25, reach * rand(), reach + rand() * 200]) {
      if (!(t > 1 && t < 1500)) continue;
      const point = { x: from.x + Math.cos(angle) * t, y: from.y + Math.sin(angle) * t };
      if (walls.some((w) => distance(point, w.p1, w.p2) < 0.05)) continue;
      const inside = pointInPolygon(point, seen);
      tally.asked++;
      if (t < reach && crossedByHand(from, point, walls).limited === 1) tally.behindOne++;
      if (t > reach && inside) {
        tally.leaks++;
        tally.deepest = Math.max(tally.deepest, t - reach);
      }
      if (t < reach && !inside) tally.hidden++;
    }
  }
}

const empty = (): Tally => ({ asked: 0, leaks: 0, deepest: 0, hidden: 0, behindOne: 0 });

// Seeded checks with a fixed workload: 3 to 4.5 s on a hosted runner, close to the 5 s default.
describe('limited walls that cross between their ends', { timeout: 30_000 }, () => {
  it('shows nothing behind both of two hedges that cross: the reviewer\'s case', () => {
    const from = { x: 520, y: 1000 };
    const walls = [hedge(300, 600, 700, 200), hedge(300, 200, 700, 600)];
    const seen = computeVisibility(from, RADIUS, walls);
    let behindBoth = 0, leaks = 0, deepest = 0;
    for (let ix = 0; ix <= 120; ix++) {
      for (let iy = 0; iy <= 120; iy++) {
        const point = { x: 440 + ix, y: 320 + iy + 0.29 };
        if (walls.some((w) => distance(point, w.p1, w.p2) < 0.5)) continue;
        const angle = Math.atan2(point.y - from.y, point.x - from.x), t = Math.hypot(point.x - from.x, point.y - from.y);
        if (crossedByHand(from, point, walls).limited < 2) continue;
        behindBoth++;
        if (pointInPolygon(point, seen)) {
          leaks++;
          deepest = Math.max(deepest, t - reachByHand(from, angle, walls));
        }
      }
    }
    expect(behindBoth).toBeGreaterThan(2000);
    expect({ leaks, deepest }).toEqual({ leaks: 0, deepest: 0 });
  });

  it.each<[string, WallSegment[]]>([
    ['two hedges as an X', [hedge(-200, -400, 200, -800), hedge(-200, -800, 200, -400)]],
    ['three hedges through one point', [hedge(-300, -600, 300, -600), hedge(-200, -400, 200, -800), hedge(-200, -800, 200, -400)]],
    ['a grid of hedges', [hedge(-300, -400, 300, -420), hedge(-300, -520, 300, -500), hedge(-150, -300, -130, -700), hedge(140, -300, 120, -700)]],
    ['a hedge across a wall', [hedge(-200, -400, 200, -800), wall(-200, -800, 200, -400)]],
    ['two crossing hedges and a wall across both', [hedge(-200, -400, 200, -800), hedge(-200, -800, 200, -400), wall(-300, -640, 300, -560)]],
    ['a star of five hedges', Array.from({ length: 5 }, (_, i) => hedge(Math.cos(i * 0.63) * 220, -600 + Math.sin(i * 0.63) * 220, -Math.cos(i * 0.63) * 220, -600 - Math.sin(i * 0.63) * 220))],
  ])('stops every ray where counting by hand stops it: %s', (_name, walls) => {
    const tally = empty();
    const rand = random(99);
    for (const from of [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: -260, y: -90 }, { x: 310, y: -610 }, { x: 0, y: -1100 }]) compare(from, walls, rand, tally);
    expect(tally.asked).toBeGreaterThan(400);
    expect({ leaks: tally.leaks, deepest: tally.deepest, hidden: tally.hidden }).toEqual({ leaks: 0, deepest: 0, hidden: 0 });
  });

  it('stops every ray where counting by hand stops it, over 3,000 random sets of hedges that cross each other and a wall', () => {
    const tally = empty();
    let crossings = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const rand = random(seed * 104_729);
      const through = (limited: boolean): WallSegment => {
        const x = (rand() - 0.5) * 300, y = -500 + (rand() - 0.5) * 300, angle = rand() * Math.PI, half = 80 + rand() * 320;
        return wall(x - Math.cos(angle) * half, y - Math.sin(angle) * half, x + Math.cos(angle) * half, y + Math.sin(angle) * half, limited ? { limited: true } : {});
      };
      // Hedges through one part of the map, so that they cross each other, and at most one solid wall (two would cross too, which the sweep has never cast a ray at).
      const walls = Array.from({ length: 2 + Math.floor(rand() * 4) }, () => through(true));
      if (rand() < 0.4) walls.push(through(false));
      const from = { x: (rand() - 0.5) * 500, y: (rand() - 0.5) * 300 };
      if (walls.some((w) => distance(from, w.p1, w.p2) < 2)) continue;
      for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) if (crossingPoint(walls[i]!, walls[j]!)) crossings++;
      compare(from, walls, rand, tally);
    }
    expect(crossings).toBeGreaterThan(5000);
    expect(tally.asked).toBeGreaterThan(500_000);
    expect(tally.behindOne).toBeGreaterThan(20_000);
    expect({ leaks: tally.leaks, deepest: tally.deepest, hidden: tally.hidden }).toEqual({ leaks: 0, deepest: 0, hidden: 0 });
  });
});

// Seeded checks with a fixed workload: 3 to 4.5 s on a hosted runner, close to the 5 s default.
describe('the cost of crossings', { timeout: 30_000 }, () => {
  // A hatch of 2 x 150 hedges has 22,500 crossings and is swept in about 1 s; a stroke of
  // 2,000 hedges that never cross in about 30 ms. The bound guards against a count that grows
  // with every pair of walls, crossing or not (minutes for the stroke).
  it('sweeps a hatch of hedges and a long stroke of them within the bound', () => {
    const hatch = [
      ...Array.from({ length: 150 }, (_, i) => hedge(-600 + i * 8, -900, -590 + i * 8, -300)),
      ...Array.from({ length: 150 }, (_, i) => hedge(-700, -880 + i * 4, 700, -870 + i * 4)),
    ];
    const stroke = Array.from({ length: 2000 }, (_, i) => hedge(-1000 + i, -400 + Math.sin(i / 40) * 80, -999 + i, -400 + Math.sin((i + 1) / 40) * 80));
    const started = performance.now();
    const polygon = computeVisibility({ x: 0, y: 0 }, RADIUS, hatch);
    const hatched = performance.now() - started;
    computeVisibility({ x: 0, y: 0 }, RADIUS, stroke);
    const stroked = performance.now() - started - hatched;
    console.info(`sweep with crossings: hatch ${polygon.length} corners in ${hatched.toFixed(0)} ms, stroke of 2,000 in ${stroked.toFixed(0)} ms`);
    expect(polygon.length).toBeGreaterThan(22_500);
    expect(hatched).toBeLessThan(15_000);
    expect(stroked).toBeLessThan(15_000);
  });
});
