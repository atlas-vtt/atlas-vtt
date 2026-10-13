import { describe, expect, it } from 'vitest';
import { hiddenSightMismatches } from '../helpers/hiddenSightCompare';
import type { SceneMismatch } from '../helpers/sightPolicyCompare';
import { sceneTrials, seedBlocks, sightScene } from '../helpers/sightScenes';
import { MISFILED_TRAITS, SCENE_TRAITS, TraitTally, sceneTraits } from '../helpers/sightSceneTraits';

const TRIALS = sceneTrials();
const tally = new TraitTally();
const blocks = seedBlocks(TRIALS, 25).map((seeds) => ({ first: seeds[0]!, last: seeds[seeds.length - 1]!, seeds }));

describe('player view compared with the rules before hidden tokens stopped giving sight', () => {
  it.each(blocks)('scenes $first to $last differ only where hidden tokens are concerned', ({ seeds }) => {
    const mismatches: SceneMismatch[] = [];
    for (const seed of seeds) {
      const scene = sightScene(seed);
      if (scene.malformed) {
        tally.skip();
        continue;
      }
      tally.add(sceneTraits(scene));
      mismatches.push(...hiddenSightMismatches(scene));
    }
    expect(mismatches).toEqual([]);
  });

  it('runs every scene and every kind of well-formed scene often enough', () => {
    expect(tally.floorProblems(TRIALS, SCENE_TRAITS.filter((trait) => !MISFILED_TRAITS.includes(trait)))).toEqual([]);
  });
});
