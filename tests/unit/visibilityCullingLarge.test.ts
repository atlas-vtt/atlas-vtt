// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Tally } from '../helpers/visibilityCompare';
import { gridMapTrial } from '../helpers/visibilityMaps';
import { checkTrial, sweepTimeout, trialSeeds } from '../helpers/visibilityTrials';

const FILE = 'tests/unit/visibilityCullingLarge.test.ts';

describe('the culled sweep on large maps', { timeout: sweepTimeout(1_200_000) }, () => {
  it('keeps every corner on grid maps of up to 20,000 walls, square and turned', () => {
    const tally = new Tally();
    for (const seed of trialSeeds('grid maps', 12)) {
      const trial = gridMapTrial(seed, seed > 12 ? 6 : 1);
      checkTrial(trial, FILE);
      tally.add('trials');
      tally.add('walls', trial.walls.length);
      if (trial.walls.length >= 15000) tally.add('maps of 15,000 walls or more');
    }
    console.info(`grid maps: ${tally.line()}`);
    expect(tally.get('maps of 15,000 walls or more')).toBeGreaterThanOrEqual(Math.min(2, Math.floor(tally.get('trials') / 6)));
  });
});
