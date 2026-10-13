import { format, isDeepStrictEqual } from 'node:util';
import { vi } from 'vitest';
import { SightTokens, heldForSight } from '../../src/app/lighting/sightOnDrop';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { darkLooks, pierceShapes } from '../../src/app/pixi/lighting/engine/senseDrawing';
import { sightMarks } from '../../src/app/pixi/lighting/sightMarks';
import type { TokenEntity } from '../../src/app/types';
import { doorsInSight } from '../../src/app/vision/doorSight';
import { exploredShapes } from '../../src/app/vision/exploredShapes';
import type { PerceptionOptions, SeenSpot } from '../../src/app/vision/perception';
import type { Sight } from '../../src/app/vision/sight';
import { current, type Picture } from './sightPolicyCurrent';
import * as frozen from './sightPolicyFrozen';
import { sightScene, type SightScene } from './sightScenes';

/** One output of a scene where the code under test differs from the frozen rules. */
export interface SceneMismatch {
  seed: number;
  output: string;
  detail: string;
}

type Outcome<T> = { value: T } | { error: string };

/** What a call gave, or the error it threw: the code under test must throw where the frozen rules throw. */
function outcome<T>(run: () => T): Outcome<T> {
  try {
    return { value: run() };
  } catch (error) {
    return { error: String(error) };
  }
}

const show = (value: unknown): string => format('%O', value).slice(0, 600);

interface Built {
  model: frozen.Model;
  rebuilt: boolean;
  again: { same: boolean; rebuilt: boolean };
  retained: ReadonlySet<string>[][];
}

/** Builds a scene twice from the same state, noting every set of ids the sight cache keeps. */
function buildTwice(builder: { update: frozen.Update }, cache: { prototype: { retain: (ids: ReadonlySet<string>) => void } }, scene: SightScene, perUpdate: ReadonlySet<string>[][]): Built {
  const spy = vi.spyOn(cache.prototype, 'retain');
  try {
    const update = (): ReturnType<frozen.Update> => {
      spy.mockClear();
      const result = builder.update(scene.state, scene.bounds, scene.measurement, () => scene.rules);
      perUpdate.push(spy.mock.calls.map(([ids]) => new Set(ids)));
      return result;
    };
    const first = update();
    const second = update();
    return { model: first.model, rebuilt: first.rebuilt, again: { same: second.model === first.model, rebuilt: second.rebuilt }, retained: perUpdate };
  } finally {
    spy.mockRestore();
  }
}

/** How a sight relates to the constants and to its sibling: the identities the drawing code relies on. */
function relations(sight: Sight, other: Sight, constants: { none: Sight; all: Sight }): Record<string, boolean> {
  return { sibling: sight === other, none: sight === constants.none, all: sight === constants.all };
}

/** The footprints of both pictures composed as the lighting renderer composes them, twice. */
function composeSpots(model: frozen.Model, make: (picture: Picture) => frozen.Spots, scene: SightScene): { spots: SeenSpot[]; gmSpots: SeenSpot[]; shared: boolean; kept: boolean } {
  const players = make('players');
  const gm = make('GM');
  const run = (): { spots: SeenSpot[]; gmSpots: SeenSpot[] } => {
    const spots = players.update(model, scene.state, scene.measurement, () => scene.rules);
    const gmSight = model.gmSight ?? model.sight;
    return { spots, gmSpots: gmSight === model.sight ? spots : gm.update(model, scene.state, scene.measurement, () => scene.rules, gmSight) };
  };
  const first = run();
  const second = run();
  return { ...first, shared: first.gmSpots === first.spots, kept: second.spots === first.spots && second.gmSpots === first.gmSpots };
}

/** Every token's id, every record key and one id no token has. */
function askedIds(tokens: Record<string, TokenEntity>): string[] {
  const ids = new Set([...Object.keys(tokens), 'no-such-token']);
  for (const token of Object.values(tokens)) if (typeof token.id === 'string') ids.add(token.id);
  return [...ids];
}

/**
 * Every output the sight rules give for one scene, worked out by the code under test and by the
 * frozen rules, compared deeply (region order included) and by the identities callers rely on.
 */
