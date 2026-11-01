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
import type { RoomScale } from '../../roomScale';

export interface FiveRoomHouse {
  rooms: (TypedRoom & { stage: FiveRoomStage })[];
  doors: DungeonDoor[];
  width: number;
}

function room(x: number, y: number, w: number, h: number, type: RoomTypeId, stage: FiveRoomStage): TypedRoom & { stage: FiveRoomStage } {
  return { box: box(x, y, w, h), notch: null, kind: 'room', role: stage === 'entrance' ? 'hall' : 'band', zone: 'family', wing: 'main', toCorridor: null, type, boss: stage === 'climax', servedBy: null, stage };
}

export function fiveRoomHouse(rng: Rng, scale?: RoomScale): FiveRoomHouse {
  if (scale === 'tactical') return tacticalHouse(rng);
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

/** A broad enfilade: each stage gets its own span, so the ballroom need not steal space from the other rooms. */
function tacticalHouse(rng: Rng): FiveRoomHouse {
  const specs = [
    { w: int(rng, 10, 14), h: int(rng, 10, 14), type: 'entrance-hall' as const, stage: 'entrance' as const },
    { w: int(rng, 10, 14), h: int(rng, 10, 14), type: pick(rng, ['library', 'portrait-gallery'] as const), stage: 'puzzle' as const },
    { w: int(rng, 10, 14), h: int(rng, 10, 14), type: pick(rng, ['conservatory', 'nursery'] as const), stage: 'setback' as const },
    { w: int(rng, 16, 20), h: int(rng, 16, 20), type: 'ballroom' as const, stage: 'climax' as const },
    { w: int(rng, 6, 8), h: int(rng, 6, 8), type: 'study' as const, stage: 'reward' as const },
  ];
  let width = 0;
  const rooms = specs.map(spec => {
    const placed = room(width, 0, spec.w, spec.h, spec.type, spec.stage);
    width += spec.w;
    return placed;
  });
  const doors: DungeonDoor[] = [{ x: Math.floor(rooms[0]!.box.w / 2), y: rooms[0]!.box.h, dir: { x: 0, y: -1 }, from: null, to: 0, kind: 'door', edge: true }];
  for (let k = 0; k < rooms.length - 1; k++) {
    const run = sharedRun(rooms[k]!, rooms[k + 1]!);
    const kind = k === 3 && chance(rng, 0.6) ? 'secret' : 'door';
    const cells = run && doorPlace(run, 'centre', kind === 'secret' ? 1 : 2, new Set());
    if (run && cells) doors.push(edgeDoor(cells, run, kind, k, k + 1));
  }
  return { rooms, doors, width };
}
