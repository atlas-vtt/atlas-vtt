/**
 * A room's own coordinates for placing things: `u` runs along the axis the room grew along (its
 * back wall at `u = halfDepth`), `v` across it, both from the floor's centre, in cells.
 */

import type { CellDir, CellPoint, DungeonDoor, DungeonRoom } from '../model';
import { dir, doorAnchor, holdsCell, perpendicular } from '../geometry';

export interface RoomFrame {
  room: DungeonRoom;
  centre: CellPoint;
  axis: CellDir;
  across: CellDir;
  halfDepth: number;
  halfWidth: number;
}

export function frameOf(room: DungeonRoom): RoomFrame {
  const horizontal = room.axis.x !== 0;
  return {
    room,
    centre: { x: room.x + room.w / 2, y: room.y + room.h / 2 },
    axis: room.axis,
    across: perpendicular(room.axis),
    halfDepth: (horizontal ? room.w : room.h) / 2,
    halfWidth: (horizontal ? room.h : room.w) / 2,
  };
}

export function pointIn(frame: RoomFrame, u: number, v: number): CellPoint {
  return {
    x: frame.centre.x + frame.axis.x * u + frame.across.x * v,
    y: frame.centre.y + frame.axis.y * u + frame.across.y * v,
  };
}

/** Radians for a prop facing `towards` (0 faces up, clockwise on screen). */
export function facing(towards: CellDir): number {
  return Math.atan2(towards.x, -towards.y);
}

/** Facing into the room from its back wall. */
export function facingIn(frame: RoomFrame): number {
  return facing(dir(-frame.axis.x, -frame.axis.y));
}

/** Radius of a round room's floor: the circle through the middles of its four doors. */
export function rotundaRadius(room: DungeonRoom): number {
  return Math.sqrt(room.w * room.w + 1) / 2;
}

/** Whether a point lies on the floor, `margin` cells clear of its edge: of a cave's room, on its cells. */
export function onFloor(frame: RoomFrame, p: CellPoint, margin: number): boolean {
  const { room } = frame;
  if (room.cells) return [-margin, margin].every((dx) => [-margin, margin].every((dy) => holdsCell(room, Math.floor(p.x + dx), Math.floor(p.y + dy))));
  if (room.rotunda) return Math.hypot(p.x - frame.centre.x, p.y - frame.centre.y) <= rotundaRadius(room) - margin;
  return p.x >= room.x + margin && p.x <= room.x + room.w - margin && p.y >= room.y + margin && p.y <= room.y + room.h - margin;
}

/** Doors in the back wall other than secret ones, which keep the wall whole. */
export function backWallOpen(frame: RoomFrame, doors: readonly DungeonDoor[]): boolean {
  return doors.some((door) => {
    if (door.kind === 'secret' || (door.from !== frame.room.id && door.to !== frame.room.id)) return false;
    // A door on an edge stands on the room's own boundary; a cell door half a cell beyond it, in the wall.
    const at = doorAnchor(door);
    const u = (at.x - frame.centre.x) * frame.axis.x + (at.y - frame.centre.y) * frame.axis.y;
    return Math.abs(u - (frame.halfDepth + (door.edge ? 0 : 0.5))) < 0.01;
  });
}
