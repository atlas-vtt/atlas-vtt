/**
 * A dais against a room's back wall: built steps facing the way in, with nothing standing on them.
 * It is tried against the room's free floor (`RoomSpace`) and takes what it uses; where it finds no
 * room it adds nothing.
 */

import type { DungeonDoor, DungeonProp } from '../model';
import { backWallOpen, facingIn, pointIn } from './roomFrame';
import { type RoomSpace, isFree, take } from './space';

/** A dais against the back wall, facing the way in. Never free in a room: a round room or a back wall a door breaks has none. */
export function dais(space: RoomSpace, doors: readonly DungeonDoor[]): DungeonProp | null {
  const { frame } = space;
  if (frame.room.rotunda || backWallOpen(frame, doors)) return null;
  const scale = Math.min(1, frame.halfWidth / 1.5, (2 * frame.halfDepth - 0.5) / 1.5);
  if (scale < 0.6) return null;
  const discs = [-0.75, 0, 0.75].map((v) => pointIn(frame, frame.halfDepth - 0.55 * scale, v * scale));
  if (!discs.every((p) => isFree(space, p, 0.6 * scale, 0))) return null;
  discs.forEach((p) => take(space, p, 0.6 * scale));
  const wall = pointIn(frame, frame.halfDepth, 0);
  return { kind: 'dais', x: wall.x, y: wall.y, rotation: facingIn(frame), scale, room: frame.room.id };
}
