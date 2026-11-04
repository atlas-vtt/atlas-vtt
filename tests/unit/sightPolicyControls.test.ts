import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as PerceptionModule from '../../src/app/vision/perception';
import type * as SceneModelModule from '../../src/app/vision/sceneModel';
import type * as SelectModule from '../../src/app/vision/selectSight';
import type * as SightModule from '../../src/app/vision/sight';
import type * as TokenPerceptionModule from '../../src/app/vision/tokenPerception';
import type * as PolicyModule from '../../src/app/vision/tokenSightPolicy';
import type { TokenEntity } from '../../src/app/types';
import type { SightScene } from '../helpers/sightScenes';
import type { SceneTrait } from '../helpers/sightSceneTraits';

/**
 * Each test breaks one rule of the code under test, by swapping its module, and requires the
 * comparisons or the contract to notice. None of them reads the trial count: they stop at the
 * first difference within the default run.
 */

const POLICY = '../../src/app/vision/tokenSightPolicy';
const SELECT = '../../src/app/vision/selectSight';
const SIGHT = '../../src/app/vision/sight';
const FOOTPRINTS = '../../src/app/vision/perception';
const PERCEPTION = '../../src/app/vision/tokenPerception';
const SCENE = '../../src/app/vision/sceneModel';
const MOCKED = [POLICY, SELECT, SIGHT, FOOTPRINTS, PERCEPTION, SCENE];

afterEach(() => {
  for (const path of MOCKED) vi.doUnmock(path);
  vi.resetModules();
});

const compare = (): Promise<typeof import('../helpers/sightPolicyCompare')> => import('../helpers/sightPolicyCompare');
const hidden = (): Promise<typeof import('../helpers/hiddenSightCompare')> => import('../helpers/hiddenSightCompare');
const contract = (): Promise<typeof import('../helpers/sightPolicyContract')> => import('../helpers/sightPolicyContract');

/** Scenes that show `trait`. */
async function showing(trait: SceneTrait): Promise<(scene: SightScene) => boolean> {
  const { sceneTraits } = await import('../helpers/sightSceneTraits');
  return (scene) => sceneTraits(scene).has(trait);
}

/** Options without a policy: what a rule that ignored it would see. */
function withoutPolicy<T extends { policy?: unknown }>(options: T): Omit<T, 'policy'> {
  const { policy: _ignored, ...rest } = options;
  return rest;
}

function mockPolicy(change: (actual: typeof PolicyModule) => Partial<typeof PolicyModule>): void {
  vi.resetModules();
  vi.doMock(POLICY, async (importOriginal) => {
    const actual = await importOriginal<typeof PolicyModule>();
    return { ...actual, ...change(actual) };
  });
}

