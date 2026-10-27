/**
 * The ground a floor after the entrance floor is grown on. A storey of a building stands within the
 * outer walls of the floor below it, never past them, its landing over the room its stairs rise
 * from; a dug floor lies under the floor above, a little past it either way.
 */

import { type CellRect, contains, floorRect, wallRect } from '../geometry';
import type { DungeonRoom } from '../model';
import { type FloorStack, isAbove } from './floorStack';
import { type StairSpot, spotRect } from './stairSpots';

type Rooms = { rooms: readonly DungeonRoom[] };

/** How far a dug floor may reach past the one above it, in cells: digging follows what was dug, roughly. */
const REACH_PAST_EARLIER = 2;

/** The box round a floor's rooms, walls included, `reach` cells wider either way: its outer walls at 0. */
export function extentOf(floor: Rooms, reach: number): CellRect {
  const walls = floor.rooms.map(wallRect);
  return {
    x0: Math.min(...walls.map((r) => r.x0)) - reach,
    y0: Math.min(...walls.map((r) => r.y0)) - reach,
    x1: Math.max(...walls.map((r) => r.x1)) + reach,
    y1: Math.max(...walls.map((r) => r.y1)) + reach,
  };
}

/** Whether floor `index` stands on the floor before it: a storey of a building. */
export function isStorey(stack: FloorStack, index: number): boolean {
  return isAbove(stack, index, index - 1);
}

/** Where floor `index` is grown, given the floor before it. */
export function footprintOf(earlier: Rooms, index: number, stack: FloorStack): CellRect {
  return extentOf(earlier, isStorey(stack, index) ? 0 : REACH_PAST_EARLIER);
}

/** The floor of the room on `floor` that holds the stairwell `spot`, if one does. */
export function stairRoomFloor(floor: Rooms, spot: StairSpot): CellRect | null {
  const room = floor.rooms.find((candidate) => candidate.kind === 'room' && contains(floorRect(candidate), spotRect(spot)));
  return room ? floorRect(room) : null;
}
