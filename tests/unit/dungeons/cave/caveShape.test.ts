import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { axisShare, chambersOf, passageProfiles, rectangleFill, straightRuns } from './caveShapeMetrics';

/**
 * A cavern seen from above reads as a natural cave, not as rounded rooms joined by corridors: its
 * walls bend every couple of cells, its chambers are not rectangles, and its passages swell and
 * pinch and wander off the grid's axes. Each bound is set from caves of the first organic round
 * (rounded rectangles, the "before" of 2026-10-24), which fail it, and from these, which pass.
 */

const TAG_SETS: readonly string[][] = [[], ['small'], ['large'], ['lava', 'deep'], ['wet', 'winding'], ['medium', 'wet'], ['cramped', 'compact']];
const HEAVY = 300_000;

function caves(): DungeonModel[] {
  return Array.from({ length: 70 }, (_, k) => generateDungeon({ seed: 977 * (k + 1), tags: TAG_SETS[k % TAG_SETS.length]!, floors: 1 + (k % 2), theme: 'cavern' }));
}

const share = (xs: readonly number[], test: (x: number) => boolean): number => xs.filter(test).length / xs.length;
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe('a cavern from above', () => {
  const models = caves();
  const floors = models.flatMap((model) => model.floors.map((_, index) => ({ model, index })));

  it('runs no wall straight for long: little of it in straight stretches past two cells, none past five and a half', () => {
    const runs = floors.map(({ model, index }) => straightRuns(model, index));
    const all = runs.flat();
    const total = all.reduce((sum, run) => sum + run, 0);
    const straight = all.filter((run) => run > 2).reduce((sum, run) => sum + run, 0) / total;
    const longest = runs.map((floor) => Math.max(0, ...floor));
    console.log(`walls in straight runs over 2 cells: ${(100 * straight).toFixed(1)} %, longest per floor: median ${median(longest).toFixed(1)}, most ${Math.max(...longest).toFixed(1)} cells`);
    // The first round: 9 % of the walls, the longest run over 6 cells. What is left past four cells
    // lies along a chain of narrows a winding cave's main path runs straight through.
    expect(straight).toBeLessThan(0.04);
    expect(Math.max(...longest)).toBeLessThanOrEqual(5.5);
    expect(median(longest)).toBeLessThan(2.8);
  }, HEAVY);

  it('shapes chambers that are no rectangles: most fill well under their bounding rectangle, few nearly all of it', () => {
    const fills = models.flatMap(chambersOf).map(rectangleFill);
    console.log(`chambers' share of their bounding rectangle: median ${median(fills).toFixed(2)}, ${(100 * share(fills, (f) => f > 0.9)).toFixed(0)} % over 0.9`);
    // The first round: a median of 0.80, a quarter of the chambers over 0.9.
    expect(median(fills)).toBeLessThan(0.74);
    expect(share(fills, (f) => f > 0.9)).toBeLessThan(0.12);
  }, HEAVY);

  it('swells and pinches its passages, and leads few of them along a grid axis', () => {
    const passages = floors.flatMap(({ model, index }) => passageProfiles(model, index)).filter((p) => p.widths.length >= 6);
    const ranges = passages.map((p) => Math.max(...p.widths) - Math.min(...p.widths));
    const axial = passages.map((p) => axisShare(p.centre));
    console.log(`${passages.length} passages: ${(100 * share(ranges, (r) => r >= 1)).toFixed(0)} % vary a cell or more in width, ${(100 * share(axial, (a) => a > 0.5)).toFixed(0)} % run mostly along an axis`);
    expect(share(ranges, (r) => r >= 1)).toBeGreaterThan(0.85);
    expect(share(axial, (a) => a > 0.5)).toBeLessThan(0.27);
  }, HEAVY);
});
