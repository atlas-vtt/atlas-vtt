import { describe, expect, it } from 'vitest';
import { sightPolicyMismatches, type SceneMismatch } from '../helpers/sightPolicyCompare';
import { sceneTrials, seedBlocks, sightScene } from '../helpers/sightScenes';
import { SCENE_TRAITS, TraitTally, sceneTraits } from '../helpers/sightSceneTraits';

const TRIALS = sceneTrials();
const tally = new TraitTally();
const blocks = seedBlocks(TRIALS, 25).map((seeds) => ({ first: seeds[0]!, last: seeds[seeds.length - 1]!, seeds }));

describe('sight rules compared with their previous versions', () => {
  it.each(blocks)('scenes $first to $last give the same sight, perception, footprints and identities', ({ seeds }) => {
    const mismatches: SceneMismatch[] = [];
    for (const seed of seeds) {
      const scene = sightScene(seed);
      tally.add(sceneTraits(scene));
      mismatches.push(...sightPolicyMismatches(scene));
    }
    expect(mismatches).toEqual([]);
  });

  it('runs every scene and every kind of scene often enough', () => {
    expect(tally.floorProblems(TRIALS, SCENE_TRAITS)).toEqual([]);
  });
});
