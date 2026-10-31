/** Turns the finished work layout into the model's rooms and doors, numbering rooms afresh. */

import type { DungeonDoor, DungeonRoom } from '../model';
import { type ChamberTier, tierOfFloor } from './cavern/veins/caveSizes';
import { type WorkLayout, type WorkRoom, floorOf, kindOf, liveRooms } from './workLayout';

export interface CompactLayout {
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
}

/** A tiered cave's chamber's tier: the one it was drawn at, else (a boss room grown, a landing's room, a reward room) the one its floor reaches. */
function chamberTier(room: WorkRoom): ChamberTier {
  return room.tier !== undefined && !room.boss ? room.tier : tierOfFloor(room.width - 2, room.depth - 2);
}

export function compactLayout(layout: WorkLayout): CompactLayout {
  const live = liveRooms(layout);
  const ids = new Map(live.map((room, index) => [room.id, index]));
  const renumber = (id: number | null): number | null => (id === null ? null : (ids.get(id) ?? null));
  const rooms = live.map((room): DungeonRoom => {
    const floor = floorOf(room);
    return {
      id: ids.get(room.id) ?? 0,
      x: floor.x0,
      y: floor.y0,
      w: floor.x1 - floor.x0 + 1,
      h: floor.y1 - floor.y0 + 1,
      kind: kindOf(room),
      rotunda: room.rotunda,
      wing: room.wing,
      group: room.group,
      parent: renumber(room.parent),
      axis: room.axis,
      colonnade: room.colonnade,
      boss: room.boss,
      ...(layout.tiered && kindOf(room) === 'room' && { tier: chamberTier(room) }),
      ...(room.vertical && { vertical: room.vertical }),
      ...(room.tight && { tight: true }),
    };
  });
  const doors = layout.doors.map(
    (door): DungeonDoor => ({
      x: door.x,
      y: door.y,
      dir: door.dir,
      kind: door.kind,
      from: renumber(door.from),
      to: renumber(door.to),
      ...(door.descends && { descends: true }),
      ...(door.way && { way: door.way }),
      ...(door.width !== undefined && { width: door.width }),
    }),
  );
  return { rooms, doors };
}
