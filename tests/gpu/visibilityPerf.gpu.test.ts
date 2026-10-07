/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility } from '../../src/app/vision/visibility';
import { wallGridOf } from '../../src/app/vision/wallGrid';
import type { VisionCone } from '../../src/app/vision/visionCone';
import * as full from '../oracles/visibilityBaseline/visibility';
import { clipToCone as fullClip } from '../oracles/visibilityBaseline/visionCone';
import { BUDGET_SCENES, budgetScene } from '../helpers/visibilityMaps';

const counts = vi.hoisted(() => ({ on: false, rays: 0, rebuilt: 0 }));

vi.mock('../../src/app/vision/gridRays', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/vision/gridRays')>();
  return { ...actual, firstHit: (...args: Parameters<typeof actual.firstHit>) => { if (counts.on) counts.rays++; return actual.firstHit(...args); } };
});

vi.mock('../../src/app/vision/straightRuns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/vision/straightRuns')>();
  return { ...actual, reachOver: (...args: Parameters<typeof actual.reachOver>) => { if (counts.on) counts.rebuilt++; return actual.reachOver(...args); } };
});

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
/** One all-around unlimited polygon at about 5,000 sealed walls, warm or right after the walls changed. */
const BUDGET_MS = 5;
const SAMPLES = 5;
const ORIGINS = 12;
const CONES: VisionCone[] = [{ facing: 0.7, angle: Math.PI / 2, apex: 35 }, { facing: -2.9, angle: Math.PI / 6, apex: 35 }, { facing: 3.1, angle: (5 * Math.PI) / 3, apex: 35 }];

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function timed(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

function gridBytes(walls: readonly WallSegment[]): number {
  const grid = wallGridOf(walls)!;
  const s = grid.scratch;
  return [grid.coords, grid.ends, grid.starts, grid.items, s.seen, s.inReach, s.from, s.to, s.wraps, s.endCall, s.endAngle, s.endHidden, s.reach].reduce((sum, a) => sum + a.byteLength, 0) + grid.kept.length * 8;
}

const round = (ms: number): number => Math.round(ms * 1000) / 1000;

describe('sight on maps of about five thousand walls', () => {
  it.each(BUDGET_SCENES)('works out an unlimited polygon on %s within the budget, warm and right after the walls changed', (name) => {
    const map = budgetScene(name);
    const radius = Math.hypot(map.size, map.size);
    const origins: Point[] = map.origins.slice(0, ORIGINS);
    const sight = (walls: readonly WallSegment[], origin: Point, cone?: VisionCone): Point[] => computeVisibility(origin, radius, walls, cone, 'sight');
    for (let i = 0; i < 3; i++) sight(map.walls, origins[i]!);
    const warm = origins.map((origin) => median(Array.from({ length: SAMPLES }, () => timed(() => sight(map.walls, origin)))));
    const cold = origins.map((origin) => median(Array.from({ length: SAMPLES }, () => {
      const fresh = [...map.walls];
      return timed(() => sight(fresh, origin));
    })));
    const build = median(Array.from({ length: SAMPLES }, () => {
      const fresh = [...map.walls];
      return timed(() => wallGridOf(fresh));
    }));
    const oracle = median(origins.slice(0, 4).map((origin) => timed(() => full.computeVisibility(origin, radius, map.walls, undefined, 'sight'))));
    counts.on = true;
    counts.rays = 0;
    counts.rebuilt = 0;
    origins.forEach((origin) => sight(map.walls, origin));
    counts.on = false;
    const cones = CONES.map((cone) => {
      const polygons = origins.slice(0, 4).map((origin) => sight(map.walls, origin));
      const indexed = median(origins.slice(0, 4).map((origin) => timed(() => sight(map.walls, origin, cone))));
      const scanned = median(origins.slice(0, 4).map((origin, i) => timed(() => fullClip(origin, polygons[i]!, cone)) + warm[i]!));
      return { degrees: Math.round((cone.angle * 180) / Math.PI), indexed: round(indexed), fullScan: round(scanned) };
    });
    const figures = {
      scene: name, walls: map.walls.length,
      warm: { median: round(median(warm)), p95: round(quantile(warm, 0.95)), max: round(Math.max(...warm)) },
      cold: { median: round(median(cold)), p95: round(quantile(cold, 0.95)), max: round(Math.max(...cold)) },
      raysPerPolygon: Math.round(counts.rays / origins.length), rebuiltPerPolygon: Math.round(counts.rebuilt / origins.length),
      gridBuildMs: round(build), gridBytes: gridBytes(map.walls), fullSweepMs: round(oracle), speedUp: Math.round(oracle / median(warm)),
      cones,
    };
    console.info(`sight perf: ${JSON.stringify(figures)}`);
    if (STRICT) {
      for (const [i, ms] of warm.entries()) expect(ms, `warm from origin ${i}`).toBeLessThanOrEqual(BUDGET_MS);
      for (const [i, ms] of cold.entries()) expect(ms, `cold from origin ${i}`).toBeLessThanOrEqual(BUDGET_MS);
    }
  });
});
