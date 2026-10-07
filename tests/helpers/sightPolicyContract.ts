import { isDeepStrictEqual } from 'node:util';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { withZones } from '../../src/app/lighting/lightZones';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { SceneSpots, type SceneModel } from '../../src/app/vision/sceneModel';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { seenSpots } from '../../src/app/vision/perception';
import { selectSight } from '../../src/app/vision/selectSight';
import { NO_SIGHT, computeSight, lightReach, sightSources, type LightReach, type Sight } from '../../src/app/vision/sight';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import { PerceptionMemo, tokenPerception } from '../../src/app/vision/tokenPerception';
import { GM_SIGHT_POLICY, PLAYER_SIGHT_POLICY, visionOn, type SightPolicy } from '../../src/app/vision/tokenSightPolicy';
import { tableSight } from '../oracles/sightPolicyBaseline/tableSight';
import { NO_SIGHT as FROZEN_NO_SIGHT } from '../oracles/sightPolicyBaseline/sight';
import { gmSightSource, tableSightSource } from '../oracles/sightPolicyBaseline/tokenSightPolicy';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { sightScene } from './sightScenes';

/**
 * The promises of the sight policies, each a list of what is broken (empty when it holds), so
 * that a test can require it empty and a control can show it is not.
 */

const SCALE = { unitDistance: 5, cellSize: 50 };
const BOUNDS = { width: 1000, height: 1000 };
const DARK = { ambient: 0 };
const MEASUREMENT = resolveMeasurementSettings(undefined, null);

const at = (id: string, x: number, y: number, extra: Pick<TokenEntity, 'vision' | 'isHidden'> = {}): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, x, y, ...extra });

/** Tokens of every kind the scenes make, and a token whose vision switch is no boolean, as a hand-edited file may hold it. */
function sampleTokens(): TokenEntity[] {
  const odd: TokenEntity = JSON.parse('{"id":"odd","kind":"token","imagePath":"odd.png","x":0,"y":0,"vision":{"enabled":"yes"}}');
  return [odd, ...Array.from({ length: 60 }, (_, i) => Object.values(sightScene(i + 1).state.objects.tokens)).flat()];
}

export function policyValueProblems(): string[] {
  const problems: string[] = [];
  for (const token of sampleTokens()) {
    const name = `${token.id} (hidden ${String(token.isHidden)}, vision ${String(token.vision?.enabled)})`;
    if (PLAYER_SIGHT_POLICY.givesSight(token) !== tableSightSource(token)) problems.push(`${name}: the players' sight differs from before`);
    if (PLAYER_SIGHT_POLICY.alwaysSeen(token) !== tableSightSource(token)) problems.push(`${name}: the players' always-shown rule differs from before`);
    if (GM_SIGHT_POLICY.givesSight(token) !== gmSightSource(token)) problems.push(`${name}: the GM's sight differs from before`);
    if (PLAYER_SIGHT_POLICY.givesSight(token) && !GM_SIGHT_POLICY.givesSight(token)) problems.push(`${name}: gives the players sight but not the GM`);
    if (token.isHidden && (PLAYER_SIGHT_POLICY.givesSight(token) || PLAYER_SIGHT_POLICY.alwaysSeen(token) || GM_SIGHT_POLICY.alwaysSeen(token))) problems.push(`${name}: hidden, yet seen through or always shown`);
    for (const policy of [PLAYER_SIGHT_POLICY, GM_SIGHT_POLICY]) if (policy.givesSight(token) && !visionOn(token)) problems.push(`${name}: gives sight without vision on`);
  }
  if (!Object.isFrozen(PLAYER_SIGHT_POLICY) || !Object.isFrozen(GM_SIGHT_POLICY)) problems.push('a policy can be changed');
  return problems;
}

/** The GM's view draws the players' footprints while both pictures have the same sight, so both always show the same tokens. */
export function footprintCouplingProblems(): string[] {
  return GM_SIGHT_POLICY.alwaysSeen === PLAYER_SIGHT_POLICY.alwaysSeen ? [] : ['the GM\'s always-shown rule is not the players\' own'];
}

