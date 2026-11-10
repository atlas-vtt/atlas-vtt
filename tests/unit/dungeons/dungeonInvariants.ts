/**
 * Checks every floor of a generated dungeon must pass; each returns a list of problems, empty when
 * sound. Written apart from the generator's own rule checks, so a rule is held by a second reading.
 */

import { floorRect, inRect, rectsTouch, wallRect } from '../../../src/app/dungeons/geometry';
import type { DungeonDoor, DungeonFloor, DungeonRoom } from '../../../src/app/dungeons/model';
import { roomShape, rotundaRadius, roomCentre, shapeDistance } from '../../../src/app/dungeons/render/geometry';
import { REFERENCE_CELL_PX } from '../../../src/app/dungeons/style';
import { DUNGEON_STYLES } from '../../../src/app/dungeons/styleCatalog';

/** The widest wall any preset draws outside a floor, in cells. */
const WALL = Math.max(...DUNGEON_STYLES.map(({ style }) => style.strokes.thick)) / REFERENCE_CELL_PX;

export type Door = Pick<DungeonDoor, 'from' | 'to' | 'kind'>;

function roomOf(floor: DungeonFloor, id: number | null): DungeonRoom | undefined {
  return id === null ? undefined : floor.rooms[id];
}

export function normals(floor: DungeonFloor): DungeonRoom[] {
  return floor.rooms.filter((room) => room.kind === 'room');
}

/** Rooms reached from `start` through the doors `use` lets through. */
export function reached(floor: DungeonFloor, start: number, doors: readonly Door[] = floor.doors): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift() as number;
    for (const door of doors) {
      if (door.from === null || door.to === null) continue;
      const next = door.from === at ? door.to : door.to === at ? door.from : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Doors walked from `start` to every room reached. */
export function distances(floor: DungeonFloor, start: number, doors: readonly Door[] = floor.doors): Map<number, number> {
  const out = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift() as number;
    for (const door of doors) {
      if (door.from === null || door.to === null) continue;
      const next = door.from === at ? door.to : door.to === at ? door.from : null;
      if (next !== null && !out.has(next)) {
        out.set(next, (out.get(at) ?? 0) + 1);
        queue.push(next);
      }
    }
  }
  return out;
}

export function floorProblems(floor: DungeonFloor): string[] {
  const out: string[] = [];
  floor.rooms.forEach((a) => {
    floor.rooms.forEach((b) => {
      if (a.id !== b.id && rectsTouch(floorRect(a), wallRect(b))) out.push(`floor ${a.id} runs into the walls of ${b.id}`);
    });
  });
  return out;
}

/**
 * A rotunda's circle and its wall ring stay clear of every other room's floor and wall ring; only
 * in a door cell may they meet, where the door joins them.
 */
export function rotundaProblems(floor: DungeonFloor): string[] {
  const out: string[] = [];
  const inDoorCell = (x: number, y: number): boolean => floor.doors.some((door) => x >= door.x && x <= door.x + 1 && y >= door.y && y <= door.y + 1);
  for (const rotunda of floor.rooms.filter((room) => room.rotunda)) {
    const c = roomCentre(rotunda);
    const reach = rotundaRadius(rotunda) + WALL;
    for (const other of floor.rooms) {
      if (other.id === rotunda.id) continue;
      const shape = roomShape(other);
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * Math.PI * 2;
        const x = c.x + Math.cos(a) * reach;
        const y = c.y + Math.sin(a) * reach;
        if (shapeDistance(shape, x, y) < WALL && !inDoorCell(x, y)) {
          out.push(`rotunda ${rotunda.id} meets room ${other.id} at ${x.toFixed(2)},${y.toFixed(2)}`);
          break;
        }
      }
    }
  }
  return out;
}

function onAnyFloor(floor: DungeonFloor, x: number, y: number): boolean {
  return floor.rooms.some((room) => inRect(floorRect(room), x, y));
}

function inAnyRoom(floor: DungeonFloor, x: number, y: number): boolean {
  return floor.rooms.some((room) => inRect(wallRect(room), x, y));
}

function doorProblem(floor: DungeonFloor, door: DungeonDoor, entry: boolean): string | null {
  const from = roomOf(floor, door.from);
  const to = roomOf(floor, door.to);
  const before = { x: door.x - door.dir.x, y: door.y - door.dir.y };
  const after = { x: door.x + door.dir.x, y: door.y + door.dir.y };
  const where = `${door.kind} door at ${door.x},${door.y}`;
  if (onAnyFloor(floor, door.x, door.y)) return `${where} lies on a floor`;
  if (!to) return `${where} leads nowhere`;
  if (!from && !entry) return `${where}: an entrance below the entry floor`;
  if (from ? !inRect(floorRect(from), before.x, before.y) : inAnyRoom(floor, before.x, before.y)) return `${where}: wrong side behind`;
  if (!inRect(floorRect(to), after.x, after.y)) return `${where}: wrong side ahead`;
  if (from && !inRect(wallRect(from), door.x, door.y)) return `${where} not in the wall of ${from.id}`;
  if (!inRect(wallRect(to), door.x, door.y)) return `${where} not in the wall of ${to.id}`;
  if (door.kind === 'steps' && !from) return `${where}: steps from the outside`;
  return null;
}

