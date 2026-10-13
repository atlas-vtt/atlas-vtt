import { format, isDeepStrictEqual } from 'node:util';
import { tokenVisionOn } from '../../src/app/lighting/sceneLightingOptions';
import { withZones } from '../../src/app/lighting/lightZones';
import { SightTokens, heldForSight } from '../../src/app/lighting/sightOnDrop';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { pierceShapes } from '../../src/app/pixi/lighting/engine/senseDrawing';
import type { TokenEntity } from '../../src/app/types';
import { doorsInSight } from '../../src/app/vision/doorSight';
import { exploredShapes } from '../../src/app/vision/exploredShapes';
import { sourcesInDarkness } from '../../src/app/vision/magicalDarkness';
import type { Perception, SeenSpot } from '../../src/app/vision/perception';
import type { Sight } from '../../src/app/vision/sight';
import { seenSpots as earlierSeenSpots } from '../oracles/tableSightBaseline/perception';
import { tokenPerception as earlierPerception } from '../oracles/tableSightBaseline/playerLightingLayers';
import { SceneModelBuilder as EarlierBuilder, SceneSpots as EarlierSpots } from '../oracles/tableSightBaseline/sceneModel';
import { sceneSight as earlierSceneSight, sightSources as earlierSources } from '../oracles/tableSightBaseline/sight';
import type { SceneMismatch } from './sightPolicyCompare';
import { current } from './sightPolicyCurrent';
import { sightScene, type SightScene } from './sightScenes';

/**
 * What the player view is compared with:
 * - `amended`: the rules from before hidden tokens stopped counting, run on the scene without its hidden tokens;
 * - `verbatim`: those rules on the whole scene, as they were;
 * - `without-target-change`: amended, except that every token is still a target, hidden ones too.
 */
export type HiddenReference = 'amended' | 'verbatim' | 'without-target-change';

const show = (value: unknown): string => format('%O', value).slice(0, 600);

const visibleOnly = (tokens: Record<string, TokenEntity>): Record<string, TokenEntity> =>
  Object.fromEntries(Object.entries(tokens).filter(([, token]) => !token.isHidden));

const NOTHING: Sight = { all: false, regions: [] };

interface PlayersPicture {
  sight: Sight;
  explored: unknown;
  spots: SeenSpot[];
  targets: Perception[];
  pierce: unknown;
  doors: ReadonlySet<string>;
}

/**
 * How today's GM view and player view differ from the rules before hidden tokens stopped counting.
 * Only these three differences are allowed, each named and asserted: a hidden vision token gives
 * the players no sight or memory; every vision token hidden gives no sight; a hidden token is never
 * seen by the players, with or without vision. Scenes whose records are not keyed by token id are
 * not compared here: the comparison with the previous version holds them.
 */
