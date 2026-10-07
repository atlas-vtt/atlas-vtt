// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { firstDifference, Tally } from '../helpers/visibilityCompare';
import { literalCulling, withoutEdgeOn, withoutTies } from '../helpers/literalCulling';
import { referencePlan, type ReferencePlan } from '../helpers/visibilityReference';
import { chainsTrial, conesTrial, corridorsTrial, limitedTrial, roomsTrial, shortReachTrial, wallKindsTrial, type VisibilityTrial } from '../helpers/visibilityScenes';
import { TIE_KINDS, tiesTrial } from '../helpers/visibilityTies';
import { checkLimitedTrial, checkTrial, floor, sweepTimeout, TALLIED_TRIALS, trialSeeds } from '../helpers/visibilityTrials';
import { cellSidesTrial, stopsBeforeTheWallInFront } from '../helpers/visibilityCellSides';

const FILE = 'tests/unit/visibilityCulling.test.ts';

/** Runs a family's trials, counting the first ones against the reference rules. */
function run(family: string, make: (seed: number) => VisibilityTrial, trials: number, also?: Tally): Tally {
  const tally = new Tally();
  trialSeeds(family, trials).forEach((seed, i) => checkTrial(make(seed), FILE, i < TALLIED_TRIALS ? tally : undefined));
  console.info(`${family}: ${tally.line()}`);
  also?.merge(tally);
  return tally;
}

/** Trials of the families where runs and every reason to cast again must turn up together. */
const together = new Tally();

