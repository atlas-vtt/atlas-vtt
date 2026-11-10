/**
 * The rooms the anchors and clusters left: the types a programme needs (most constrained first),
 * then optional types by weighted draw where a room fits them, then fillers for every room still
 * untyped.
 */

import { type Rng, weighted } from '../../rng';
import type { RoomTypeId } from '../roomTypes';
import type { RoomTypeSpec } from '../themeTypes';
import { type Assignment, FILLER_RELAXED, breaksHardRule, heldCount, isFree, isNeeded, roomScore } from './score';

const freeRooms = (a: Assignment): number[] => a.types.flatMap((_, i) => (isFree(a, i) ? [i] : []));

/** The free rooms a type may take. */
function candidates(a: Assignment, id: RoomTypeId): number[] {
  return freeRooms(a).filter((i) => !breaksHardRule(a, i, id));
}

/** The candidate where the type scores best (the first of equals); null where none may take it. */
function best(a: Assignment, rooms: readonly number[], id: RoomTypeId): { room: number; score: number } | null {
  let out: { room: number; score: number } | null = null;
  for (const room of rooms) {
    const score = roomScore(a, room, id);
    if (!out || score > out.score) out = { room, score };
  }
  return out;
}

/** How many more of a type the programme needs: on the floor with fewest for a type counted per floor. */
function missing(a: Assignment, spec: RoomTypeSpec): number {
  if (!spec.perFloor) return spec.count[0] - heldCount(a, spec.id, -1);
  return Math.max(...Array.from({ length: a.floors }, (_, floor) => spec.count[0] - a.types.filter((type, i) => type === spec.id && a.traits[i]?.floor === floor).length));
}

/** Every type the programme needs up to its least count, the type with the fewest rooms open to it first; one no room can take is dropped. */
export function fillRequired(a: Assignment): void {
  let open = a.programme.rooms.filter((spec) => isNeeded(spec) && missing(a, spec) > 0);
  while (open.length > 0) {
    const ranked = open.map((spec) => ({ spec, rooms: candidates(a, spec.id) })).sort((x, y) => x.rooms.length - y.rooms.length);
    const next = ranked.find(({ rooms }) => rooms.length > 0);
    if (!next) return;
    const at = best(a, next.rooms, next.spec.id);
    if (at) a.types[at.room] = next.spec.id;
    open = open.filter((spec) => missing(a, spec) > 0);
  }
}

/** Optional types by weighted draw, each up to its largest count, while a room fits one with a score of 0 or more. */
export function fillOptional(rng: Rng, a: Assignment): void {
  let open = a.programme.rooms.filter((spec) => !isNeeded(spec) && !spec.climaxOnly && !spec.holdsStairs && !spec.over);
  for (;;) {
    const fitting = open.flatMap((spec) => {
      const at = best(a, candidates(a, spec.id), spec.id);
      return at && at.score >= 0 ? [{ spec, at }] : [];
    });
    if (fitting.length === 0) return;
    const pick = weighted(rng, fitting.map((f) => [f, f.spec.weight ?? 1] as const));
    a.types[pick.at.room] = pick.spec.id;
    open = open.filter((spec) => fitting.some((f) => f.spec === spec));
  }
}

/**
 * Every room still free takes the best-scoring filler that breaks no rule, else the filler of most
 * weight that breaks none but its count and branch (fillers fill every room left over), else the first filler.
 */
export function fillRest(a: Assignment): void {
  const fillers = a.programme.filler;
  for (const i of freeRooms(a)) {
    const within = fillers.filter(([id]) => !breaksHardRule(a, i, id)).map(([id]) => ({ id, score: roomScore(a, i, id) }));
    const beyond = fillers.filter(([id]) => !breaksHardRule(a, i, id, FILLER_RELAXED)).sort((x, y) => y[1] - x[1]);
    a.types[i] = within.sort((x, y) => y.score - x.score)[0]?.id ?? beyond[0]?.[0] ?? fillers[0]?.[0] ?? null;
  }
}
