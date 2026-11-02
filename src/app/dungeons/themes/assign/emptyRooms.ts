/**
 * Which typed rooms stand empty: a share of the dungeon's normal rooms drawn once (more in a ruin),
 * taken among the rooms whose type may stand empty or is a filler, never an anchored room, the
 * pivot or a cluster's core. An empty room keeps its type, so terrain and the GM's label still
 * know what it was.
 */

import { type Rng, shuffled } from '../../rng';
import { type Assignment, specOf } from './score';

/** The share of normal rooms left empty lies between these. */
const EMPTY_SHARE: readonly [number, number] = [0.24, 0.36];
/** A ruin leaves this much more empty. */
const RUINED_EMPTY = 0.15;

/** The empty rooms of each floor, by room id. */
export function emptyRooms(rng: Rng, a: Assignment): Set<number>[] {
  const share = EMPTY_SHARE[0] + rng() * (EMPTY_SHARE[1] - EMPTY_SHARE[0]) + (a.ruined ? RUINED_EMPTY : 0);
  const fillers = new Set(a.programme.filler.map(([id]) => id));
  const cores = new Set(a.programme.clusters.map((cluster) => cluster.core));
  const eligible = a.traits.filter((t) => {
    const type = a.types[t.index];
    if (!type || a.fixed[t.index] || t.index === a.pivot || cores.has(type)) return false;
    return fillers.has(type) || specOf(a.programme, type)?.mayStandEmpty === true;
  });
  const wanted = Math.min(eligible.length, Math.round(a.traits.length * share));
  const empty = Array.from({ length: a.floors }, () => new Set<number>());
  for (const t of shuffled(rng, eligible).slice(0, wanted)) empty[t.floor]?.add(t.room);
  return empty;
}
