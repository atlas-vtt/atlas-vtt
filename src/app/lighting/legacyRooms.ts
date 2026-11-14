import { Q_SCALE, type QShape } from '../types/shapeTypes';
import type { WallSegment } from '../types/wallTypes';
import { isRecord } from '../utils/guards';
import { unionShapes } from './polygonClip';
import { edgesWithShapeOnLeft } from './wallSides';

/**
 * Rooms as Atlas 0.14.0 saved them (`objects.rooms`): areas of their own, whose outline stood as
 * walls. A room is its walls now, so a scene's rooms become walls when its file is read, and the
 * file holds none once it is saved.
 */

/** An area a saved room can have: rings of whole eighth pixels within what a shape holds. */
const LIMIT = 2 ** 31;
const isRing = (ring: unknown): ring is number[] => Array.isArray(ring) && ring.length >= 6 && ring.length % 2 === 0
  && ring.every((value) => Number.isInteger(value) && Math.abs(value as number) < LIMIT);

interface SavedRoom {
  area: QShape;
  hidden: boolean;
  level: string | undefined;
}

function readRoom(value: unknown): SavedRoom | null {
  if (!isRecord(value) || !Array.isArray(value.area) || !value.area.every(isRing)) return null;
  return { area: value.area, hidden: value.hidden === true, level: typeof value.level === 'string' ? value.level : undefined };
}

/**
 * The walls that stand for `rooms`: on each level, the outline of its shown rooms together, as it
 * stopped sight and light, and the outline of every hidden room by itself (rock then, closed off
 * now). Named by level and ends, so reading a file again names them alike.
 */
export function wallsOfSavedRooms(rooms: unknown): Record<string, WallSegment> {
  const walls: Record<string, WallSegment> = {};
  if (!isRecord(rooms)) return walls;
  const read = Object.values(rooms).flatMap((room) => readRoom(room) ?? []);
  const levels = new Set(read.map((room) => room.level));
  const add = (area: QShape, level: string | undefined): void => {
    // The room lies to the left of each edge, which the walls then say of their floor.
    for (const { p1, p2 } of edgesWithShapeOnLeft(area)) {
      const [x1, y1, x2, y2] = [p1.x, p1.y, p2.x, p2.y].map((value) => Math.round(value * Q_SCALE));
      const id = `room_${level ?? ''}_${x1}_${y1}_${x2}_${y2}`;
      walls[id] = { id, kind: 'wall', type: 'solid', closed: true, chainId: `rooms_${level ?? ''}`, floor: 'left', p1, p2, ...(level !== undefined && { levels: [level] }) };
    }
  };
  try {
    for (const level of levels) {
      const here = read.filter((room) => room.level === level);
      add(here.filter((room) => !room.hidden).reduce<QShape>((open, room) => unionShapes(open, room.area), []), level);
      for (const room of here) if (room.hidden) add(unionShapes(room.area, []), level);
    }
  } catch (error) {
    // An area no shape can hold (a damaged file): the rooms read so far stand, the rest are passed over.
    if (!(error instanceof RangeError)) throw error;
  }
  return walls;
}

/** `objects` of a scene file with its saved rooms turned into walls, in place: its own walls stay as they are. */
export function roomsIntoWalls(objects: Record<string, unknown>): void {
  if (objects.rooms === undefined) return;
  const made = wallsOfSavedRooms(objects.rooms);
  delete objects.rooms;
  if (Object.keys(made).length === 0) return;
  objects.walls = { ...made, ...(isRecord(objects.walls) ? objects.walls : {}) };
}
