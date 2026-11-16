/**
 * Every normal room of a themed dungeon typed by the theme's programme, after the layout and the
 * floors are planned: anchors, pivot, clusters, the types needed, optional types, fillers, the
 * rooms built to overlook a hall or gate below, a few hundred improving swaps, then the rooms that
 * stand empty. Every random choice comes from the
 * `rooms` stream, so layout, stairs and terrain never move.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import { stream } from '../../rng';
import type { RoomTypeId } from '../roomTypes';
import type { RoomProgramme, ThemeFacts } from '../themeTypes';
import { placeAnchors, placePivot, placeStairRooms } from './anchors';
import { placeClusters } from './clusters';
import { emptyRooms } from './emptyRooms';
import { fillOptional, fillRequired, fillRest } from './fill';
import { placeOverlooks } from './overlook';
import { newAssignment } from './score';
import { improve } from './swaps';

export interface AssignInput {
  seed: number;
  programme: RoomProgramme;
  floors: readonly PlannedFloor[];
  ruined: boolean;
  facts: ThemeFacts;
  /** The floor right above each floor, or null: where a room may be built to overlook one below. Unset: none. */
  above?: (floor: number) => number | null;
}

export interface RoomTypes {
  /** Each floor's normal rooms' types, by room id. */
  byFloor: ReadonlyMap<number, RoomTypeId>[];
  /** Each floor's rooms left empty, by room id. */
  empty: ReadonlySet<number>[];
}

export function assignRoomTypes(input: AssignInput): RoomTypes {
  const { seed } = input;
  const a = newAssignment(input.floors, input.programme, input.facts, input.ruined);
  placeAnchors(stream(seed, 'rooms', 'anchors'), a);
  placePivot(a);
  placeStairRooms(a);
  placeClusters(stream(seed, 'rooms', 'clusters'), a);
  fillRequired(a);
  fillOptional(stream(seed, 'rooms', 'optional'), a);
  fillRest(a);
  placeOverlooks(a, input.floors, input.above ?? (() => null));
  improve(stream(seed, 'rooms', 'swaps'), a);
  const byFloor = input.floors.map(() => new Map<number, RoomTypeId>());
  for (const t of a.traits) {
    const type = a.types[t.index];
    if (type) byFloor[t.floor]?.set(t.room, type);
  }
  return { byFloor, empty: emptyRooms(stream(seed, 'rooms', 'empty'), a) };
}
