/**
 * The rules a floor's layout must keep, checked on the finished floor: past five rooms, a loop
 * runs through the way from its first room to the room farthest from it, through doors a party
 * finds (secret doors are no part of it).
 */

import type { DungeonDoor, DungeonRoom } from '../model';
import { farthestRoom, hops, neighbours, openDoor, roomsOnLoops, shortestPath } from '../roomGraph';

/** Floors with more normal rooms than this need a loop on their main way. */
export const LOOP_FREE_ROOMS = 5;

export function floorRulesHold(floor: { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] }): boolean {
  const normals = floor.rooms.filter((room) => room.kind === 'room').length;
  if (normals <= LOOP_FREE_ROOMS) return true;
  const count = floor.rooms.length;
  const adjacent = neighbours(count, floor.doors, openDoor);
  const way = shortestPath(adjacent, 0, farthestRoom(hops(adjacent, 0)));
  const looped = roomsOnLoops(count, floor.doors, openDoor);
  return way.some((id) => looped.has(id));
}