export function sightPolicyMismatches(scene: SightScene): SceneMismatch[] {
  const found: SceneMismatch[] = [];
  const differ = (output: string, ours: unknown, theirs: unknown): void => {
    if (!isDeepStrictEqual(ours, theirs)) found.push({ seed: scene.seed, output, detail: `now ${show(ours)} | before ${show(theirs)}` });
  };
  const { state, bounds, rules, measurement } = scene;
  const scale = unitScaleOf(measurement(), state.grid);
  const sightTokens = new SightTokens().read(state);
  const options: PerceptionOptions = { conditions: rules.conditions, held: heldForSight(state) };

  for (const picture of ['players', 'GM'] as const) {
    differ(`sources of the ${picture} picture`, outcome(() => current.sources(sightTokens, scale, bounds, rules, picture)), outcome(() => frozen.sources(sightTokens, scale, bounds, rules, picture)));
  }
  const retainedNow: ReadonlySet<string>[][] = [];
  const retainedBefore: ReadonlySet<string>[][] = [];
  const now = outcome(() => buildTwice(current.builder(), current.SightCache, scene, retainedNow));
  const before = outcome(() => buildTwice(frozen.builder(), frozen.SightCache, scene, retainedBefore));
  if (!('value' in now) || !('value' in before)) {
    differ('scene model', now, before);
    return found;
  }
  const ours = now.value.model;
  const theirs = before.value.model;
  differ('scene model fields', Object.keys(ours).sort(), Object.keys(theirs).sort());
  for (const field of Object.keys(theirs) as (keyof frozen.Model)[]) differ(`scene model ${field}`, ours[field], theirs[field]);
  const gmNow = ours.gmSight ?? ours.sight;
  const gmBefore = theirs.gmSight ?? theirs.sight;
  differ('player sight identity', relations(ours.sight, gmNow, current), relations(theirs.sight, gmBefore, frozen));
  differ('GM sight identity', relations(gmNow, ours.sight, current), relations(gmBefore, theirs.sight, frozen));
  differ('rebuilds', [now.value.rebuilt, now.value.again], [before.value.rebuilt, before.value.again]);
  differ('sight cache retains', retainedNow, retainedBefore);

  for (const [record, tokens] of [['sight tokens', sightTokens], ['store tokens', state.objects.tokens]] as const) {
    const selectedNow = outcome(() => current.select(gmNow, tokens));
    const selectedBefore = outcome(() => frozen.select(gmBefore, tokens));
    differ(`player selection from ${record}`, selectedNow, selectedBefore);
    if ('value' in selectedNow && 'value' in selectedBefore) {
      differ(`player selection identity from ${record}`, { input: selectedNow.value === gmNow, ...relations(selectedNow.value, ours.sight, current) },
        { input: selectedBefore.value === gmBefore, ...relations(selectedBefore.value, theirs.sight, frozen) });
    }
  }

  const spotsNow = composeSpots(ours, current.spots, scene);
  const spotsBefore = composeSpots(theirs, frozen.spots, scene);
  differ('footprints of both pictures', spotsNow, spotsBefore);

  const tokens = state.objects.tokens;
  const ids = askedIds(tokens);
  for (const [name, sightNow, sightBefore] of [['player', ours.sight, theirs.sight], ['GM', gmNow, gmBefore]] as const) {
    for (const picture of ['players', 'GM'] as const) {
      differ(`footprints in ${name} sight for the ${picture} picture`,
        outcome(() => current.seenSpots(sightNow, ours.ambient, ours.reaches, tokens, scale.cellSize, ours.walls, options, picture)),
        outcome(() => frozen.seenSpots(sightBefore, theirs.ambient, theirs.reaches, tokens, scale.cellSize, theirs.walls, options)));
    }
    const perceivedBefore = frozen.perception(sightBefore, theirs.ambient, theirs.reaches, tokens, options);
    const answersBefore = ids.map(perceivedBefore);
    for (const picture of [undefined, 'players', 'GM'] as const) {
      differ(`perception in ${name} sight (${picture ?? 'default'})`, ids.map(current.perception(sightNow, ours.ambient, ours.reaches, tokens, options, picture)), answersBefore);
    }
    const memoNow = current.memo();
    const memoBefore = frozen.memo();
    for (const call of [1, 2]) {
      differ(`remembered perception in ${name} sight, call ${call}`,
        ids.map(current.perception(sightNow, ours.ambient, ours.reaches, tokens, options, undefined, memoNow)),
        ids.map(frozen.perception(sightBefore, theirs.ambient, theirs.reaches, tokens, options, memoBefore)));
    }
    differ(`sight marks in ${name} sight`, sightMarks(tokens, current.perception(sightNow, ours.ambient, ours.reaches, tokens, options), scale.cellSize), sightMarks(tokens, perceivedBefore, scale.cellSize));
    differ(`doors in ${name} sight`, doorsInSight(ours.walls, sightNow, ours.ambient, ours.reaches), doorsInSight(theirs.walls, sightBefore, theirs.ambient, theirs.reaches));
    differ(`explored shapes of ${name} sight`, exploredShapes(sightNow, ours.ambient, ours.reaches), exploredShapes(sightBefore, theirs.ambient, theirs.reaches));
    const spots = name === 'player' ? [spotsNow.spots, spotsBefore.spots] : [spotsNow.gmSpots, spotsBefore.gmSpots];
    differ(`pierce shapes of ${name} sight`, pierceShapes(sightNow, spots[0]), pierceShapes(sightBefore, spots[1]));
    differ(`dark looks of ${name} sight`, darkLooks(sightNow, spots[0]!.length > 0, state.lighting), darkLooks(sightBefore, spots[1]!.length > 0, state.lighting));
  }
  return found;
}

/** The first scene of the default run, among those `accept` takes, where the code under test differs; null when none does. */
export function firstSightPolicyMismatch(accept: (scene: SightScene) => boolean = () => true, trials = 300): SceneMismatch | null {
  for (let seed = 1; seed <= trials; seed++) {
    const scene = sightScene(seed);
    if (!accept(scene)) continue;
    const [first] = sightPolicyMismatches(scene);
    if (first) return first;
  }
  return null;
}