/**
 * A picture that always shows `chosen`, a token without vision, and lets only `giver` give sight
 * (and `off`, whose vision is off, which no policy can make a source). `party` sees but is neither.
 */
const TEST_POLICY: SightPolicy = Object.freeze({
  givesSight: (token: TokenEntity): boolean => token.id === 'giver' || token.id === 'off',
  alwaysSeen: (token: TokenEntity): boolean => token.id === 'chosen',
});

function testTokens(): Record<string, TokenEntity> {
  return {
    giver: at('giver', 100, 100, { vision: { enabled: true, range: 10 } }),
    chosen: at('chosen', 300, 100),
    party: at('party', 600, 600, { vision: { enabled: true, range: 10 } }),
    off: at('off', 700, 100, { vision: { enabled: false, range: 10 } }),
  };
}

const sightOf = (tokens: Record<string, TokenEntity>, policy?: SightPolicy): Sight =>
  computeSight(sightSources(tokens, SCALE, BOUNDS, GENERIC_SIGHT_RULES, policy), []);

export function sourceDecisionProblems(): string[] {
  const ids = sightSources(testTokens(), SCALE, BOUNDS, GENERIC_SIGHT_RULES, TEST_POLICY).map((source) => source.tokenId);
  return isDeepStrictEqual(ids, ['giver']) ? [] : [`sources ${ids.join(', ')}, expected only the token the policy lets give sight`];
}

export function perceptionDecisionProblems(): string[] {
  const problems: string[] = [];
  const tokens = testTokens();
  const sight = sightOf(tokens, TEST_POLICY);
  const perceived = tokenPerception(sight, DARK, [], tokens, { policy: TEST_POLICY });
  if (perceived('chosen') !== 'seen') problems.push(`the always-shown token is ${perceived('chosen')} in the dark`);
  if (perceived('party') !== 'unseen') problems.push(`a vision token the policy does not show is ${perceived('party')} in the dark`);
  const held = { chosen: { x: 300, y: 100 } };
  const near = tokenPerception(sight, DARK, [], { ...tokens, chosen: { ...tokens.chosen!, x: 150 } }, { policy: TEST_POLICY, held });
  const far = tokenPerception(sight, DARK, [], { ...tokens, chosen: { ...tokens.chosen!, x: 900, y: 900 } }, { policy: TEST_POLICY, held });
  if (near('chosen') !== 'seen') problems.push('the always-shown token, held within the sight left behind, is not seen');
  if (far('chosen') !== 'unseen') problems.push('the always-shown token, held beyond the sight left behind, is seen');
  return problems;
}

export function footprintDecisionProblems(): string[] {
  const tokens = testTokens();
  const spots = seenSpots(sightOf(tokens, TEST_POLICY), DARK, [], tokens, SCALE.cellSize, [], { policy: TEST_POLICY });
  const places = spots.map(({ x, y }) => [x, y]);
  return isDeepStrictEqual(places, [[300, 100]]) ? [] : [`footprints at ${JSON.stringify(places)}, expected only the always-shown token's`];
}

export function sceneSpotsDecisionProblems(): string[] {
  const tokens = testTokens();
  const base = createViewAtlasStore(createInMemoryApp().app, 'sight-policy-contract').getState();
  const state: ViewAtlasState = { ...base, objects: { ...base.objects, tokens }, lighting: { enabled: true, ambient: 0 } };
  const sight = sightOf(tokens, TEST_POLICY);
  const model: SceneModel = { walls: [], lights: [], reaches: [], sight, explored: null, zones: [], ambient: state.lighting };
  const { cellSize } = unitScaleOf(MEASUREMENT, state.grid);
  const expected = seenSpots(sight, withZones(state.lighting, []), [], tokens, cellSize, [], { conditions: [], held: {}, policy: TEST_POLICY });
  const ours = new SceneSpots(TEST_POLICY).update(model, state, () => MEASUREMENT);
  const players = new SceneSpots().update(model, state, () => MEASUREMENT);
  const problems: string[] = [];
  if (!isDeepStrictEqual(ours, expected)) problems.push('a scene\'s footprints do not follow the policy they were made with');
  if (isDeepStrictEqual(ours, players)) problems.push('a scene\'s footprints are the players\' whatever the policy');
  return problems;
}

