// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { computeVisibility } from '../../src/app/vision/visibility';
import { buildWallGrid } from '../../src/app/vision/wallGrid';
import * as full from '../oracles/visibilityBaseline/visibility';
import { budgetScene } from '../helpers/visibilityMaps';
import { HOSTILE_SCENES } from '../helpers/visibilityHostile';

const counts = vi.hoisted(() => ({ tests: 0, oracle: 0, rays: 0 }));

vi.mock('../../src/app/vision/visionGeometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/vision/visionGeometry')>();
  return {
    ...actual,
    rayHit: (...args: Parameters<typeof actual.rayHit>) => { counts.tests++; return actual.rayHit(...args); },
    raySegmentIntersect: (...args: Parameters<typeof actual.raySegmentIntersect>) => { counts.tests++; return actual.raySegmentIntersect(...args); },
  };
});

vi.mock('../oracles/visibilityBaseline/visionGeometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oracles/visibilityBaseline/visionGeometry')>();
  return { ...actual, raySegmentIntersect: (...args: Parameters<typeof actual.raySegmentIntersect>) => { counts.oracle++; return actual.raySegmentIntersect(...args); } };
});

vi.mock('../../src/app/vision/gridRays', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/vision/gridRays')>();
  return { ...actual, firstHit: (...args: Parameters<typeof actual.firstHit>) => { counts.rays++; return actual.firstHit(...args); } };
});

/**
 * The most rays the culling rules cast from any of the first twelve origins of each scene,
 * worked out by brute force against the full sweep (`castCount`), with a quarter to spare.
 */
const CAST_BOUND = { rooms: Math.ceil(1.25 * 697), pillars: Math.ceil(1.25 * 1956) };

/** The most rays cast from the places on wall lines the test below looks from (926), with a quarter to spare. */
const ON_LINE_CAST_BOUND = Math.ceil(1.25 * 926);

/**
 * Durations measured on the machine the bounds were set on (Apple M4 Pro, this suite's Node), in
 * ms; CI asserts ten times them, never a budget. The hostile piles: their polygons from every
 * place listed, grid built on the way.
 */
const EXPECTED_MS = { gridRooms: 2, gridPillars: 1.2 };
const EXPECTED_HOSTILE_MS: Record<string, number> = {
  'two thousand walls from six pixels': 80,
  'two thousand short walls in twelve pixels': 45,
  'two thousand walls from one point': 205,
  'a cave of 1,980 short segments': 25,
  'four hundred long walls beside four hundred ends': 80,
};

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
}

function timed(run: () => void, times = 5): number {
  const ms: number[] = [];
  for (let i = 0; i < times; i++) {
    const started = performance.now();
    run();
    ms.push(performance.now() - started);
  }
  return median(ms);
}

describe('sight on maps with many walls', { timeout: 600_000 }, () => {
  it.each(['rooms', 'pillars'] as const)('casts few rays and tests few walls on %s', (name) => {
    const map = budgetScene(name);
    const radius = Math.hypot(map.size, map.size);
    for (const origin of map.origins.slice(0, 12)) {
      counts.oracle = 0;
      full.computeVisibility(origin, radius, map.walls, undefined, 'sight');
      const oracle = counts.oracle;
      counts.tests = 0;
      counts.rays = 0;
      computeVisibility(origin, radius, map.walls, undefined, 'sight');
      expect(counts.rays, `rays cast from (${origin.x}, ${origin.y})`).toBeLessThanOrEqual(CAST_BOUND[name]);
      expect(counts.tests, `walls tested from (${origin.x}, ${origin.y}), against ${oracle}`).toBeLessThanOrEqual(oracle / 10);
    }
  });

  // On a map drawn on a grid, a place on a wall's line has the walls of a whole row or column in line with it.
  it('casts few rays and tests few walls from the wall ends, walls and wall lines of a map drawn on a grid', () => {
    const map = budgetScene('doorways');
    const radius = Math.hypot(map.size, map.size);
    const picks = [3, 400, 901, 1777, 2500, 3333, 4100, 4444].map((i) => map.walls[i]!);
    const origins = picks.flatMap((w) => [{ ...w.p1 }, { x: (w.p1.x + w.p2.x) / 2, y: (w.p1.y + w.p2.y) / 2 }, { x: w.p1.x + (w.p1.x - w.p2.x) * 0.31, y: w.p1.y + (w.p1.y - w.p2.y) * 0.31 }]);
    for (const origin of origins) {
      counts.oracle = 0;
      full.computeVisibility(origin, radius, map.walls, undefined, 'sight');
      const oracle = counts.oracle;
      counts.tests = 0;
      counts.rays = 0;
      computeVisibility(origin, radius, map.walls, undefined, 'sight');
      expect(counts.rays, `rays cast from (${origin.x}, ${origin.y})`).toBeLessThanOrEqual(ON_LINE_CAST_BOUND);
      expect(counts.tests, `walls tested from (${origin.x}, ${origin.y}), against ${oracle}`).toBeLessThanOrEqual(oracle / 10);
    }
  });

  it('prints the time of sight on pillars and of building the wall grid', () => {
    const rooms = budgetScene('rooms'), pillars = budgetScene('pillars');
    const gridRooms = timed(() => buildWallGrid(rooms.walls));
    const gridPillars = timed(() => buildWallGrid(pillars.walls));
    const radius = Math.hypot(pillars.size, pillars.size);
    computeVisibility(pillars.origins[0]!, radius, pillars.walls, undefined, 'sight');
    const sight = median(pillars.origins.slice(0, 12).map((origin) => timed(() => computeVisibility(origin, radius, pillars.walls, undefined, 'sight'))));
    console.info(`sight timing: pillars ${pillars.walls.length} walls, ${sight.toFixed(2)} ms a polygon; grid build rooms ${gridRooms.toFixed(2)} ms, pillars ${gridPillars.toFixed(2)} ms`);
    expect(gridRooms).toBeLessThan(10 * EXPECTED_MS.gridRooms);
    expect(gridPillars).toBeLessThan(10 * EXPECTED_MS.gridPillars);
  });

  it.each(HOSTILE_SCENES)('stays within its bound on a hostile pile of %s', (_, make) => {
    const scene = make();
    const started = performance.now();
    for (const origin of scene.origins) computeVisibility(origin, 2000, scene.walls, undefined, 'sight');
    const ms = performance.now() - started;
    console.info(`sight timing: ${scene.name}, ${scene.walls.length} walls, ${ms.toFixed(0)} ms for ${scene.origins.length} polygons`);
    expect(ms).toBeLessThan(10 * EXPECTED_HOSTILE_MS[scene.name]!);
  });
});
