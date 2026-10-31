/**
 * The book's caves never end blind: a chamber with one way in shows that the cave goes on past it,
 * a squeeze too tight to follow leading into the rock. It leaves by one wall (`DungeonRoom.continuing`),
 * from the cell `continuingCell` finds there, with rock beyond it and away from every door and
 * stairwell; the map does not grow for it. Every such chamber has one in a cave that never has dead passages, about half of
 * them in any other.
 */

import { cellKey, doorCells, floorCellsOf } from '../../../geometry';
import type { CellDir, CellPoint, DungeonDoor, DungeonRoom, DungeonStair } from '../../../model';
import { type Rng, chance, shuffled } from '../../../rng';

const DIRS: readonly CellDir[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
/** Cells of rock past the chamber's edge the squeeze needs before anything else's floor, and the fewest cells (each way) between its cell and a door's or a stairwell's. */
const ROOMY = { rock: 2, clearance: 2 };
/** What a squeeze needs at the least, where the cave must lead on from every dead end. */
const TIGHT = { rock: 1, clearance: 1 };
type Room = typeof ROOMY;

/** What a floor holds that a squeeze must keep clear of: its rooms' floors, its doors and its stairwells. */
export interface ContinuingFloor {
  rooms: readonly Pick<DungeonRoom, 'cells'>[];
  doors: readonly Pick<DungeonDoor, 'x' | 'y' | 'wide' | 'kind'>[];
  stairs?: readonly Pick<DungeonStair, 'x' | 'y' | 'w' | 'h'>[];
}

function stairCells(floor: ContinuingFloor): CellPoint[] {
  return (floor.stairs ?? []).flatMap((s) => Array.from({ length: s.w * s.h }, (_, k) => ({ x: s.x + (k % s.w), y: s.y + Math.floor(k / s.w) })));
}

function floorKeys(floor: ContinuingFloor): Set<string> {
  const out = new Set<string>();
  for (const room of floor.rooms) for (const c of room.cells ?? []) out.add(cellKey(c.x, c.y));
  for (const door of floor.doors) for (const c of doorCells(door)) out.add(cellKey(c.x, c.y));
  return out;
}

/**
 * The cell the squeeze leaves `room` from towards `dir` (unset, the room's own `continuing`): of
 * the chamber's cells furthest that way, the middle one across that side, so the squeeze stands
 * where the wall faces that way. The one answer the layout, the note and the drawing read, so all
 * three put the squeeze on the same cell. Undefined where the chamber has no squeeze or no cells.
 */
export function continuingCell(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells' | 'continuing'>, dir: CellDir | undefined = room.continuing): CellPoint | undefined {
  const cells = floorCellsOf(room);
  if (cells.length === 0 || !dir) return undefined;
  const reach = (c: CellPoint): number => c.x * dir.x + c.y * dir.y;
  const far = Math.max(...cells.map(reach));
  const rim = cells.filter((c) => reach(c) === far).sort((a, b) => a.x * -dir.y + a.y * dir.x - (b.x * -dir.y + b.y * dir.x));
  return rim[Math.floor((rim.length - 1) / 2)];
}

/** Whether the rock beyond the cell, `room.rock` cells towards `dir`, holds nothing of the floor's (`taken`, by key). */
function rockBeyond(cell: CellPoint, dir: CellDir, taken: ReadonlySet<string>, room: Room): boolean {
  return Array.from({ length: room.rock }, (_, k) => k + 1).every((k) => !taken.has(cellKey(cell.x + dir.x * k, cell.y + dir.y * k)));
}

function clearOf(cell: CellPoint, floor: ContinuingFloor, room: Room): boolean {
  const near = (c: CellPoint): boolean => Math.abs(c.x - cell.x) <= room.clearance && Math.abs(c.y - cell.y) <= room.clearance;
  return !floor.doors.some((door) => doorCells(door).some(near)) && !stairCells(floor).some(near);
}

/** Whether the chamber is a dead end: one way in and no stairwell in it. */
function deadEnd(room: DungeonRoom, doors: readonly DungeonDoor[], floor: ContinuingFloor): boolean {
  const ways = doors.filter((door) => door.from === room.id || door.to === room.id).length;
  const cells = new Set((room.cells ?? []).map((c) => cellKey(c.x, c.y)));
  const stairs = stairCells(floor).some((c) => cells.has(cellKey(c.x, c.y)));
  return room.kind === 'room' && ways === 1 && !stairs;
}

/**
 * The floor's rooms with a squeeze leading on from each dead-end chamber that has `share` of a
 * chance (drawn for every one, so the draws do not hang on the floor's shape) and a wall it can
 * leave by: rock two cells deep beyond its cell, which stands two cells clear of every door and
 * stairwell (one and one where every dead end must lead on and no wall has more room). The walls
 * are tried in a seeded order.
 */
export function withContinuing(rng: Rng, rooms: readonly DungeonRoom[], floor: { doors: readonly DungeonDoor[]; stairs: readonly DungeonStair[] }, share: number): DungeonRoom[] {
  const whole = { rooms, doors: floor.doors, stairs: floor.stairs };
  // Every wall of every dead end asks what the floor holds: the floor is read once.
  const taken = floorKeys(whole);
  return rooms.map((room) => {
    const hit = chance(rng, share);
    const order = shuffled(rng, DIRS);
    if (!hit || !deadEnd(room, floor.doors, whole)) return room;
    const fits = (space: Room): ((d: CellDir) => boolean) => (d) => {
      const cell = continuingCell(room, d);
      return cell !== undefined && rockBeyond(cell, d, taken, space) && clearOf(cell, whole, space);
    };
    // Where every dead end must lead on, a squeeze may stand tighter than it would by choice.
    const dir = order.find(fits(ROOMY)) ?? (share >= 1 ? order.find(fits(TIGHT)) : undefined);
    return dir ? { ...room, continuing: dir } : room;
  });
}