export function doorProblems(floor: DungeonFloor, entry: boolean): string[] {
  const cells = new Set<string>();
  const out: string[] = [];
  for (const door of floor.doors) {
    const key = `${door.x},${door.y}`;
    if (cells.has(key)) out.push(`two doors at ${key}`);
    cells.add(key);
    const problem = doorProblem(floor, door, entry);
    if (problem) out.push(problem);
  }
  return out;
}

/** Every room can be walked to from the first, through any door. */
export function unreachableRooms(floor: DungeonFloor): number[] {
  const seen = reached(floor, 0);
  return floor.rooms.filter((room) => !seen.has(room.id)).map((room) => room.id);
}

const openDoors = (floor: DungeonFloor): DungeonDoor[] => floor.doors.filter((door) => door.kind !== 'secret');

/** The doors a party finds between rooms, one per pair of rooms: two doors between the same rooms are no loop. */
function linkDoors(floor: DungeonFloor): DungeonDoor[] {
  const seen = new Set<string>();
  return openDoors(floor).filter((door) => {
    if (door.from === null || door.to === null) return false;
    const key = `${Math.min(door.from, door.to)}:${Math.max(door.from, door.to)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rooms on a loop of doors a party finds: those with a door whose loss leaves its two rooms joined. */
export function roomsOnLoops(floor: DungeonFloor): Set<number> {
  const doors = linkDoors(floor);
  const out = new Set<number>();
  doors.forEach((door, k) => {
    const others = doors.filter((_, j) => j !== k);
    if (reached(floor, door.from as number, others).has(door.to as number)) {
      out.add(door.from as number);
      out.add(door.to as number);
    }
  });
  return out;
}

/** E − V + C over the rooms and the doors a party finds. */
export function independentLoops(floor: DungeonFloor): number {
  const doors = linkDoors(floor);
  const seen = new Set<number>();
  let parts = 0;
  for (const room of floor.rooms) {
    if (seen.has(room.id)) continue;
    parts++;
    for (const id of reached(floor, room.id, doors)) seen.add(id);
  }
  return doors.length - floor.rooms.length + parts;
}

/**
 * Past five normal rooms, a loop holds a room of a shortest way from the first room to the room
 * farthest from it (through doors a party finds; the lowest id among the farthest).
 */
export function loopProblems(floor: DungeonFloor): string[] {
  if (normals(floor).length <= 5) return [];
  const doors = openDoors(floor);
  const fromStart = distances(floor, 0, doors);
  const far = Math.max(...fromStart.values());
  const end = [...fromStart].filter(([, d]) => d === far).map(([id]) => id).sort((a, b) => a - b)[0] as number;
  const toEnd = distances(floor, end, doors);
  // Every room on some shortest way lies at start-distance + end-distance = the way's length
  const onWay = floor.rooms.filter((room) => (fromStart.get(room.id) ?? Infinity) + (toEnd.get(room.id) ?? Infinity) === far);
  const looped = roomsOnLoops(floor);
  return onWay.some((room) => looped.has(room.id)) ? [] : [`no loop on the way from room 0 to room ${end}`];
}

/**
 * Secret doors add, never block: without them every room outside a secret wing is reached, and
 * each secret door either closes a loop or is the one way into rooms that are all secret.
 */
export function secretProblems(floor: DungeonFloor): string[] {
  const out: string[] = [];
  const open = reached(floor, 0, openDoors(floor));
  floor.rooms.filter((room) => room.wing !== 'secret' && !open.has(room.id)).forEach((room) => out.push(`room ${room.id} needs a secret door`));
  for (const door of floor.doors.filter((d) => d.kind === 'secret' && d.from !== null && d.to !== null)) {
    const without = floor.doors.filter((d) => d !== door);
    if (reached(floor, door.from as number, without).has(door.to as number)) continue;
    const beyond = reached(floor, 0, without).has(door.from as number) ? (door.to as number) : (door.from as number);
    const wing = reached(floor, beyond, without);
    if ([...wing].some((id) => floor.rooms[id]?.wing !== 'secret')) out.push(`secret door at ${door.x},${door.y} is the only way to rooms that are not secret`);
  }
  return out;
}
