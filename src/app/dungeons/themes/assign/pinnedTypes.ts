/**
 * The room types of floors whose layout already gave every normal room its type (a house: the
 * planner places each room for what it is), taken as they are; only which rooms stand empty is
 * drawn, as for any programme.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import { stream } from '../../rng';
import type { RoomTypeId } from '../roomTypes';
import type { RoomProgramme, ThemeFacts } from '../themeTypes';
import type { RoomTypes } from './assignRoomTypes';
import { emptyRooms } from './emptyRooms';
import { newAssignment } from './score';

export function pinnedTypes(seed: number, floors: readonly PlannedFloor[], programme: RoomProgramme, facts: ThemeFacts, ruined: boolean): RoomTypes {
  const a = newAssignment(floors, programme, facts, ruined);
  for (const t of a.traits) a.types[t.index] = floors[t.floor]?.rooms[t.room]?.type ?? null;
  const byFloor = floors.map((floor) => new Map<number, RoomTypeId>(floor.rooms.flatMap((room) => (room.type ? [[room.id, room.type] as const] : []))));
  return { byFloor, empty: emptyRooms(stream(seed, 'rooms', 'empty'), a) };
}
