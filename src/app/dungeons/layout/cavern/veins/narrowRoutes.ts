/**
 * A crawl, a squeeze or a letterbox is a route, not a door: the book names a whole way by how it
 * is passed (a crawl of so many turns), so the passage behind such a door, up to its next doors,
 * is one cell wide and low its whole length (`DungeonRoom.narrow`), and its other doors are passed
 * the same way unless one rolled tighter still. The passage beyond them opens again: a route laid
 * in sections becomes a walk, a crawl and a walk. A narrow door straight between two chambers stays
 * a neck at the door, and the main path's passages keep their lane two cells wide past a pinch.
 */

import type { NarrowWay } from '../../../caveModel';
import type { PlannedFloor } from '../../../floors/planFloors';
import type { DungeonDoor, DungeonRoom } from '../../../model';
import { CRAWL_WIDTH } from './caveExits';

/** How tight each narrow way is, the letterbox tightest, and the widest each is in feet. */
const TIGHTNESS: Readonly<Record<NarrowWay, number>> = { crawl: 1, squeeze: 2, letterbox: 3 };
const WIDEST: Readonly<Record<NarrowWay, number>> = { crawl: CRAWL_WIDTH, squeeze: 2, letterbox: 1 };

const isNarrow = (way: string | undefined): way is NarrowWay => way !== undefined && way in TIGHTNESS;

/** The narrow way a door is passed by, where it is an open one: a hidden crawl and a scree step are no route. */
export function narrowWayOf(door: Pick<DungeonDoor, 'kind' | 'way'>): NarrowWay | undefined {
  return door.kind !== 'secret' && door.kind !== 'steps' && isNarrow(door.way) ? door.way : undefined;
}

/** The door a passage is entered by: from its parent in the room tree. */
export function enteringDoor(room: DungeonRoom, doors: readonly DungeonDoor[]): DungeonDoor | undefined {
  return doors.find((door) => door.to === room.id && door.from === room.parent && door.from !== null);
}

/**
 * The floor with every passage off the main path that is entered by a narrow way made one (`narrow`)
 * and its other doors passed as tight as it is. `onLane` tells the passages the main path runs
 * through, `doorOnLane` the doors it passes, by index.
 */
export function narrowRoutes(floor: PlannedFloor, onLane: (room: DungeonRoom) => boolean, doorOnLane: (k: number) => boolean): PlannedFloor {
  const routes = new Map<number, { way: NarrowWay; width: number }>();
  for (const room of floor.rooms) {
    if (room.kind === 'room' || onLane(room)) continue;
    const entered = enteringDoor(room, floor.doors);
    const way = entered && !doorOnLane(floor.doors.indexOf(entered)) ? narrowWayOf(entered) : undefined;
    if (entered && way) routes.set(room.id, { way, width: Math.min(entered.width ?? WIDEST[way], WIDEST[way]) });
  }
  if (routes.size === 0) return floor;
  const doors = floor.doors.map((door, k): DungeonDoor => {
    if (door.kind === 'secret' || door.kind === 'steps' || door.from === null || door.to === null || doorOnLane(k)) return door;
    const own = door.way ?? 'walk';
    // A special way (a sump, a traverse, a breakdown) or a climb stays what it is.
    if (own !== 'walk' && !isNarrow(own)) return door;
    const through = [door.from, door.to].flatMap((id) => {
      const route = routes.get(id);
      return route && enteringDoor(floor.rooms[id]!, floor.doors) !== door ? [route] : [];
    });
    const tightest = through.sort((a, b) => TIGHTNESS[b.way] - TIGHTNESS[a.way])[0];
    if (!tightest || (isNarrow(own) && TIGHTNESS[own] >= TIGHTNESS[tightest.way])) return door;
    return { ...door, way: tightest.way, width: Math.min(door.width ?? tightest.width, tightest.width) };
  });
  const rooms = floor.rooms.map((room) => {
    const route = routes.get(room.id);
    return route ? { ...room, narrow: route.way } : room;
  });
  return { ...floor, rooms, doors };
}

/**
 * The floor with `narrow` taken off every passage whose door in is no longer a narrow way: one
 * whose neck could not be held and is walked (`walkLooseNecks`), or whose way a cave that blocks
 * its ways choked with breakdown.
 */
export function settleNarrowRoutes<F extends Pick<PlannedFloor, 'rooms' | 'doors'>>(floor: F): F {
  if (!floor.rooms.some((room) => room.narrow && !narrowWayOf(enteringDoor(room, floor.doors) ?? { kind: 'opening' }))) return floor;
  const rooms = floor.rooms.map((room) => {
    if (!room.narrow || narrowWayOf(enteringDoor(room, floor.doors) ?? { kind: 'opening' })) return room;
    const opened = { ...room };
    delete opened.narrow;
    return opened;
  });
  return { ...floor, rooms };
}
