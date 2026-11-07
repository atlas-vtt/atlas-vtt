/**
 * A few hundred improving swaps: two rooms trade types where both keep every rule (their
 * neighbours too) and the rooms the trade touches score more together.
 */

import { type Rng, pick } from '../../rng';
import { type Assignment, FILLER_RELAXED, breaksHardRule, roomScore } from './score';

export const SWAPS = 300;

/** The rooms whose score a trade between `i` and `j` can change: both, and every room within two of them. */
export function touched(a: Assignment, i: number, j: number): number[] {
  return [...new Set([i, j, ...a.graph.near(i), ...a.graph.near(j)])];
}

function scoreOf(a: Assignment, rooms: readonly number[]): number {
  return rooms.reduce((sum, k) => {
    const type = a.types[k];
    return type ? sum + roomScore(a, k, type) : sum;
  }, 0);
}

/** Whether the rooms keep every rule; anchored rooms are what the layout made them and fillers have no count. */
export function keepsRules(a: Assignment, rooms: readonly number[]): boolean {
  return rooms.every((k) => {
    const type = a.types[k];
    const filler = a.programme.filler.some(([id]) => id === type);
    return !type || a.fixed[k] || !breaksHardRule(a, k, type, filler ? FILLER_RELAXED : {});
  });
}

export function improve(rng: Rng, a: Assignment, swaps: number = SWAPS): void {
  // Cluster cores stay: the rooms around them were placed by where they stand.
  const cores = new Set(a.programme.clusters.map((cluster) => cluster.core));
  const free = a.types.flatMap((type, i) => (type !== null && !a.fixed[i] && !cores.has(type) ? [i] : []));
  if (free.length < 2) return;
  for (let k = 0; k < swaps; k++) {
    const i = pick(rng, free);
    const j = pick(rng, free);
    if (i === j || a.types[i] === a.types[j]) continue;
    const rooms = touched(a, i, j);
    const before = scoreOf(a, rooms);
    [a.types[i], a.types[j]] = [a.types[j] ?? null, a.types[i] ?? null];
    if (keepsRules(a, rooms) && scoreOf(a, rooms) > before) continue;
    [a.types[i], a.types[j]] = [a.types[j] ?? null, a.types[i] ?? null];
  }
}
