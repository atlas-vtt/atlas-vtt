// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../src/app/types/wallTypes';
import * as full from '../oracles/visibilityBaseline/visibility';
import { firstDifference } from '../helpers/visibilityCompare';
import { chainsTrial, conesTrial, corridorsTrial, roomsTrial, shortReachTrial, wall, wallKindsTrial, type VisibilityTrial } from '../helpers/visibilityScenes';
import { gridMapTrial } from '../helpers/visibilityMaps';
import { rowSeam, tiesTrial } from '../helpers/visibilityTies';
import { cellSidesTrial } from '../helpers/visibilityCellSides';
import { firstHitInFirstCell, gridsByIdentity, looseOutlineIndex } from '../helpers/brokenSweeps';
import { anyHitBefore } from '../../src/app/vision/gridRays';

type Visibility = typeof import('../../src/app/vision/visibility');
const mocked: string[] = [];

/** The sweep with one export of one of its modules replaced, freshly imported. */
async function sweepWith<M>(path: string, replace: (actual: M) => Partial<M>): Promise<Visibility> {
  vi.resetModules();
  mocked.push(path);
  vi.doMock(path, async (importOriginal) => {
    const actual = await importOriginal<M>();
    return { ...actual, ...replace(actual) };
  });
  return import('../../src/app/vision/visibility');
}

afterEach(() => {
  while (mocked.length) vi.doUnmock(mocked.pop()!);
  vi.resetModules();
});

/** How many of `trials` hold a call (with its cone) where the sweep differs from the full sweep. */
function failing(visibility: Visibility, trials: VisibilityTrial[]): number {
  return trials.filter((trial) => trial.calls.some(({ origin, radius, cone, channel }) =>
    firstDifference(visibility.computeVisibility(origin, radius, trial.walls, cone, channel), full.computeVisibility(origin, radius, trial.walls, cone, channel)) !== null)).length;
}

const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const rooms = (): VisibilityTrial[] => seeds.map(roomsTrial);
const chains = (): VisibilityTrial[] => seeds.map((seed) => chainsTrial(seed));
const STRAIGHT = '../../src/app/vision/straightRuns';
type StraightRuns = typeof import('../../src/app/vision/straightRuns');

