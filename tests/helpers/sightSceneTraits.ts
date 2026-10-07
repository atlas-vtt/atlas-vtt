import { isDeepStrictEqual } from 'node:util';
import { SightTokens, heldForSight, movedWhileHeld } from '../../src/app/lighting/sightOnDrop';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import type { TokenEntity } from '../../src/app/types';
import { sourcesInDarkness } from '../../src/app/vision/magicalDarkness';
import { tokenPerception } from '../oracles/sightPolicyBaseline/playerLightingLayers';
import { SceneModelBuilder, SceneSpots } from '../oracles/sightPolicyBaseline/sceneModel';
import { sightSources } from '../oracles/sightPolicyBaseline/sight';
import { gmSightSource } from '../oracles/sightPolicyBaseline/tokenSightPolicy';
import { SceneModelBuilder as EarlierBuilder } from '../oracles/tableSightBaseline/sceneModel';
import { tokenPerception as earlierPerception } from '../oracles/tableSightBaseline/playerLightingLayers';
import type { SightScene } from './sightScenes';

/** What a scene exercises, read from the frozen rules' own outputs. */
export const SCENE_TRAITS = [
  'hidden and visible vision tokens',
  'every vision token hidden',
  'no vision token',
  'token vision off',
  'a footprint in the player view',
  'GM footprints differ from the players\'',
  'a sensed token',
  'a source still pending',
  'a blinded source',
  'a held token moved with sight on drop',
  'a source in magical darkness',
  'a vision cone',
  'a hidden token without vision perceived before hidden tokens stopped counting, no hidden vision token',
  'a hidden token without vision perceived before hidden tokens stopped counting, with a hidden vision token',
  'a region whose token is filed under another key, no vision token hidden',
  'a region whose token is filed under another key, a vision token hidden',
] as const;

export type SceneTrait = typeof SCENE_TRAITS[number];

/** The traits that need a token filed under another key; scenes of well-formed records never show them. */
export const MISFILED_TRAITS: readonly SceneTrait[] = SCENE_TRAITS.slice(-2);

/** The traits of one scene. */
export function sceneTraits({ state, bounds, rules, measurement }: SightScene): Set<SceneTrait> {
  const traits = new Set<SceneTrait>();
  const note = (trait: SceneTrait, holds: boolean): void => { if (holds) traits.add(trait); };
  const tokens = state.objects.tokens;
  const seeing = Object.values(tokens).filter((token) => token.vision?.enabled);
  const hiddenVision = seeing.some((token) => token.isHidden);
  note('hidden and visible vision tokens', hiddenVision && seeing.some((token) => !token.isHidden));
  note('every vision token hidden', seeing.length > 0 && !seeing.some((token) => !token.isHidden));
  note('no vision token', seeing.length === 0);
  note('token vision off', state.lighting.tokenVision === false);

  const sightTokens = new SightTokens().read(state);
  const rulesOf = (): typeof rules => rules;
  const model = new SceneModelBuilder().update(state, bounds, measurement, rulesOf).model;
  const spots = new SceneSpots().update(model, state, measurement, rulesOf);
  const gmSight = model.gmSight ?? model.sight;
  const gmSpots = gmSight === model.sight ? spots : new SceneSpots().update(model, state, measurement, rulesOf, gmSight);
  note('a footprint in the player view', spots.length > 0);
  note('GM footprints differ from the players\'', !isDeepStrictEqual(spots, gmSpots));
  const held = heldForSight(state);
  const options = { conditions: rules.conditions, held };
  const perceived = tokenPerception(model.sight, model.ambient, model.reaches, tokens, options);
  note('a sensed token', Object.keys(tokens).some((key) => perceived(key) === 'sensed'));
  const tokenVision = state.lighting.tokenVision !== false;
  note('a source still pending', tokenVision && Object.values(sightTokens).some((token) => token.vision?.enabled && rules.visionOf?.(token).pending));
  const raw = sightSources(sightTokens, unitScaleOf(measurement(), state.grid), bounds, rules, gmSightSource);
  note('a blinded source', tokenVision && raw.some((source) => source.blinded));
  note('a held token moved with sight on drop', Object.values(tokens).some((token) => movedWhileHeld(token, held)));
  note('a source in magical darkness', tokenVision && sourcesInDarkness(raw, model.ambient, model.reaches).some((source, i) => source !== raw[i]));
  note('a vision cone', tokenVision && raw.some((source) => source.cone));

  const earlier = new EarlierBuilder().update(state, bounds, measurement, rulesOf).model;
  const earlierTargets = earlierPerception(earlier.sight, earlier.ambient, earlier.reaches, tokens, options);
  const perceivedHidden = Object.entries(tokens).some(([key, token]: [string, TokenEntity]) => token.isHidden && !token.vision?.enabled && earlierTargets(key) !== 'unseen');
  note('a hidden token without vision perceived before hidden tokens stopped counting, no hidden vision token', perceivedHidden && !hiddenVision);
  note('a hidden token without vision perceived before hidden tokens stopped counting, with a hidden vision token', perceivedHidden && hiddenVision);

  const misfiled = !gmSight.all && gmSight.regions.some((region) => sightTokens[region.tokenId] === undefined);
  note('a region whose token is filed under another key, no vision token hidden', misfiled && !hiddenVision);
  note('a region whose token is filed under another key, a vision token hidden', misfiled && hiddenVision);
  return traits;
}

/** Counts of each trait over a run, filled block by block. */
export class TraitTally {
  readonly counts = new Map<SceneTrait, number>(SCENE_TRAITS.map((trait) => [trait, 0]));
  scenes = 0;

  add(traits: ReadonlySet<SceneTrait>): void {
    this.scenes++;
    for (const trait of traits) this.counts.set(trait, this.counts.get(trait)! + 1);
  }

  /** A scene the run passed over on purpose still counts towards the run's length. */
  skip(): void {
    this.scenes++;
  }

  /** Each named trait in at least one scene in twenty of `trials`, and every scene of the run counted. */
  floorProblems(trials: number, traits: readonly SceneTrait[]): string[] {
    const floor = Math.ceil(trials * 0.05);
    const problems = this.scenes === trials ? [] : [`counted ${this.scenes} scenes, expected ${trials}`];
    for (const trait of traits) {
      const count = this.counts.get(trait)!;
      if (count < floor) problems.push(`${trait}: ${count} scenes, at least ${floor} needed`);
    }
    return problems;
  }
}
