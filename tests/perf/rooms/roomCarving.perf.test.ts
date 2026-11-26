import { beforeAll, describe, expect, it } from 'vitest';
import { carvedWalls } from '../../../src/app/lighting/wallCarving';
import { floorOf } from '../../../src/app/lighting/wallSpaces';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { brushStroke, cave, rectangle, seeded } from '../../helpers/carvedCaves';
import { timeBound } from '../../helpers/timeBound';

const SIZE = 3500;

/** The middle of five runs, in milliseconds. */
function middle(run: () => unknown): number {
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return times[2]!;
}

/**
 * What an edit in the rooms mode costs on a cave carved with the brush: 3,500 walls, a map a
 * contributor reported 3 to 4 seconds per edit on. Before edits looked only at what is near them,
 * a carve here took 1,300 ms and telling floor from rock 2,500 ms; now about 10 and 120.
 * Run alone (`npm run test:perf`).
 */
describe('an edit of a cave of 3,500 walls', () => {
  let walls: WallSegment[] = [];
  beforeAll(() => {
    walls = cave(7, 3500, SIZE, carvedWalls, floorOf);
  }, 300_000);

  it('carves a brush stroke in under 60 ms', () => {
    const random = seeded(99);
    const [floors, stroke] = [floorOf(walls), brushStroke(random, SIZE)];
    expect(middle(() => carvedWalls(stroke, walls, floors, 'c'))).toBeLessThan(timeBound(60));
  });

  it('carves a rectangle over a quarter of the map in under 60 ms', () => {
    const random = seeded(3);
    const [floors, area] = [floorOf(walls), rectangle(random, SIZE, 1500, 1800)];
    expect(middle(() => carvedWalls(area, walls, floors, 'c'))).toBeLessThan(timeBound(60));
  });

  it('tells floor from rock in under 500 ms', () => {
    expect(walls.length).toBeGreaterThanOrEqual(3500);
    // A new array each time, as after an edit: nothing kept for the last one helps.
    expect(middle(() => floorOf([...walls]))).toBeLessThan(timeBound(500));
  });
});