describe('the culled sweep with a rule left out fails the equivalence checks', { timeout: 600_000 }, () => {
  it('when any run between two rays that stop on walls counts as one wall', async () => {
    const visibility = await sweepWith<StraightRuns>(STRAIGHT, () => ({ oneWallGap: (query, l, r) => l.wall >= 0 && r.wall >= 0 && l.t < query.radius && r.t < query.radius }));
    expect(failing(visibility, rooms())).toBeGreaterThanOrEqual(15);
    expect(failing(visibility, seeds.map(wallKindsTrial))).toBeGreaterThanOrEqual(15);
  });

  it('when hidden corners are written from the run\'s own wall alone', async () => {
    const visibility = await sweepWith<StraightRuns>(STRAIGHT, () => ({ tieSet: (_query, _a, _b, w) => [w] }));
    expect(failing(visibility, seeds.map(tiesTrial))).toBeGreaterThanOrEqual(3);
  });

  it('when runs across the ±π seam are rebuilt', async () => {
    const visibility = await sweepWith<StraightRuns>(STRAIGHT, () => ({ awayFromSeam: () => true }));
    const origin = { x: 1000, y: 1000 };
    const seam: VisibilityTrial = { family: 'seam', seed: 0, walls: rowSeam(origin, 2e-6, 2e-6), calls: [{ origin, radius: 4000, channel: 'sight' }] };
    expect(failing(visibility, [seam])).toBe(1);
    expect(failing(visibility, seeds.map(tiesTrial))).toBeGreaterThanOrEqual(3);
  });

  it('when runs are rebuilt where a wall is seen edge-on', async () => {
    const visibility = await sweepWith<StraightRuns>(STRAIGHT, () => ({ clearOfEdgeOn: () => true }));
    expect(failing(visibility, [corridorsTrial(26)])).toBe(1);
  });

  it('when a ray tests a wall seen edge-on only in the cells that list it', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/edgeOn')>('../../src/app/vision/edgeOn', () => ({ stopOnEdgeOn: () => undefined }));
    expect(failing(visibility, Array.from({ length: 300 }, (_, i) => cellSidesTrial(i + 1)))).toBeGreaterThanOrEqual(8);
  });

  it('when no wall counts as seen edge-on', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/edgeOn')>('../../src/app/vision/edgeOn', () => ({ seenEdgeOn: () => false }));
    expect(failing(visibility, [corridorsTrial(26)])).toBe(1);
    expect(failing(visibility, Array.from({ length: 300 }, (_, i) => cellSidesTrial(i + 1)))).toBeGreaterThanOrEqual(8);
  });

  it('when a ray at the radius counts as a hit on the wall beside it', async () => {
    const visibility = await sweepWith<StraightRuns>(STRAIGHT, () => ({ oneWallGap: (query, l, r) => (l.wall >= 0 || r.wall >= 0) && (l.wall < 0 || r.wall < 0 || query.grid.walls[l.wall] === query.grid.walls[r.wall]) }));
    expect(failing(visibility, seeds.map(shortReachTrial))).toBeGreaterThanOrEqual(2);
  });

  it('when a walk stops at the first cell with any hit', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/gridRays')>('../../src/app/vision/gridRays', () => ({ firstHit: firstHitInFirstCell }));
    expect(failing(visibility, [...chains().slice(0, 10), ...seeds.slice(0, 10).map((seed) => gridMapTrial(seed))])).toBeGreaterThanOrEqual(5);
  });

  it('when an end counts as hidden behind its own wall', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/hiddenEnds')>('../../src/app/vision/hiddenEnds', () => ({
      isEndHidden: (query, x, y, angle) => anyHitBefore(query, angle, Math.min(query.radius, Math.hypot(x - query.origin.x, y - query.origin.y) * (1 + 1e-9))),
    }));
    expect(failing(visibility, seeds.map(wallKindsTrial))).toBeGreaterThanOrEqual(10);
    expect(failing(visibility, seeds.map(tiesTrial))).toBeGreaterThanOrEqual(10);
  });

  it('when the grid is kept for an array whose walls were replaced or moved in place', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/wallGrid')>('../../src/app/vision/wallGrid', (actual) => ({ wallGridOf: gridsByIdentity((walls) => actual.buildWallGrid(walls)) }));
    const replaced = chainsTrial(4).walls.slice(), moved = chainsTrial(5).walls.map((w) => ({ ...w, p1: { ...w.p1 }, p2: { ...w.p2 } }));
    const origin = { x: 1800, y: 2200 }, radius = 6000;
    for (const walls of [replaced, moved]) visibility.computeVisibility(origin, radius, walls, undefined, 'sight');
    replaced.splice(0, replaced.length, ...replaced.map((w, i): WallSegment => (i % 3 ? w : wall(w.p2, { x: w.p2.x + 300, y: w.p2.y - 200 }))));
    moved.forEach((w, i) => { if (i % 3 === 0) { w.p2.x += 150; w.p2.y -= 90; } });
    for (const walls of [replaced, moved]) expect(firstDifference(visibility.computeVisibility(origin, radius, walls, undefined, 'sight'), full.computeVisibility(origin, radius, walls, undefined, 'sight'))).not.toBeNull();
  });

  it('when repeated angles are written once', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/rayPlan')>('../../src/app/vision/rayPlan', (actual) => ({
      rayPlan: (...args) => { const plan = actual.rayPlan(...args); plan.counts.fill(1); return plan; },
    }));
    expect(failing(visibility, rooms())).toBeGreaterThanOrEqual(15);
    expect(failing(visibility, chains())).toBeGreaterThanOrEqual(15);
  });

  it('when the cone\'s outline index lists edges without slack and never falls back', async () => {
    const visibility = await sweepWith<typeof import('../../src/app/vision/outlineIndex')>('../../src/app/vision/outlineIndex', () => ({ indexOutline: looseOutlineIndex }));
    expect(failing(visibility, seeds.map(conesTrial))).toBeGreaterThanOrEqual(3);
  });
});
