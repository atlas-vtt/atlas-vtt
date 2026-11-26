import { describe, expect, it } from 'vitest';
import { sharedSight } from '../../src/app/online/gm/sceneInputs.ts';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import { defeatTest, defeatedResources, restedResources } from '../../src/app/resources/resourceValues';
import type { TokenEntity } from '../../src/app/types';
import { perceptionOptions, seenSpots } from '../../src/app/vision/perception';
import { SceneModelBuilder, SceneSpots, type SceneState } from '../../src/app/vision/sceneModel';
import { NO_SIGHT, computeSight, sightSources } from '../../src/app/vision/sight';
import { GENERIC_SIGHT_RULES, sameSightRules, type SightRules } from '../../src/app/vision/sightRules';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { GM_SIGHT_POLICY, PLAYER_SIGHT_POLICY, sceneHasVision, sightPolicyFor } from '../../src/app/vision/tokenSightPolicy';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { sceneState } from './online/gm/shareHarness.ts';

const RESOURCES = [{ ...HP_RESOURCE }, { ...STRESS_RESOURCE }];
const RULES: SightRules = { ...GENERIC_SIGHT_RULES, defeated: defeatTest(RESOURCES)! };
const SCALE = { unitDistance: 5, cellSize: 50 };
const BOUNDS = { width: 1000, height: 1000 };
const DARK = { ambient: 0 };
const MEASUREMENT = resolveMeasurementSettings(undefined, null);

function hero(id: string, x: number, extra: Partial<TokenEntity> = {}): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, x, y: 500, vision: { enabled: true }, resources: { hp: { current: 10, max: 10 } }, ...extra };
}

const killed = (token: TokenEntity): TokenEntity => ({ ...token, resources: defeatedResources(token, RESOURCES) });
const revived = (token: TokenEntity): TokenEntity => ({ ...token, resources: restedResources(token, RESOURCES) });

describe('a defeated token under dynamic lighting', () => {
  it('gives no sight, to the players or the GM, and sees again once revived', () => {
    const dead = killed(hero('dead', 200));
    const tokens = { dead, alive: hero('alive', 800) };
    for (const policy of [PLAYER_SIGHT_POLICY, GM_SIGHT_POLICY]) {
      expect(sightSources(tokens, SCALE, BOUNDS, RULES, policy).map((source) => source.tokenId)).toEqual(['alive']);
    }
    // Without the rules' test (a map whose resources defeat no token) it sees as before.
    expect(sightSources(tokens, SCALE, BOUNDS, GENERIC_SIGHT_RULES).map((source) => source.tokenId)).toEqual(['dead', 'alive']);
    expect(sightSources({ dead: revived(dead) }, SCALE, BOUNDS, RULES).map((source) => source.tokenId)).toEqual(['dead']);
  });

  it('leaves a party whose every vision token is defeated seeing nothing, not everything', () => {
    const tokens = { dead: killed(hero('dead', 200)) };
    expect(sceneHasVision(tokens)).toBe(true);
    expect(computeSight(sightSources(tokens, SCALE, BOUNDS, RULES), [], undefined, sceneHasVision(tokens))).toBe(NO_SIGHT);
  });

  it('has no footprint and is seen only where another token perceives it', () => {
    const dead = killed(hero('dead', 200));
    const tokens = { dead };
    const sight = computeSight([], [], undefined, true);
    expect(seenSpots(sight, DARK, [], tokens, SCALE.cellSize, [], perceptionOptions(RULES, {}))).toEqual([]);
    expect(tokenPerception(sight, DARK, [], tokens, perceptionOptions(RULES, {}))('dead')).toBe('unseen');
    // Alive, the party token is shown within its footprint in the dark.
    const alive = { dead: revived(dead) };
    expect(seenSpots(sight, DARK, [], alive, SCALE.cellSize, [], perceptionOptions(RULES, {}))).toHaveLength(1);
    expect(tokenPerception(sight, DARK, [], alive, perceptionOptions(RULES, {}))('dead')).toBe('seen');
  });

  it('is rebuilt when it is killed and revived', () => {
    const state = (token: TokenEntity): SceneState => ({
      objects: { tokens: { [token.id]: token }, walls: {}, lights: {} },
      lighting: { enabled: true, ambient: 1 },
      grid: { enabled: true, size: 50, offsetX: 0, offsetY: 0, opacity: 1 },
      heldTokens: {},
    });
    const builder = new SceneModelBuilder();
    const spots = new SceneSpots();
    const rules = (): SightRules => RULES;
    const measurement = (): typeof MEASUREMENT => MEASUREMENT;
    const alive = hero('pc', 500);
    const before = builder.update(state(alive), BOUNDS, measurement, rules).model;
    expect(before.sight.regions.map((region) => region.tokenId)).toEqual(['pc']);
    expect(before.explored).not.toBeNull();

    const dead = state(killed(alive));
    const after = builder.update(dead, BOUNDS, measurement, rules);
    expect(after.rebuilt).toBe(true);
    expect(after.model.sight).toBe(NO_SIGHT);
    expect(after.model.explored).toBeNull();
    expect(spots.update(after.model, dead, measurement, rules)).toEqual([]);

    const back = builder.update(state(revived(killed(alive))), BOUNDS, measurement, rules).model;
    expect(back.sight.regions.map((region) => region.tokenId)).toEqual(['pc']);
  });
});

describe('the rules that decide defeat', () => {
  it('keep one test for resources that defeat alike, and none where nothing defeats', () => {
    expect(defeatTest([{ ...HP_RESOURCE }])).toBe(defeatTest([{ ...HP_RESOURCE, color: '#000000' }, { ...STRESS_RESOURCE }]));
    expect(defeatTest([{ ...HP_RESOURCE }])).not.toBe(defeatTest([{ ...HP_RESOURCE, direction: 'fills' }]));
    expect(defeatTest([{ ...STRESS_RESOURCE }])).toBeUndefined();
  });

  it('differ for sight when a resource starts or stops defeating tokens', () => {
    expect(sameSightRules(RULES, { ...RULES, defeated: defeatTest(RESOURCES)! })).toBe(true);
    expect(sameSightRules(RULES, GENERIC_SIGHT_RULES)).toBe(false);
  });

  it('keep each policy one object, and the GM\'s and players\' always-shown rule one function', () => {
    const player = sightPolicyFor(PLAYER_SIGHT_POLICY, RULES);
    const gm = sightPolicyFor(GM_SIGHT_POLICY, RULES);
    expect(sightPolicyFor(PLAYER_SIGHT_POLICY, RULES)).toBe(player);
    expect(gm.alwaysSeen).toBe(player.alwaysSeen);
    expect(sightPolicyFor(PLAYER_SIGHT_POLICY, GENERIC_SIGHT_RULES)).toBe(PLAYER_SIGHT_POLICY);
    expect(Object.isFrozen(player)).toBe(true);
  });
});

describe('online play', () => {
  it('sends a defeated token without vision, and the players see nothing when it was their only eyes', () => {
    const state = sceneState({ objects: { ...sceneState().objects, tokens: { dead: killed(hero('dead', 200)) } } });
    const sight = sharedSight({ state, rules: RULES, shown: new Set(['dead']), tokenAlias: (id) => id, lightAlias: (id) => id });
    expect(sight.tokens).toHaveLength(1);
    expect(sight.tokens[0]).not.toHaveProperty('vision');
    expect(sight.blind).toBe(true);
    const alive = sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(['dead']), tokenAlias: (id) => id, lightAlias: (id) => id });
    expect(alive.tokens[0]).toHaveProperty('vision');
    expect(alive.blind).toBeUndefined();
  });
});
