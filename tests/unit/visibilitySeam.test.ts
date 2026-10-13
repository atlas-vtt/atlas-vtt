// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { computeVisibility } from '../../src/app/vision/visibility';
import * as full from '../oracles/visibilityBaseline/visibility';
import { firstDifference } from '../helpers/visibilityCompare';
import { culledFromPlan, FULL_RULES, withoutSeam } from '../helpers/literalCulling';
import { referencePlan } from '../helpers/visibilityReference';
import { wall, type VisibilityCall } from '../helpers/visibilityScenes';
import { rowSeam } from '../helpers/visibilityTies';

interface SeamCase {
  name: string;
  walls: readonly WallSegment[];
  calls: VisibilityCall[];
}

const box = (x0: number, y0: number, x1: number, y1: number): WallSegment[] => {
  const c: Point[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  return c.map((p, i) => wall(p, c[(i + 1) % 4]!));
};

const origin = { x: 1000, y: 1000 };
const onRow = { x: 1000, y: 0 };

const CASES: SeamCase[] = [
  {
    name: 'a visible end just past the left of the row, a hidden end just before it and a farther wall',
    walls: [...rowSeam(origin, 2e-6, 2e-6), ...box(0, 0, 2000, 2000)],
    calls: [{ origin, radius: 4000, channel: 'sight' }, { origin, radius: 700, channel: 'light' }],
  },
  {
    name: 'the same with the hidden end on the other side of the visible one',
    walls: [...rowSeam(origin, 6e-6, 3e-6, 80, 900), ...box(0, 0, 2000, 2000)],
    calls: [{ origin, radius: 4000, channel: 'sight' }],
  },
  {
    name: 'hidden ends exactly on the row at +π and −π behind a wall across it',
    walls: [
      wall({ x: 900, y: -50 }, { x: 900, y: 50 }),
      wall({ x: 700, y: 0 }, { x: 650, y: 40 }),
      wall({ x: 600, y: -0 }, { x: 560, y: -40 }),
      wall({ x: 300, y: -200 }, { x: 300, y: 200 }),
      ...box(-500, -800, 2500, 800),
    ],
    calls: [{ origin: onRow, radius: 4000, channel: 'sight' }, { origin: onRow, radius: 650 }],
  },
  ...[1000, 5000].map((distance): SeamCase => {
    const at = { x: 4000 + distance, y: 1000 };
    return {
      name: `a sealing bridge that lands a hair off the row, seen from ${distance} px`,
      walls: sealedWalls([wall({ x: 4000, y: 900 }, { x: 4000, y: 1100 }), wall({ x: 3000, y: 1000.01 }, { x: 3995, y: 1000.01 }), wall({ x: 2000, y: 700 }, { x: 2000, y: 1300 }), ...box(1000, 0, 10000, 2000)], 2),
      calls: [{ origin: at, radius: 12000, channel: 'sight' }, { origin: at, radius: distance + 100, channel: 'light' }],
    };
  }),
];

describe('the culled sweep at the left of the origin\'s row', () => {
  it.each(CASES)('keeps the corners at the left of the origin\'s row: $name', ({ walls, calls }) => {
    for (const { origin: o, radius, channel } of calls) {
      expect(firstDifference(computeVisibility(o, radius, walls, undefined, channel), full.computeVisibility(o, radius, walls, undefined, channel))).toBeNull();
    }
  });

  it.each(CASES)('the reference rules keep them too: $name', ({ walls, calls }) => {
    for (const call of calls) {
      const plan = referencePlan(call, walls)!;
      expect(firstDifference(culledFromPlan(plan, FULL_RULES), plan.polygon)).toBeNull();
    }
  });

  it('would move a corner if hidden corners were rebuilt across the seam', () => {
    const [main, other] = CASES;
    for (const { walls, calls } of [main!, other!]) {
      const plan = referencePlan(calls[0]!, walls)!;
      expect(plan.gaps.some((gap) => gap.verdict === 'seam')).toBe(true);
      expect(firstDifference(withoutSeam(plan), plan.polygon)).not.toBeNull();
    }
  });
});
