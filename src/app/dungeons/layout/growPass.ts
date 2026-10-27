/**
 * Deepens rooms after the tree is grown, a mirror group at a time so twins stay alike. A group
 * stops at random (the deeper and narrower, the sooner), at the deepest size, or when a member
 * would run into another room. The room around a landing keeps its size.
 */

import { type KeyedRng, type Rng, chance } from '../rng';
import { roomFits } from './grow';
import { type WorkLayout, type WorkRoom, isNormal, liveRooms, roomRect } from './workLayout';

const MAX_DEPTH = 10;

function groupsOf(layout: WorkLayout): WorkRoom[][] {
  const groups = new Map<number, WorkRoom[]>();
  liveRooms(layout)
    .filter((room) => isNormal(room) && !room.fixed)
    .forEach((room) => {
      const members = groups.get(room.group) ?? [];
      members.push(room);
      groups.set(room.group, members);
    });
  return [...groups.values()];
}

function tryDeepen(layout: WorkLayout, members: WorkRoom[]): boolean {
  members.forEach((room) => room.depth++);
  const fits = members.every((room) => roomFits(layout, roomRect(room), new Set([room.id]), room.parent === null));
  if (!fits) members.forEach((room) => room.depth--);
  return fits;
}

function keepsGrowing(rng: Rng, members: WorkRoom[]): boolean {
  const first = members[0];
  if (!first || first.depth >= MAX_DEPTH) return false;
  return !chance(rng, first.depth / first.width);
}

export function growPass(rngOf: KeyedRng, layout: WorkLayout): void {
  const rng = rngOf('grow');
  let active = groupsOf(layout);
  while (active.length > 0) {
    active = active.filter((members) => keepsGrowing(rng, members) && tryDeepen(layout, members));
  }
}
