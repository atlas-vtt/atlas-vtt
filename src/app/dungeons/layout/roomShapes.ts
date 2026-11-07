/**
 * Round rooms and colonnades, decided per mirror group so twins stay alike. A room can be round
 * only when it is square and every door sits in the middle of a wall, and never around a landing.
 * Where the params cap round rooms (a Fortress's towers), only rooms on the plan's outer edge are
 * round, those at its corners first, and no more than the cap.
 */

import { rectsTouch } from '../geometry';
import type { DungeonParams } from '../params';
import { type KeyedRng, type Rng, chance } from '../rng';
import { type WorkLayout, type WorkRoom, doorsOf, isNormal, liveRooms, roomRect, toLocal } from './workLayout';

function mirrorGroups(layout: WorkLayout): WorkRoom[][] {
  const groups = new Map<number, WorkRoom[]>();
  for (const room of liveRooms(layout).filter(isNormal)) groups.set(room.group, [...(groups.get(room.group) ?? []), room]);
  return [...groups.values()];
}

function doorsInMiddles(layout: WorkLayout, room: WorkRoom): boolean {
  const middle = (room.depth - 1) / 2;
  const half = (room.width - 1) / 2;
  return doorsOf(layout, room.id).every((door) => {
    const { i, j } = toLocal(room, door);
    return (j === 0 && (i === 0 || i === room.depth - 1)) || (i === middle && Math.abs(j) === half);
  });
}

function mayBeRound(layout: WorkLayout, room: WorkRoom): boolean {
  return !room.fixed && room.width === room.depth && room.width >= 5 && doorsInMiddles(layout, room);
}

function roundChance(layout: WorkLayout, members: WorkRoom[], params: DungeonParams): number {
  const first = members[0];
  if (!first) return 0;
  const doors = members.reduce((sum, room) => sum + doorsOf(layout, room.id).length, 0) / members.length;
  return (doors / 3) * ((first.width - 2) / first.width) * params.rotundaFactor;
}

/** Longer and deeper rooms take colonnades more often; the first room is a likely hall. */
function colonnadeChance(members: WorkRoom[], params: DungeonParams): number {
  const first = members[0];
  if (!first) return 0;
  const w = first.width;
  const d = first.depth;
  let p = (0.7 * (d - 4)) / d + (0.3 * (w - 4)) / w;
  if (w === 5) p /= 2;
  if (w !== d) p *= Math.max(0, 1.2 - w / d);
  p *= params.colonnadeFactor;
  if (members.some((room) => room.id === 0)) p += 0.5;
  return p;
}

function canHoldColumns(room: WorkRoom): boolean {
  return room.rotunda ? room.width >= 7 : room.width >= 5;
}

interface GroupShape {
  members: WorkRoom[];
  round: boolean;
  columns: boolean;
}

/** The rolls of a group, in the order they were always made: round, then colonnades. */
function rollGroup(rng: Rng, layout: WorkLayout, members: WorkRoom[], params: DungeonParams): GroupShape {
  const round = members.every((room) => mayBeRound(layout, room)) && chance(rng, roundChance(layout, members, params));
  return { members, round, columns: chance(rng, colonnadeChance(members, params)) };
}

/** How many sides of the room face open ground: no other of the `live` rooms lies anywhere straight out from that wall. */
function openSides(live: readonly WorkRoom[], room: WorkRoom): number {
  const r = roomRect(room);
  const far = 1_000_000;
  const others = live.filter((other) => other.id !== room.id).map(roomRect);
  const bands = [
    { ...r, x0: r.x1 + 1, x1: far },
    { ...r, x0: -far, x1: r.x0 - 1 },
    { ...r, y0: r.y1 + 1, y1: far },
    { ...r, y0: -far, y1: r.y0 - 1 },
  ];
  return bands.filter((band) => !others.some((other) => rectsTouch(band, other))).length;
}

/** Keeps the round groups to towers: on the plan's outer edge, corners first, at most `most` rooms and `share` of the floor's (one at least). */
function capTowers(layout: WorkLayout, groups: GroupShape[], cap: NonNullable<DungeonParams['roundRooms']>): void {
  const live = liveRooms(layout);
  let left = Math.min(cap.most, Math.max(1, Math.floor(live.filter(isNormal).length * cap.share)));
  const ranked = groups
    .filter((group) => group.round)
    .map((group) => ({ group, sides: Math.min(...group.members.map((room) => openSides(live, room))) }))
    .sort((a, b) => b.sides - a.sides);
  for (const { group, sides } of ranked) {
    group.round = sides > 0 && group.members.length <= left;
    if (group.round) left -= group.members.length;
  }
}

export function shapeRooms(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  // A cave's rooms are shaped by the cave (`layout/cavern/`): never round, never colonnaded.
  if (params.cave) return;
  const rng = rngOf('shapes');
  const groups = mirrorGroups(layout).map((members) => rollGroup(rng, layout, members, params));
  if (params.roundRooms) capTowers(layout, groups, params.roundRooms);
  for (const { members, round, columns } of groups) {
    for (const room of members) {
      room.rotunda = round;
      room.colonnade = columns && canHoldColumns(room);
    }
  }
}
