// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallChannel, WallSegment } from '../../src/app/types/wallTypes';
import { buildWallGrid, GRID_MARGIN, wallGridOf, type WallGrid } from '../../src/app/vision/wallGrid';
import { anyHitBefore, firstHit, rayQuery, wallsNear } from '../../src/app/vision/gridRays';
import { angularSpans, spanCovers } from '../../src/app/vision/angularSpans';
import { distSqToSegment, raySegmentIntersect } from '../../src/app/vision/visionGeometry';
import { wallsInReach } from '../../src/app/vision/visibility';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { chainWalls, wall } from '../helpers/visibilityScenes';
import { cellSidesTrial, stopsBeforeTheWallInFront } from '../helpers/visibilityCellSides';

/** The nearest stop of the full sweep's ray at `angle`, by brute force, and every wall that stops it there. */
function bruteStop(walls: readonly WallSegment[], origin: Point, radius: number, angle: number, limit: number, channel?: WallChannel): { t: number; walls: WallSegment[] } {
  const spans = angularSpans(origin, wallsInReach(walls, origin, radius, channel));
  let t = limit;
  const at: WallSegment[] = [];
  for (const span of spans) {
    if (!spanCovers(span, angle)) continue;
    const hit = raySegmentIntersect(origin, angle, span.wall.p1, span.wall.p2);
    if (hit < t) { t = hit; at.length = 0; }
    if (hit === t) at.push(span.wall);
  }
  return { t, walls: at };
}

/** Angles of every kind: random, along the axes, through cell corners, and just beyond ±π as the sweep casts them. */
function anglesFor(grid: WallGrid, origin: Point, rand: () => number): number[] {
  const corner = { x: grid.minX + Math.round((origin.x - grid.minX) / grid.cell + 3) * grid.cell, y: grid.minY + Math.round((origin.y - grid.minY) / grid.cell + 2) * grid.cell };
  return [
    ...Array.from({ length: 40 }, () => rand() * 2 * Math.PI - Math.PI),
    0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI, Math.PI / 4, -3 * Math.PI / 4,
    Math.atan2(corner.y - origin.y, corner.x - origin.x),
    Math.PI + 4e-6, Math.PI + 1e-5, -Math.PI - 3e-6, -Math.PI - 1e-5,
  ];
}