describe('the culled sweep keeps every corner the full sweep draws', { timeout: sweepTimeout(600_000) }, () => {
  it('in rooms with hand-drawn joints, T-junctions, doors and one-way walls', () => {
    const tally = run('rooms', roomsTrial, 20, together);
    floor(tally, 'hidden ends', 7000);
    floor(tally, 'cast values', 1400);
    floor(tally, 'repeated values', 6000);
    floor(tally, 'passing runs', 600);
    floor(tally, 'rebuilt corners', 10000);
    floor(tally, 'runs with ties', 20);
    floor(tally, 'cast again (two walls)', 70);
    floor(tally, 'cast again (seam)', 9);
    floor(tally, 'cast again (radius)', 0.1);
  });

  it('on random chains of walls', () => {
    const tally = run('chains', (seed) => chainsTrial(seed), 12, together);
    floor(tally, 'hidden ends', 8900);
    floor(tally, 'cast values', 690);
    floor(tally, 'repeated values', 9800);
    floor(tally, 'passing runs', 260);
    floor(tally, 'rebuilt corners', 13000);
    floor(tally, 'runs with ties', 7);
    floor(tally, 'cast again (two walls)', 28);
    floor(tally, 'cast again (seam)', 2.5);
  });

  it('on random chains of about five thousand walls', () => {
    const tally = run('large chains', (seed) => chainsTrial(seed + 1000, 3800), 2);
    floor(tally, 'hidden ends', 45000);
    floor(tally, 'passing runs', 250);
    floor(tally, 'rebuilt corners', 64000);
  });

  it('with doors, one-way walls and walls that block one thing', () => {
    const tally = run('wall kinds', wallKindsTrial, 20);
    floor(tally, 'hidden ends', 6600);
    floor(tally, 'passing runs', 700);
    floor(tally, 'rebuilt corners', 10000);
    floor(tally, 'runs with ties', 26);
    floor(tally, 'cast again (two walls)', 83);
    floor(tally, 'cast again (seam)', 10);
  });

  it('along corridors of short pieces, seen from beside their walls', () => {
    const tally = run('corridors', corridorsTrial, 20);
    floor(tally, 'hidden ends', 1500);
    floor(tally, 'passing runs', 180);
    floor(tally, 'rebuilt corners', 1750);
    floor(tally, 'cast again (edge-on)', 43);
    floor(tally, 'runs with ties', 11);
    floor(tally, 'cast again (two walls)', 20);
    floor(tally, 'cast again (seam)', 2);
    floor(tally, 'cast again (radius)', 5);
  });

  it('through cones and beams, with and without an apex', () => {
    const tally = run('cones', conesTrial, 20);
    floor(tally, 'outline fallbacks', 3);
    floor(tally, 'passing runs', 440);
    floor(tally, 'rebuilt corners', 6900);
    floor(tally, 'runs with ties', 17);
    floor(tally, 'cast again (edge-on)', 64);
  });

  it('with radii that end where walls cross the circle', () => {
    const tally = run('short reach', shortReachTrial, 20, together);
    floor(tally, 'passing runs', 85);
    floor(tally, 'runs with ties', 3.8);
    floor(tally, 'cast again (radius)', 0.6);
    floor(tally, 'cast again (two walls)', 9.8);
    floor(tally, 'cast again (seam)', 1.2);
  });

  it('meets runs and every reason to cast again in rooms, chains and short reach together', () => {
    for (const name of ['passing runs', 'cast again (two walls)', 'cast again (radius)', 'cast again (seam)']) floor(together, name, 0.2);
  });

  it('with duplicate, overlapping and degenerate walls, and ends at the left of the origin\'s row', () => {
    const tally = new Tally();
    trialSeeds('ties', 20).forEach((seed, i) => {
      const trial = tiesTrial(seed);
      checkTrial(trial, FILE, i < TALLIED_TRIALS ? tally : undefined);
      if (i < TALLIED_TRIALS) trial.kinds.forEach((kind) => tally.add(kind));
    });
    console.info(`ties: ${tally.line()}`);
    floor(tally, 'cast again (seam)', 1.6);
    floor(tally, 'runs with ties', 25);
    floor(tally, 'cast again (edge-on)', 80);
    for (const kind of TIE_KINDS) floor(tally, kind, kind === 'beside the row' || kind === 'on the row' ? 0.25 : 0.5);
  });

  it('where a wall seen almost edge-on begins just past the side of a grid cell', () => {
    const tally = new Tally();
    for (const seed of trialSeeds('cell sides', 300)) {
      const trial = cellSidesTrial(seed);
      if (stopsBeforeTheWallInFront(trial)) tally.add('stops on the edge-on wall before the wall in front');
      tally.add('trials');
      checkTrial(trial, FILE);
    }
    console.info(`cell sides: ${tally.line()}`);
    floor(tally, 'stops on the edge-on wall before the wall in front', 0.03);
  });

  it('with limited walls in reach, which keep the full sweep', () => {
    const tally = new Tally();
    trialSeeds('limited walls', 10).forEach((seed) => checkLimitedTrial(limitedTrial(seed), FILE, tally));
    console.info(`limited walls: ${tally.line()}`);
    floor(tally, 'limited in reach', 10);
  });
});

/** How many of `trials` hold a call where `sweep` misses a corner of the full sweep. */
function trialsCaught(trials: VisibilityTrial[], sweep: (plan: ReferencePlan) => { x: number; y: number }[]): number {
  return trials.filter((trial) => trial.calls.some((call) => {
    const plan = referencePlan({ ...call, cone: undefined }, trial.walls);
    return plan !== null && firstDifference(sweep(plan), plan.polygon) !== null;
  })).length;
}

describe('the equivalence checks have the power to tell', { timeout: 600_000 }, () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

  it('a sweep that drops the corners of hidden wall ends', () => {
    expect(trialsCaught(seeds.map(roomsTrial), literalCulling)).toBeGreaterThanOrEqual(15);
    expect(trialsCaught(seeds.map((seed) => chainsTrial(seed)), literalCulling)).toBeGreaterThanOrEqual(15);
  });

  it('a sweep that rebuilds hidden corners from one wall alone', () => {
    expect(trialsCaught(seeds.map(tiesTrial), withoutTies)).toBeGreaterThanOrEqual(9);
  });

  it('a sweep that rebuilds hidden corners where a wall is seen edge-on', () => {
    expect(trialsCaught([corridorsTrial(26)], withoutEdgeOn)).toBe(1);
  });
});
