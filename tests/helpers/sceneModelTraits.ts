import { sleeps } from '../../src/app/lighting/lightActivity';
import { lightZoneList, withZones } from '../../src/app/lighting/lightZones';
import { movedWhileHeld } from '../../src/app/lighting/sightOnDrop';
import { ambientAt } from '../../src/app/vision/lightLevels';
import type { StepRecord } from './sceneModelCompare';
import { frozen } from './sceneModelFrozen';
import { STEP_KINDS, type SceneSequence, type SceneStep } from './sceneModelSteps';

/** What a sequence exercises: every kind of step it takes, and what the frozen scene model made of it. */
export const SEQUENCE_TRAITS = [
  ...STEP_KINDS,
  'a quenched light',
  'a darkness',
  'a lamp that changes state',
  'a zone',
  'a beam',
  'a drag that builds nothing',
] as const;

export type SequenceTrait = typeof SEQUENCE_TRAITS[number];

/** Whether a light that follows the ambient light shines in one of two steps and not in the other, the lights and zones being the same. */
function lampChanged(before: SceneStep, after: SceneStep): boolean {
  const { lights, lightZones } = after.state.objects;
  if (before.state.objects.lights !== lights || before.state.objects.lightZones !== lightZones) return false;
  const zones = lightZoneList(lightZones);
  const asleep = (step: SceneStep): boolean[] => Object.values(lights).map((light) => sleeps(light, ambientAt(light, withZones(step.state.lighting, zones))));
  const now = asleep(after);
  return asleep(before).some((was, i) => was !== now[i]);
}

/** The traits of one sequence, read from its steps and from the frozen scene model's run of it. */
export function sequenceTraits({ steps }: SceneSequence, before: readonly StepRecord[]): Set<SequenceTrait> {
  const traits = new Set<SequenceTrait>();
  steps.forEach((step, i) => {
    if (i > 0) traits.add(step.kind as SequenceTrait);
    const { model, rebuilt } = before[i]!;
    if (!model) return;
    const { lights, tokens } = step.state.objects;
    if (rebuilt && frozen.activeLights(lights, tokens, model.ambient).length > model.lights.length) traits.add('a quenched light');
    if (model.lights.some((light) => light.darkness)) traits.add('a darkness');
    if (model.lights.some((light) => light.cone)) traits.add('a beam');
    if (model.zones.length > 0) traits.add('a zone');
    if (i > 0 && lampChanged(steps[i - 1]!, step)) traits.add('a lamp that changes state');
    const dragged = Object.values(tokens).some((token) => movedWhileHeld(token, step.state.heldTokens));
    if (step.kind === 'a held token moved while sight waits for the drop' && dragged && !rebuilt) traits.add('a drag that builds nothing');
  });
  return traits;
}

/** Counts of each trait over a run, filled block by block. */
export class SequenceTally {
  readonly counts = new Map<SequenceTrait, number>(SEQUENCE_TRAITS.map((trait) => [trait, 0]));
  sequences = 0;

  add(traits: ReadonlySet<SequenceTrait>): void {
    this.sequences++;
    for (const trait of traits) this.counts.set(trait, this.counts.get(trait)! + 1);
  }

  /** Each trait in at least one sequence in twenty of `trials`, and every sequence of the run counted. */
  floorProblems(trials: number): string[] {
    const floor = Math.ceil(trials * 0.05);
    const problems = this.sequences === trials ? [] : [`counted ${this.sequences} sequences, expected ${trials}`];
    for (const [trait, count] of this.counts) if (count < floor) problems.push(`${trait}: ${count} sequences, at least ${floor} needed`);
    return problems;
  }
}
