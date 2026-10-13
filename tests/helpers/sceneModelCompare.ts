import { format, isDeepStrictEqual } from 'node:util';
import { vi } from 'vitest';
import type { SeenSpot } from '../../src/app/vision/perception';
import { SightCache } from '../../src/app/vision/sight';
import { computeVisibility } from '../../src/app/vision/visibility';
import { current } from './sceneModelCurrent';
import { frozen, type Model, type Subject } from './sceneModelFrozen';
import { sceneSequence, type SceneSequence, type SceneStep } from './sceneModelSteps';

/** One output of one update where the scene model under test differs from the frozen one. */
export interface StepMismatch {
  seed: number;
  /** The update's place in its sequence, 0 for the first build. */
  step: number;
  kind: SceneStep['kind'];
  output: string;
  detail: string;
}

/** Which objects of a model are the ones the update before it gave, and which are each other. */
type Identities = Record<string, boolean | number[]>;

interface Footprints {
  players: SeenSpot[];
  gm: SeenSpot[];
  identities: Identities;
  sweeps: number;
}

/** What one update gave: the model or the error, and everything a caller could tell two builders apart by. */
export interface StepRecord {
  kind: SceneStep['kind'];
  error?: string;
  rebuilt?: boolean;
  model?: Model;
  identities?: Identities;
  /** The id sets the sight cache was told to keep during the update. */
  retained: string[][];
  /** How often a line of sight was swept during the update. */
  sweeps: number;
  footprints?: Footprints;
}

/** The sweep counter: the test file replaces `computeVisibility` by a counting pass-through. */
function sweepCounter(): { mock: { calls: unknown[] } } {
  if (!vi.isMockFunction(computeVisibility)) throw new Error('The comparison counts sweeps: mock vision/visibility with a counting computeVisibility');
  return computeVisibility;
}

/** Where `item` was in `before`, or -1 for a new object. */
const placeIn = <T>(before: readonly T[] | undefined, item: T): number => before?.indexOf(item) ?? -1;

function modelIdentities(model: Model, last: Model | undefined, step: SceneStep): Identities {
  const gm = model.gmSight ?? model.sight;
  const lastGm = last && (last.gmSight ?? last.sight);
  return {
    'the model': model === last,
    'the walls': model.walls === last?.walls,
    'the light list': model.lights === last?.lights,
    'each light': model.lights.map((light) => placeIn(last?.lights, light)),
    'each light\'s area among the reach polygons': model.lights.map((light) => (light.area ? model.reaches.findIndex((reach) => reach.polygon === light.area) : -1)),
    'the reach list': model.reaches === last?.reaches,
    'each reach': model.reaches.map((reach) => placeIn(last?.reaches, reach)),
    'each reach polygon': model.reaches.map((reach) => placeIn(last?.reaches.map((before) => before.polygon), reach.polygon)),
    'the players\' sight': model.sight === last?.sight,
    'the GM\'s sight': model.gmSight === last?.gmSight,
    'each region of the players\' sight': model.sight.regions.map((region) => placeIn(last?.sight.regions, region)),
    'each region of the GM\'s sight': gm.regions.map((region) => placeIn(lastGm?.regions, region)),
    'each region polygon of the GM\'s sight': gm.regions.map((region) => placeIn(lastGm?.regions.map((before) => before.polygon), region.polygon)),
    'the explored shapes': model.explored === last?.explored,
    'the zones': model.zones === last?.zones,
    'the ambient light': model.ambient === last?.ambient,
    'the players\' sight being the GM\'s': model.sight === model.gmSight,
    'the ambient light being the scene\'s lighting': model.ambient === step.state.lighting,
  };
}