function checkScene(walls: readonly WallSegment[], origins: Point[], rand: () => number): number {
  const grid = buildWallGrid(walls);
  let checked = 0;
  for (const origin of origins) {
    for (const [radius, channel] of [[1e5, 'sight'], [180, 'light'], [600, undefined]] as const) {
      const query = rayQuery(grid, origin, radius, channel);
      expect(Array.from(query.grid.scratch.reach.subarray(0, query.reachCount), (i) => walls[i]).sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(wallsInReach(walls, origin, radius, channel).sort((a, b) => (a.id < b.id ? -1 : 1)));
      for (const angle of anglesFor(grid, origin, rand)) {
        const expected = bruteStop(walls, origin, radius, angle, radius, channel);
        const hit = firstHit(query, angle, radius);
        expect(Object.is(hit.t, expected.t), `ray at ${angle} from (${origin.x}, ${origin.y})`).toBe(true);
        if (expected.walls.length) expect(expected.walls).toContain(walls[hit.wall]);
        else expect(hit.wall).toBe(-1);
        const limit = rand() * radius;
        expect(anyHitBefore(query, angle, limit)).toBe(bruteStop(walls, origin, radius, angle, limit, channel).t < limit);
        checked++;
      }
      for (let k = 0; k < 10; k++) {
        const a = walls[Math.floor(rand() * walls.length)]!.p1, b = { x: a.x + (rand() - 0.5) * 300, y: a.y + (rand() - 0.5) * 300 };
        const margin = [GRID_MARGIN, 0.5, 5][k % 3]!;
        const near = wallsNear(query, a, b, margin).map((i) => walls[i]!.id).sort();
        const brute = wallsInReach(walls, origin, radius, channel).filter((w) => segmentDistance(a, b, w.p1, w.p2) <= margin).map((w) => w.id).sort();
        expect(near).toEqual(brute);
      }
    }
  }
  return checked;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const cross = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.sqrt(Math.min(distSqToSegment(a, c, d), distSqToSegment(b, c, d), distSqToSegment(c, a, b), distSqToSegment(d, a, b)));
}

describe('the wall grid', () => {
  it('finds the nearest stop, any stop and the walls near a chord as brute force does', () => {
    const rand = rng(9);
    let checked = 0;
    for (let trial = 0; trial < 6; trial++) {
      const walls = chainWalls(rand, 300, 1500, 1200).map((w, i) => (i % 9 === 0 ? { ...w, type: 'door' as const, closed: i % 2 === 0 } : i % 7 === 0 ? { ...w, blocks: 'light' as const } : i % 11 === 0 ? { ...w, direction: 'left' as const } : w));
      const origins = [{ x: rand() * 1500, y: rand() * 1200 }, { x: -400, y: 600 }, { x: 750, y: -900 }, { x: 2100, y: 1500 }];
      checked += checkScene(walls, origins, rand);
    }
    const grid = Array.from({ length: 12 }, (_, i) => [wall({ x: i * 70, y: 0 }, { x: i * 70, y: 770 }), wall({ x: 0, y: i * 70 }, { x: 770, y: i * 70 })]).flat();
    checked += checkScene(grid, [{ x: 35, y: 35 }, { x: 140, y: 210 }, { x: 0, y: 0 }, { x: -70, y: 350 }], rand);
    expect(checked).toBeGreaterThan(2000);
  });

  it('stops a ray on a wall seen almost edge-on where the full sweep does, also before the cells that list the wall', () => {
    let short = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const trial = cellSidesTrial(seed);
      const { origin, radius } = trial.calls[0]!;
      const query = rayQuery(buildWallGrid(trial.walls), origin, radius, 'sight');
      const angle = Math.atan2(trial.edgeOn.p1.y - origin.y, trial.edgeOn.p1.x - origin.x);
      const expected = bruteStop(trial.walls, origin, radius, angle, radius, 'sight');
      expect(Object.is(firstHit(query, angle, radius).t, expected.t), `seed ${seed}`).toBe(true);
      for (const limit of [expected.t, expected.t * (1 + 1e-12), radius]) expect(anyHitBefore(query, angle, limit), `seed ${seed}`).toBe(expected.t < limit);
      if (stopsBeforeTheWallInFront(trial)) short++;
    }
    expect(short).toBeGreaterThanOrEqual(9);
  });

  it('keeps its cells few on piles of walls and on long diagonal walls', () => {
    const rand = rng(3);
    const pile = Array.from({ length: 20_000 }, () => wall({ x: 500 + rand() * 6, y: 500 + rand() * 6 }, { x: 500 + rand() * 6, y: 500 + rand() * 6 }));
    const diagonals = Array.from({ length: 200 }, (_, i) => wall({ x: i * 10, y: 0 }, { x: 8000 + i * 10, y: 8000 }));
    for (const walls of [pile, diagonals, [...diagonals, ...chainWalls(rand, 5000, 8000, 8000)]]) {
      const grid = buildWallGrid(walls);
      expect(grid.cols).toBeLessThanOrEqual(512);
      expect(grid.rows).toBeLessThanOrEqual(512);
      expect(grid.items.length).toBeLessThanOrEqual(8 * walls.length);
    }
    const mixed = buildWallGrid([...diagonals.slice(0, 1), ...chainWalls(rand, 5000, 8000, 8000)]);
    let listed = 0;
    for (let k = 0; k < mixed.items.length; k++) if (mixed.items[k] === 0) listed++;
    expect(listed).toBeLessThanOrEqual(3 * Math.max(mixed.cols, mixed.rows));
  });

  it('keeps the grids of the four arrays used last', () => {
    const rand = rng(5);
    const arrays = Array.from({ length: 5 }, () => chainWalls(rand, 50, 500, 500));
    const first = wallGridOf(arrays[0]!);
    expect(wallGridOf(arrays[0]!)).toBe(first);
    for (const walls of arrays.slice(1, 4)) wallGridOf(walls);
    expect(wallGridOf(arrays[0]!)).toBe(first);
    for (const walls of arrays.slice(1)) wallGridOf(walls);
    expect(wallGridOf(arrays[0]!)).not.toBe(first);
  });

  it('builds the grid again when a wall of the array is replaced in place', () => {
    const walls = chainWalls(rng(6), 80, 600, 600);
    const before = wallGridOf(walls)!;
    walls[10] = wall({ x: 1, y: 1 }, { x: 590, y: 590 });
    const after = wallGridOf(walls)!;
    expect(after).not.toBe(before);
    const query = rayQuery(after, { x: 590, y: 1 }, 1e4, 'sight');
    expect(firstHit(query, Math.atan2(589, -589), 1e4).t).toBe(bruteStop(walls, { x: 590, y: 1 }, 1e4, Math.atan2(589, -589), 1e4, 'sight').t);
  });

  it('builds the grid again when a wall of the array is moved in place', () => {
    const walls = chainWalls(rng(8), 80, 600, 600);
    const before = wallGridOf(walls)!;
    walls[3]!.p1.x += 40;
    expect(wallGridOf(walls)).not.toBe(before);
    walls[4]!.p2.y = -walls[4]!.p2.y;
    const moved = wallGridOf(walls);
    expect(wallGridOf(walls)).toBe(moved);
  });
});
