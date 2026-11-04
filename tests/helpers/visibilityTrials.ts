/// <reference types="vite/client" />
import { expect } from 'vitest';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility, sweepLightMask, sweepVisibility } from '../../src/app/vision/visibility';
import { sightWedges } from '../../src/app/vision/sightWedges';
import * as full from '../oracles/visibilityBaseline/visibility';
import seeds from '../fixtures/visibilitySeeds.json';
import { firstDifference, outlineFallback, sameStops, Tally, tallyPlan } from './visibilityCompare';
import { referencePlan } from './visibilityReference';
import type { VisibilityCall, VisibilityTrial } from './visibilityScenes';

/** Trials per family: `VITE_SWEEP_TRIALS`, else `fallback`. `VITE_SWEEP_SEED=family:seed` replays one. */
export function trialSeeds(family: string, fallback: number): number[] {
  const only = import.meta.env.VITE_SWEEP_SEED as string | undefined;
  if (only) {
    const [name, seed] = only.split(':');
    return name === family ? [Number(seed)] : [];
  }
  const kept = (seeds as { family: string; seed: number }[]).filter((entry) => entry.family === family).map((entry) => entry.seed);
  const count = Number(import.meta.env.VITE_SWEEP_TRIALS ?? fallback);
  return [...kept, ...Array.from({ length: count }, (_, i) => i + 1)];
}

/** A family's time limit: `ms` up to 300 trials, longer in proportion where `VITE_SWEEP_TRIALS` asks for more. */
export function sweepTimeout(ms: number): number {
  return ms * Math.max(1, Math.ceil(Number(import.meta.env.VITE_SWEEP_TRIALS ?? 0) / 300));
}

/** Trials whose rules are counted against the reference, which works by brute force. */
export const TALLIED_TRIALS = 20;

function replay(trial: VisibilityTrial, file: string): string {
  return `replay: VITE_SWEEP_SEED='${trial.family}:${trial.seed}' npx vitest run --project unit ${file}`;
}

function same(what: string, actual: string | null, trial: VisibilityTrial, call: VisibilityCall, file: string): void {
  if (actual === null) return;
  const where = `${trial.family} seed ${trial.seed}, ${what} from (${call.origin.x}, ${call.origin.y}) radius ${call.radius} ${call.channel ?? 'any'}`;
  expect.fail(`${where}: ${actual}\n${replay(trial, file)}`);
}

/** Every call of a trial: the sweep, its penumbra wedges and its cone clip against the full sweep's. */
export function checkTrial(trial: VisibilityTrial, file: string, tally?: Tally): void {
  for (const call of trial.calls) {
    const { origin, radius, channel, cone } = call;
    const expected = full.computeVisibility(origin, radius, trial.walls, undefined, channel);
    const actual = computeVisibility(origin, radius, trial.walls, undefined, channel);
    same('sweep', firstDifference(actual, expected), trial, call, file);
    for (const apex of [0, 35]) {
      if (JSON.stringify(sightWedges(origin, actual, radius, apex)) !== JSON.stringify(sightWedges(origin, expected, radius, apex))) same('wedges', 'differ', trial, call, file);
    }
    if (cone) {
      same('cone', firstDifference(computeVisibility(origin, radius, trial.walls, cone, channel), full.computeVisibility(origin, radius, trial.walls, cone, channel)), trial, call, file);
      if (tally && outlineFallback(origin, expected)) tally.add('outline fallbacks');
    }
    if (tally) {
      const plan = referencePlan(call, trial.walls);
      if (plan) tallyPlan(plan, tally);
    }
  }
  if (tally) tally.add('trials');
}

/** Limited walls keep the full sweep, the light mask and the stops bit for bit. */
export function checkLimitedTrial(trial: VisibilityTrial, file: string, tally: Tally): void {
  for (const call of trial.calls) {
    const { origin, radius, channel } = call;
    const walls: readonly WallSegment[] = trial.walls;
    same('sweep', firstDifference(computeVisibility(origin, radius, walls, undefined, channel), full.computeVisibility(origin, radius, walls, undefined, channel)), trial, call, file);
    for (const [name, mine, theirs] of [['visibility', sweepVisibility, full.sweepVisibility], ['light mask', sweepLightMask, full.sweepLightMask]] as const) {
      const a = mine(origin, radius, walls, channel), b = theirs(origin, radius, walls, channel);
      same(name, firstDifference(a.polygon, b.polygon), trial, call, file);
      if (!sameStops(a.stops, b.stops)) same(`${name} stops`, 'differ', trial, call, file);
    }
    if (full.wallsInReach(walls, origin, radius, channel).some((w) => w.limited)) tally.add('limited in reach');
  }
  tally.add('trials');
}

/** Requires `name` to have been counted at least `perTrial` times per tallied trial. */
export function floor(tally: Tally, name: string, perTrial: number): void {
  const trials = tally.get('trials');
  expect(tally.get(name), `${name} over ${trials} trials (${tally.line()})`).toBeGreaterThanOrEqual(Math.ceil(perTrial * trials));
}
