// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility } from '../../src/app/vision/visibility';
import type { VisionCone } from '../../src/app/vision/visionCone';
import * as full from '../oracles/visibilityBaseline/visibility';
import { firstDifference } from '../helpers/visibilityCompare';
import { placedTrial, wall, type VisibilityTrial } from '../helpers/visibilityScenes';
import { cellSidesTrial } from '../helpers/visibilityCellSides';
import { tiesTrial } from '../helpers/visibilityTies';

const corners: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const room: WallSegment[] = [...corners.map((p, i) => wall(p, corners[(i + 1) % 4]!)), wall({ x: 40, y: 30 }, { x: 60, y: 30 })];

function sameAsFullSweep(origin: Point, radius: number, walls: readonly WallSegment[], cone?: VisionCone): void {
  expect(firstDifference(computeVisibility(origin, radius, walls, cone), full.computeVisibility(origin, radius, walls, cone))).toBeNull();
}

// Each of these once made the sweep walk its grid forever.
describe('the culled sweep with numbers that cannot be placed', () => {
  it.each([
    ['no number', { x: Number.NaN, y: 50 }],
    ['endless', { x: 50, y: Number.POSITIVE_INFINITY }],
    ['far beyond any map', { x: 1e300, y: 50 }],
  ])('keeps the full sweep\'s corners from a place that is %s', (_, origin) => {
    sameAsFullSweep(origin, 500, room);
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY, -1, 1e300])('keeps the full sweep\'s corners for a radius of %s', (radius) => {
    sameAsFullSweep({ x: 50, y: 50 }, radius, room);
  });

  it('keeps the full sweep\'s corners where walls lie too far out for a grid', () => {
    sameAsFullSweep({ x: 5, y: 5 }, 500, [wall({ x: -1e308, y: 0 }, { x: 1e308, y: 0 }), wall({ x: 0, y: -10 }, { x: 0, y: 10 })]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e300, 1e6 + 0.3, -7.5])('clips to a cone facing %s as the full sweep does', (facing) => {
    for (const apex of [0, 10]) sameAsFullSweep({ x: 50, y: 50 }, 500, room, { facing, angle: 1, apex });
  });
});

/** How many calls of `trials` the sweep answers otherwise than the full sweep. */
function differing(trials: VisibilityTrial[]): number {
  return trials.flatMap((trial) => trial.calls.filter(({ origin, radius, cone, channel }) =>
    firstDifference(computeVisibility(origin, radius, trial.walls, cone, channel), full.computeVisibility(origin, radius, trial.walls, cone, channel)) !== null)).length;
}

// Far from zero the numbers a place can take lie nearly as far apart as a grid's cells reach past
// their walls, and a ray's rounding grows with its length: a grid's answers are sure only near a map.
describe('the culled sweep far from any map', { timeout: 600_000 }, () => {
  const ties = Array.from({ length: 12 }, (_, i) => tiesTrial(i + 1));
  const cellSides = Array.from({ length: 300 }, (_, i) => cellSidesTrial(i + 1));

  it('keeps the full sweep\'s corners on walls a hundred billion times as large as a map\'s', () => {
    expect(differing(ties.map((trial) => placedTrial(trial, 0, 0, 1e11)))).toBe(0);
  });

  it('keeps the full sweep\'s corners on walls nearly as far from zero as a number is still whole', () => {
    expect(differing(cellSides.map((trial) => placedTrial(trial, 9e14, 3.33e14)))).toBe(0);
  });

  it('keeps the full sweep\'s corners up to the farthest place a grid holds', () => {
    expect(differing([...ties, ...cellSides].map((trial) => placedTrial(trial, 990_000, -990_000)))).toBe(0);
    expect(differing(ties.map((trial) => placedTrial(trial, 0, 0, 300)))).toBe(0);
  });
});
