/**
 * Secret wings: small dead-end branches behind a secret door, optional rooms no way through the
 * floor needs. A branch qualifies only where no loop leads into it, so its secret door is the one
 * way in and hiding it blocks nothing.
 */

import type { DungeonParams } from '../params';
import { type KeyedRng, type Rng, chance, shuffled } from '../rng';
import { REGULAR_ZONE, type WorkLayout, isNormal, liveRooms, roomAt, subtree, treeDoorInto } from './workLayout';

/** Secret wing zones count up from here. */
const FIRST_SECRET_ZONE = REGULAR_ZONE + 1;

function wingCount(rng: Rng, params: DungeonParams): number {
  const { chance: p, extra } = params.secretWings;
  if (!chance(rng, p)) return 0;
  let count = 1;
  if (chance(rng, extra)) count++;
  if (count === 2 && chance(rng, extra * extra)) count++;
  return count;
}

/** A branch is a dead end when its only door to the rest of the floor is the one it grew through. */
function isDeadEnd(layout: WorkLayout, root: number, members: ReadonlySet<number>): boolean {
  const way = treeDoorInto(layout, root);
  return layout.doors.every((door) => {
    if (door === way) return true;
    const inside = (id: number | null): boolean => id !== null && members.has(id);
    return inside(door.from) === inside(door.to);
  });
}

function isCandidate(layout: WorkLayout, id: number, limit: number): boolean {
  if (id === 0) return false;
  const wing = subtree(layout, id);
  if (wing.length > limit || !wing.every((member) => roomAt(layout, member).zone === REGULAR_ZONE && !roomAt(layout, member).boss)) return false;
  return wing.some((member) => isNormal(roomAt(layout, member))) && isDeadEnd(layout, id, new Set(wing));
}

function hideWing(layout: WorkLayout, root: number, zone: number): void {
  for (const id of subtree(layout, root)) {
    const room = roomAt(layout, id);
    room.wing = 'secret';
    room.zone = zone;
  }
  const entrance = treeDoorInto(layout, root);
  if (entrance) entrance.kind = 'secret';
}

export function placeSecretWings(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  const rng = rngOf('secrets');
  const count = wingCount(rng, params);
  if (count === 0) return;
  const limit = Math.max(3, Math.ceil(liveRooms(layout).length / 6));
  let zone = FIRST_SECRET_ZONE;
  for (const room of shuffled(rng, liveRooms(layout))) {
    if (zone - FIRST_SECRET_ZONE >= count) return;
    if (!isCandidate(layout, room.id, limit)) continue;
    hideWing(layout, room.id, zone++);
  }
}
