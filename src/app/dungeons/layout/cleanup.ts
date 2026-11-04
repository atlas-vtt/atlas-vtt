/**
 * Clean-up after loops: corridors and junctions that lead nowhere go, then corridors lose the
 * empty stretch beyond their last door.
 */

import { type WorkDoor, type WorkLayout, type WorkRoom, doorsOf, isNormal, kindOf, liveRooms, toLocal } from './workLayout';

/**
 * Takes away every corridor and junction (never the first room) with one door or none, and with
 * it its door, until none is left: rooms are taken in any order, since taking one only leaves its
 * neighbours fewer doors, and each room's doors are counted once rather than looked up on every pass.
 */
function removeDeadEnds(layout: WorkLayout): void {
  const doorsAt = new Map<number, WorkDoor[]>();
  for (const door of layout.doors) {
    for (const id of new Set([door.from, door.to])) {
      if (id === null) continue;
      const list = doorsAt.get(id) ?? [];
      list.push(door);
      doorsAt.set(id, list);
    }
  }
  const gone = new Set<WorkDoor>();
  const left = (id: number): number => (doorsAt.get(id) ?? []).filter((door) => !gone.has(door)).length;
  const deadEnd = (room: WorkRoom | undefined): room is WorkRoom => room !== undefined && !room.removed && room.id !== 0 && !isNormal(room) && left(room.id) <= 1;
  const queue = liveRooms(layout).filter(deadEnd);
  while (queue.length > 0) {
    const room = queue.pop() as WorkRoom;
    if (!deadEnd(room)) continue;
    room.removed = true;
    for (const door of doorsAt.get(room.id) ?? []) {
      if (gone.has(door)) continue;
      gone.add(door);
      for (const id of [door.from, door.to]) {
        const other = id === null || id === room.id ? undefined : layout.rooms[id];
        if (deadEnd(other)) queue.push(other);
      }
    }
  }
  if (gone.size > 0) layout.doors = layout.doors.filter((door) => !gone.has(door));
}

/** A corridor without a door in its far wall ends just past its last side door. */
function trimCorridor(layout: WorkLayout, room: WorkRoom): void {
  const along = doorsOf(layout, room.id).map((door) => toLocal(room, door).i);
  if (along.includes(room.depth - 1)) return;
  const last = Math.max(1, ...along.filter((i) => i < room.depth - 1));
  room.depth = Math.max(3, last + 2);
}

export function cleanUp(layout: WorkLayout): void {
  removeDeadEnds(layout);
  liveRooms(layout)
    .filter((room) => kindOf(room) === 'corridor')
    .forEach((room) => trimCorridor(layout, room));
}