/** Runs a sequence through one builder and its two footprint lists, as the lighting renderer calls them. */
export function runSequence(subject: Subject, { steps, bounds, measurement }: SceneSequence): StepRecord[] {
  const sweeps = sweepCounter();
  const retain = vi.spyOn(SightCache.prototype, 'retain');
  const builder = subject.builder();
  const players = subject.spots('players');
  const gm = subject.spots('GM');
  const records: StepRecord[] = [];
  let last: { model: Model; footprints: Footprints } | undefined;
  try {
    for (const step of steps) {
      const rules = (): SceneStep['rules'] => step.rules;
      retain.mockClear();
      const swept = sweeps.mock.calls.length;
      const record: StepRecord = { kind: step.kind, retained: [], sweeps: 0 };
      records.push(record);
      try {
        if (step.reset) builder.reset();
        const { model, rebuilt } = builder.update(step.state, bounds, measurement, rules);
        record.retained = retain.mock.calls.map(([ids]) => [...ids].sort());
        record.sweeps = sweeps.mock.calls.length - swept;
        const before = sweeps.mock.calls.length;
        const spots = players.update(model, step.state, measurement, rules);
        const gmSight = model.gmSight ?? model.sight;
        const gmSpots = gmSight === model.sight ? spots : gm.update(model, step.state, measurement, rules, gmSight);
        const footprints: Footprints = {
          players: spots, gm: gmSpots, sweeps: sweeps.mock.calls.length - before,
          identities: { 'the players\' footprints': spots === last?.footprints.players, 'the GM\'s footprints': gmSpots === last?.footprints.gm, 'the GM\'s footprints being the players\'': gmSpots === spots },
        };
        Object.assign(record, { rebuilt, model, identities: modelIdentities(model, last?.model, step), footprints });
        last = { model, footprints };
      } catch (error) {
        record.error = String(error);
      }
    }
  } finally {
    retain.mockRestore();
  }
  return records;
}

const show = (value: unknown): string => format('%O', value).slice(0, 400);

/** Every difference between two runs of one sequence, named by the output that differs. */
export function runDifferences(sequence: SceneSequence, now: readonly StepRecord[], before: readonly StepRecord[]): StepMismatch[] {
  const found: StepMismatch[] = [];
  now.forEach((ours, step) => {
    const theirs = before[step]!;
    const differ = (output: string, a: unknown, b: unknown): void => {
      if (!isDeepStrictEqual(a, b)) found.push({ seed: sequence.seed, step, kind: ours.kind, output, detail: `now ${show(a)} | before ${show(b)}` });
    };
    differ('error', ours.error, theirs.error);
    differ('rebuilt', ours.rebuilt, theirs.rebuilt);
    differ('sight cache retains', ours.retained, theirs.retained);
    differ('sweeps', ours.sweeps, theirs.sweeps);
    if (!ours.model || !theirs.model) return;
    differ('model fields', Object.keys(ours.model).sort(), Object.keys(theirs.model).sort());
    for (const field of Object.keys(theirs.model) as (keyof Model)[]) differ(`model ${field}`, ours.model[field], theirs.model[field]);
    for (const name of Object.keys(theirs.identities!)) differ(`identity of ${name}`, ours.identities![name], theirs.identities![name]);
    differ('footprints', [ours.footprints!.players, ours.footprints!.gm], [theirs.footprints!.players, theirs.footprints!.gm]);
    differ('footprint sweeps', ours.footprints!.sweeps, theirs.footprints!.sweeps);
    for (const name of Object.keys(theirs.footprints!.identities)) differ(`identity of ${name}`, ours.footprints!.identities[name], theirs.footprints!.identities[name]);
  });
  return found;
}

/** A sequence run by the scene model under test (or `subject`) and by the frozen one, with every difference. */
export function compareSequence(sequence: SceneSequence, subject: Subject = current): { mismatches: StepMismatch[]; before: StepRecord[] } {
  const now = runSequence(subject, sequence);
  const before = runSequence(frozen, sequence);
  return { mismatches: runDifferences(sequence, now, before), before };
}

/** The first difference `wanted` takes within the default run, among the sequences `accept` takes; null when there is none. */
export function firstMismatch(wanted: (mismatch: StepMismatch) => boolean, subject: Subject = current, accept: (sequence: SceneSequence, before: readonly StepRecord[]) => boolean = () => true, trials = 300): StepMismatch | null {
  for (let seed = 1; seed <= trials; seed++) {
    const sequence = sceneSequence(seed);
    const { mismatches, before } = compareSequence(sequence, subject);
    const first = accept(sequence, before) ? mismatches.find(wanted) : undefined;
    if (first) return first;
  }
  return null;
}