describe('the sight comparisons and the policy contract notice broken rules', () => {
  it('fails when the players\' always-shown rule ignores vision', async () => {
    mockPolicy((actual) => ({ PLAYER_SIGHT_POLICY: Object.freeze({ ...actual.PLAYER_SIGHT_POLICY, alwaysSeen: (token: TokenEntity) => !token.isHidden }) }));
    expect((await compare()).firstSightPolicyMismatch()).not.toBeNull();
    expect((await hidden()).firstHiddenSightMismatch('amended')).not.toBeNull();
  });

  it.each(['hidden and visible vision tokens', 'every vision token hidden'] as const)('fails against the rules before hidden tokens stopped giving sight, taken as they were, with %s', async (trait) => {
    expect((await hidden()).firstHiddenSightMismatch('verbatim', await showing(trait))).not.toBeNull();
  });

  it('fails when hidden tokens without vision are still taken as targets', async () => {
    const trait = 'a hidden token without vision perceived before hidden tokens stopped counting, no hidden vision token';
    expect((await hidden()).firstHiddenSightMismatch('without-target-change', await showing(trait))).not.toBeNull();
  });

  it('fails when hidden tokens give the players sight', async () => {
    mockPolicy((actual) => ({ PLAYER_SIGHT_POLICY: Object.freeze({ ...actual.PLAYER_SIGHT_POLICY, givesSight: actual.visionOn }) }));
    expect((await compare()).firstSightPolicyMismatch()).not.toBeNull();
  });

  it('fails when the GM\'s sight leaves hidden tokens out', async () => {
    mockPolicy((actual) => ({ GM_SIGHT_POLICY: Object.freeze({ ...actual.GM_SIGHT_POLICY, givesSight: (token: TokenEntity) => !token.isHidden && actual.visionOn(token) }) }));
    expect((await compare()).firstSightPolicyMismatch()).not.toBeNull();
  });

  it('fails when the player view keeps a sight whose every region was dropped', async () => {
    vi.doMock(SELECT, async (importOriginal) => {
      const actual = await importOriginal<typeof SelectModule>();
      const { NO_SIGHT } = await import('../../src/app/vision/sight');
      return { ...actual, selectSight: (...args: Parameters<typeof actual.selectSight>) => {
        const selected = actual.selectSight(...args);
        return selected === NO_SIGHT && args[0].regions.length > 0 ? args[0] : selected;
      } };
    });
    expect((await compare()).firstSightPolicyMismatch(await showing('every vision token hidden'))).not.toBeNull();
  });

  it('fails when perception ignores the policy it is given', async () => {
    vi.doMock(PERCEPTION, async (importOriginal) => {
      const actual = await importOriginal<typeof TokenPerceptionModule>();
      return { ...actual, tokenPerception: (...[sight, ambient, lights, tokens, options = {}, memo]: Parameters<typeof actual.tokenPerception>) =>
        actual.tokenPerception(sight, ambient, lights, tokens, withoutPolicy(options), memo) };
    });
    expect((await contract()).perceptionDecisionProblems()).not.toEqual([]);
  });

  it('fails when footprints ignore the policy they are given', async () => {
    vi.doMock(FOOTPRINTS, async (importOriginal) => {
      const actual = await importOriginal<typeof PerceptionModule>();
      return { ...actual, seenSpots: (...[sight, ambient, lights, tokens, cellSize, walls, options = {}]: Parameters<typeof actual.seenSpots>) =>
        actual.seenSpots(sight, ambient, lights, tokens, cellSize, walls, withoutPolicy(options)) };
    });
    expect((await contract()).footprintDecisionProblems()).not.toEqual([]);
  });

  it('fails when remembered perception does not tell policies apart', async () => {
    vi.doMock(PERCEPTION, async (importOriginal) => {
      const actual = await importOriginal<typeof TokenPerceptionModule>();
      class Forgetful extends actual.PerceptionMemo {
        override of(...[sight, ambient, lights, options]: Parameters<TokenPerceptionModule.PerceptionMemo['of']>): ReturnType<TokenPerceptionModule.PerceptionMemo['of']> {
          return super.of(sight, ambient, lights, withoutPolicy(options));
        }
      }
      return { ...actual, PerceptionMemo: Forgetful };
    });
    expect((await contract()).memoProblems()).not.toEqual([]);
  });

  it('fails when sight sources ignore the policy they are given', async () => {
    vi.doMock(SIGHT, async (importOriginal) => {
      const actual = await importOriginal<typeof SightModule>();
      return { ...actual, sightSources: (...[tokens, scale, bounds, rules]: Parameters<typeof actual.sightSources>) => actual.sightSources(tokens, scale, bounds, rules) };
    });
    expect((await compare()).firstSightPolicyMismatch()).not.toBeNull();
  });

  it('fails when a scene\'s footprints ignore the policy they were made with', async () => {
    vi.doMock(SCENE, async (importOriginal) => {
      const actual = await importOriginal<typeof SceneModelModule>();
      class Unfaithful extends actual.SceneSpots {
        constructor() {
          super();
        }
      }
      return { ...actual, SceneSpots: Unfaithful };
    });
    expect((await contract()).sceneSpotsDecisionProblems()).not.toEqual([]);
  });

  it('fails when the GM\'s footprints are a separate rule with the same answers', async () => {
    mockPolicy((actual) => ({ GM_SIGHT_POLICY: Object.freeze({ ...actual.GM_SIGHT_POLICY, alwaysSeen: (token: TokenEntity) => !token.isHidden && actual.visionOn(token) }) }));
    expect((await contract()).footprintCouplingProblems()).not.toEqual([]);
  });

  it('fails when the player view is selected without checking every token first', async () => {
    vi.doMock(SELECT, async (importOriginal) => {
      const actual = await importOriginal<typeof SelectModule>();
      const { NO_SIGHT } = await import('../../src/app/vision/sight');
      return { ...actual, selectSight: (...[sight, tokens, policy]: Parameters<typeof actual.selectSight>) => {
        if (sight.all) return sight;
        const regions = sight.regions.filter((region) => { const token = tokens[region.tokenId]; return token !== undefined && policy.givesSight(token); });
        if (regions.length === sight.regions.length) return sight;
        return regions.length > 0 ? { all: false, regions } : NO_SIGHT;
      } };
    });
    expect((await compare()).firstSightPolicyMismatch(await showing('a region whose token is filed under another key, no vision token hidden'))).not.toBeNull();
    expect((await contract()).misfiledSelectionProblems()).not.toEqual([]);
  });
});
