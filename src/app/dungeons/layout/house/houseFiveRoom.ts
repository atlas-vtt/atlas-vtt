/**
 * A five-room dungeon in a house (Fabian: five-room dungeons work on a house): one floor of five
 * rooms in an enfilade, no corridor, each opening only into the next: the entrance hall at the
 * front door, the puzzle room beside it, the setback behind that, the climax hall (the boss room)
 * beside the setback, and the reward beyond it, behind a secret door 60 % of the time.
 *
 *   back:  [ reward ][   climax   ][ setback ]
 *   front: [  hall      ][     puzzle       ]
 */

import type { DungeonDoor, DoorKind, FiveRoomStage } from '../../model';
import type { RoomTypeId } from '../../themes/roomTypes';
import { type Rng, chance, int, pick } from '../../rng';
import { edgeDoor } from './houseDoors';
import { doorPlace, sharedRun, type Placement } from './houseEdges';
import { box } from './houseGrid';
import type { TypedRoom } from './houseZones';

export interface FiveRoomHouse {
  rooms: (TypedRoom & { stage: FiveRoomStage })[];
  doors: DungeonDoor[];
  width: number;
}

function room(x: number, y: number, w: number, h: number, type: RoomTypeId, stage: FiveRoomStage): TypedRoom & { stage: FiveRoomStage } {
  return { box: box(x, y, w, h), notch: null, kind: 'room', role: stage === 'entrance' ? 'hall' : 'band', zone: 'family', wing: 'main', toCorridor: null, type, boss: stage === 'climax', servedBy: null, stage };
}

export function fiveRoomHouse(rng: Rng): FiveRoomHouse {
  const back = int(rng, 5, 6);
  const front = 5;
  const hall = int(rng, 5, 6);
  const width = hall + int(rng, 6, 8);
  const reward = int(rng, 3, 4);
  const setback = int(rng, 4, 5);
  const rooms = [
    room(0, back, hall, front, 'entrance-hall', 'entrance'),
    room(hall, back, width - hall, front, pick(rng, ['library', 'portrait-gallery'] as const), 'puzzle'),
    room(width - setback, 0, setback, back, pick(rng, ['conservatory', 'nursery'] as const), 'setback'),
    room(reward, 0, width - setback - reward, back, 'ballroom', 'climax'),
    room(0, 0, reward, back, 'study', 'reward'),
  ];
  const doors: DungeonDoor[] = [];
  const join = (a: number, b: number, kind: DoorKind, place: Placement): void => {
    const run = sharedRun(rooms[a]!, rooms[b]!);
    const cells = run && doorPlace(run, place, 1, new Set());
    if (run && cells) doors.push(edgeDoor(cells, run, kind, a, b));
  };
  // The front door on the hall's axis, its outside cell below the hall.
  const door = Math.floor(hall / 2);
  doors.push({ x: door, y: back + front, dir: { x: 0, y: -1 }, kind: 'door', from: null, to: 0, edge: true });
  join(0, 1, 'door', 'far');
  join(1, 2, 'door', 'far');
  join(2, 3, 'door', 'far');
  join(3, 4, chance(rng, 0.6) ? 'secret' : 'door', 'far');
  return { rooms, doors, width };
}