export function selectionDecisionProblems(): string[] {
  const problems: string[] = [];
  const tokens = testTokens();
  const both = sightOf(tokens, PLAYER_SIGHT_POLICY);
  const selected = selectSight(both, tokens, TEST_POLICY);
  const sourceIds = [...new Set(selected.regions.map((region) => region.tokenId))];
  if (!isDeepStrictEqual(sourceIds, ['giver'])) problems.push(`selected regions of ${sourceIds.join(', ')}, expected only the giving token's`);
  if (selectSight(selected, tokens, TEST_POLICY) !== selected) problems.push('a selection that drops nothing is not its input');
  const partyOnly = sightOf({ party: tokens.party! }, PLAYER_SIGHT_POLICY);
  if (selectSight(partyOnly, tokens, TEST_POLICY) !== NO_SIGHT) problems.push('a selection that drops everything is not the empty sight');
  return problems;
}

/** A torch that counts how often the light at a token is worked out: once for each answer that is not remembered. */
function countingLight(): { lights: LightReach[]; reads: () => number } {
  let reads = 0;
  const torch = lightReach({ x: 150, y: 150 }, 400, []);
  return { lights: [{ ...torch, get dim(): number { reads++; return 400; } }], reads: () => reads };
}

export function memoProblems(): string[] {
  const problems: string[] = [];
  const tokens: Record<string, TokenEntity> = { hero: at('hero', 100, 100, { vision: { enabled: true } }), guard: at('guard', 150, 150), lurker: at('lurker', 400, 100) };
  const sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], []);
  const { lights, reads } = countingLight();
  const memo = new PerceptionMemo();
  const conditions: [] = [];
  const ask = (policy?: SightPolicy): void => {
    const perceived = tokenPerception(sight, DARK, lights, tokens, { conditions, ...(policy && { policy }) }, memo);
    for (const id of Object.keys(tokens)) perceived(id);
  };
  ask();
  const first = reads();
  ask();
  if (reads() !== first) problems.push('the same inputs worked everything out again');
  ask(PLAYER_SIGHT_POLICY);
  if (reads() !== first) problems.push('no policy and the players\' policy did not share their answers');
  ask(TEST_POLICY);
  if (reads() === first) problems.push('another policy reused the answers of the players\'');
  return problems;
}

/** A record that keeps a vision token under a key other than its id, as a hand-edited map may: selected as before. */
export function misfiledSelectionProblems(): string[] {
  const problems: string[] = [];
  const stray = at('stray', 100, 100, { vision: { enabled: true, range: 10 } });
  for (const [name, tokens] of [
    ['no vision token hidden', { kept: stray }],
    ['a vision token hidden', { kept: stray, hidden: at('hidden', 500, 500, { isHidden: true, vision: { enabled: true, range: 10 } }) }],
  ] as const) {
    const gm = sightOf(tokens, GM_SIGHT_POLICY);
    const ours = selectSight(gm, tokens, PLAYER_SIGHT_POLICY);
    const before = tableSight(gm, tokens);
    if (!isDeepStrictEqual(ours, before)) problems.push(`${name}: the players' regions differ from before`);
    if ((ours === gm) !== (before === gm) || (ours === NO_SIGHT) !== (before === FROZEN_NO_SIGHT)) problems.push(`${name}: the selection's identity differs from before`);
    const keepsStray = ours.regions.some((region) => region.tokenId === 'stray');
    if (name === 'no vision token hidden' && (ours !== gm || !keepsStray)) problems.push(`${name}: the sight is not returned as it is, with the misfiled token's region`);
    if (name === 'a vision token hidden' && keepsStray) problems.push(`${name}: the misfiled token's region is kept`);
  }
  return problems;
}