export function hiddenSightMismatches(scene: SightScene, reference: HiddenReference = 'amended'): SceneMismatch[] {
  const found: SceneMismatch[] = [];
  const differ = (output: string, ours: unknown, theirs: unknown): void => {
    if (!isDeepStrictEqual(ours, theirs)) found.push({ seed: scene.seed, output, detail: `now ${show(ours)} | expected ${show(theirs)}` });
  };
  const fail = (output: string, detail: string): void => { found.push({ seed: scene.seed, output, detail }); };
  const { state, bounds, rules, measurement } = scene;
  const rulesOf = (): typeof rules => rules;
  const tokens = state.objects.tokens;
  const ids = Object.keys(tokens);
  const options = { conditions: rules.conditions, held: heldForSight(state) };

  // Today's pictures, composed as the lighting renderer composes them.
  const model = current.builder().update(state, bounds, measurement, rulesOf).model;
  const gmSight = model.gmSight ?? model.sight;
  const spots = current.spots('players').update(model, state, measurement, rulesOf);
  const gmSpots = gmSight === model.sight ? spots : current.spots('GM').update(model, state, measurement, rulesOf, gmSight);
  const today: PlayersPicture = {
    sight: model.sight,
    explored: model.explored,
    spots,
    targets: ids.map(current.perception(model.sight, model.ambient, model.reaches, tokens, options)),
    pierce: pierceShapes(model.sight, spots),
    doors: doorsInSight(model.walls, model.sight, model.ambient, model.reaches),
  };

  // The GM's outputs: the earlier rules on the whole scene, unchanged.
  const earlier = new EarlierBuilder().update(state, bounds, measurement, rulesOf).model;
  differ('GM sight', gmSight, earlier.sight);
  differ('GM footprints', gmSpots, new EarlierSpots().update(earlier, state, measurement, rulesOf));
  for (const field of ['walls', 'lights', 'reaches', 'zones', 'ambient'] as const) differ(`scene ${field}`, model[field], earlier[field]);

  const expected = playersReference(scene, earlier, reference);
  for (const part of Object.keys(expected) as (keyof PlayersPicture)[]) differ(`player view: ${part}`, today[part], expected[part]);

  // The three differences, named.
  const seeing = Object.values(new SightTokens().read(state)).filter((token) => token.vision?.enabled);
  const hidden = new Set(Object.values(tokens).filter((token) => token.isHidden).map((token) => token.id));
  if (seeing.some((token) => token.isHidden) && !model.sight.all && model.sight.regions.some((region) => hidden.has(region.tokenId))) {
    fail('a hidden vision token gives the players no sight or memory', show(model.sight.regions.map((region) => region.tokenId)));
  }
  if (tokenVisionOn(state.lighting) && seeing.length > 0 && seeing.every((token) => token.isHidden) && !isDeepStrictEqual(model.sight, NOTHING)) {
    fail('every vision token hidden gives no sight', show(model.sight));
  }
  ids.forEach((id, i) => {
    if (tokens[id]!.isHidden && today.targets[i] !== 'unseen') fail('a hidden token is never seen by the players, with or without vision', `${id}: ${today.targets[i]}`);
  });
  return found;
}

/** What the players' picture would be by the earlier rules, as `reference` reads them. */
function playersReference({ state, bounds, rules, measurement }: SightScene, earlier: ReturnType<EarlierBuilder['update']>['model'], reference: HiddenReference): PlayersPicture {
  const tokens = state.objects.tokens;
  const ids = Object.keys(tokens);
  const scale = unitScaleOf(measurement(), state.grid);
  const options = { conditions: rules.conditions, held: heldForSight(state) };
  if (reference === 'verbatim') {
    const spots = new EarlierSpots().update(earlier, state, measurement, () => rules);
    return {
      sight: earlier.sight,
      explored: earlier.explored,
      spots,
      targets: ids.map(earlierPerception(earlier.sight, earlier.ambient, earlier.reaches, tokens, options)),
      pierce: pierceShapes(earlier.sight, spots),
      doors: doorsInSight(earlier.walls, earlier.sight, earlier.ambient, earlier.reaches),
    };
  }
  // Sight and light read the tokens with held ones where their drag began; hidden carriers keep their light.
  const sightTokens = new SightTokens().read(state);
  const sources = sourcesInDarkness(earlierSources(visibleOnly(sightTokens), scale, bounds, rules), earlier.ambient, earlier.reaches);
  let sight = earlierSceneSight(state.lighting, sources, earlier.walls);
  const seeing = Object.values(sightTokens).filter((token) => token.vision?.enabled);
  if (tokenVisionOn(state.lighting) && seeing.length > 0 && seeing.every((token) => token.isHidden) && sight.all) sight = NOTHING;
  const targetsFrom = reference === 'without-target-change' ? tokens : visibleOnly(tokens);
  const spots = earlierSeenSpots(sight, withZones(state.lighting, earlier.ambient.zones ?? []), earlier.reaches, visibleOnly(tokens), scale.cellSize, earlier.walls, options);
  return {
    sight,
    explored: exploredShapes(sight, earlier.ambient, earlier.reaches),
    spots,
    targets: ids.map(earlierPerception(sight, earlier.ambient, earlier.reaches, targetsFrom, options)),
    pierce: pierceShapes(sight, spots),
    doors: doorsInSight(earlier.walls, sight, earlier.ambient, earlier.reaches),
  };
}

/** The first well-formed scene of the default run, among those `accept` takes, that differs from `reference`. */
export function firstHiddenSightMismatch(reference: HiddenReference, accept: (scene: SightScene) => boolean = () => true, trials = 300): SceneMismatch | null {
  for (let seed = 1; seed <= trials; seed++) {
    const scene = sightScene(seed);
    if (scene.malformed || !accept(scene)) continue;
    const [first] = hiddenSightMismatches(scene, reference);
    if (first) return first;
  }
  return null;
}
