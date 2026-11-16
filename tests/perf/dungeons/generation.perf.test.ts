import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonRequest } from '../../../src/app/dungeons/model';
import { timeBound } from '../../helpers/timeBound';
import { caveRequests, houseRequests, invariantRequests } from '../../unit/dungeons/invariantRequests';

/**
 * How long the generator takes, on the dungeons the invariants hold the rules over. Budgets measured
 * beside a whole parallel suite tripped on the load and passed alone, so they run here, one file at a
 * time on one worker (`npm run test:perf`), and nowhere else.
 */

/** Milliseconds each request takes, after a few untimed runs that let the engine compile the generator. */
function timesOf(requests: readonly DungeonRequest[]): number[] {
  for (const request of requests.slice(0, 3)) generateDungeon(request);
  return requests.map((request) => {
    const start = performance.now();
    generateDungeon(request);
    return performance.now() - start;
  });
}

const p95 = (times: readonly number[]): number => [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)] ?? 0;
const mean = (times: readonly number[]): number => times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);

/** The first hundred seeds of the invariants: two hundred dungeons, a hundred of each theme. */
const BUDGET_SEEDS = 100;

describe('the generator’s time budget', () => {
  it.each([1, 2, 3, 4])('keeps the 95th percentile of %i-floor dungeons within budget', (floors) => {
    const requests = invariantRequests(floors, BUDGET_SEEDS);
    const times = timesOf(requests);
    const of = (cavern: boolean): number[] => times.filter((_, i) => (requests[i]!.theme === 'cavern') === cavern);
    expect(p95(of(false))).toBeLessThan(timeBound(25 * floors));
    // A cave also shapes its chambers and tunnels, and grows a floor anew until its main path fits two cells
    // wide and its mouths open on the map's edge (about 10 attempts a floor): 79 ms at the 95th percentile of
    // one-floor caves on an M4 Pro (2026-10-31), under a tenth of a second in the wizard.
    expect(p95(of(true))).toBeLessThan(timeBound(90 * floors));
  });

  it.each([1, 2, 3])('makes a %i-floor cave at little more than a Fortress of the same seed costs', (floors) => {
    const requests = caveRequests(floors, false, 50);
    const cave = mean(timesOf(requests));
    const fortress = mean(timesOf(requests.map((request) => ({ ...request, theme: 'fortress' }))));
    const ratio = cave / fortress;
    console.log(`cave generation ${floors} floor(s): ${cave.toFixed(1)} ms against ${fortress.toFixed(1)} ms for a Fortress (${ratio.toFixed(2)}×)`);
    if (import.meta.env.VITE_PERF_STRICT === '1') expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it('makes a Haunted Mansion of four floors quickly', () => {
    // The 75 four-floor houses among the house rules' 300 seeds.
    const times = timesOf(houseRequests(300).filter((request) => request.floors === 4));
    expect(p95(times)).toBeLessThan(120);
  });

  it('lays the terrain of the largest chambers in a moment', () => {
    // These took 6.8 s and 4.7 s while every free cell was tried with a flood fill of its own.
    for (const seed of [285_084, 324_679]) {
      const start = performance.now();
      generateDungeon({ seed, theme: 'cavern', tags: [], floors: 1 });
      expect(performance.now() - start, `seed ${seed}`).toBeLessThan(1_500);
    }
  });
});
