/**
 * A narrow way whose neck could not be held (`holdNecks`) is walked: a crawl drawn on an opening
 * wider than one cell reads as stones set down on open floor, and the cave's shape is the truth the
 * way must follow. It keeps the main path's two cells where it lies on the lane, a single cell's
 * walk elsewhere. A chamber whose only tight way on was such a pinch of the main path is no longer
 * tight, so the note never says its only way on is a crawl.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import type { DungeonDoor } from '../../model';
import { LANE_WIDTH, onlyNarrowWaysOn, sourceChamber } from './veins/doorWays';

/** A walk of one cell, in feet: the width a narrow way off the main path takes once walked. */
const CELL_WALK = 5;

/** The floor with every door in `loose` walked, ten feet wide where `onLane` says the main path passes it. */
export function walkLooseNecks(floor: PlannedFloor, loose: ReadonlySet<number>, onLane: (k: number) => boolean): PlannedFloor {
  if (loose.size === 0) return floor;
  const doors = floor.doors.map((door, k): DungeonDoor => (loose.has(k) ? { ...door, way: 'walk', width: onLane(k) ? LANE_WIDTH : CELL_WALK } : door));
  const freed = new Set([...loose].filter(onLane).map((k) => sourceChamber(floor.rooms, floor.doors[k]!.from)?.id));
  const stillTight = new Set(doors.filter((door) => onlyNarrowWaysOn(door, floor.rooms)).map((door) => sourceChamber(floor.rooms, door.from)?.id));
  const rooms = floor.rooms.map((room) => {
    if (!room.tight || !freed.has(room.id) || stillTight.has(room.id)) return room;
    const freedRoom = { ...room };
    delete freedRoom.tight;
    return freedRoom;
  });
  return { ...floor, rooms, doors };
}
