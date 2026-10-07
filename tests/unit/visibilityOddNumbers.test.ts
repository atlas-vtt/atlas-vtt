// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility } from '../../src/app/vision/visibility';
import type { VisionCone } from '../../src/app/vision/visionCone';
import * as full from '../oracles/visibilityBaseline/visibility';
import { firstDifference } from '../helpers/visibilityCompare';
import { wall } from '../helpers/visibilityScenes';

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
