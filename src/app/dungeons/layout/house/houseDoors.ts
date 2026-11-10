/**
 * The doors of one floor of a house (research §5.6), every one on the edge between two cells: the
 * front door on the hall's axis and the garden door on the saloon's, every room off its corridor a
 * cell clear of the corner, one baize door between the family's corridor and the servants', doors
 * between neighbouring reception rooms by the outer wall (an enfilade, never drawing room to dining
 * room or kitchen), the servery's door into the dining room, dressing rooms and bathrooms opening
 * only into their bedroom, the climax room off its corridor alone, and a kitchen court door.
 */

import type { CellDir, CellPoint, DoorKind, DungeonDoor } from '../../model';
import type { RoomTypeId } from '../../themes/roomTypes';
import { type EdgeRun, type Placement, SIDES, doorPlace, holds, runsOf, sharedRun } from './houseEdges';
import type { HouseFrame } from './houseFrame';
import type { TypedRoom } from './houseZones';

const RECEPTION: ReadonlySet<RoomTypeId> = new Set(['drawing-room', 'dining-room', 'library', 'saloon', 'parlour', 'study', 'conservatory', 'portrait-gallery', 'ballroom']);
const NEVER_JOINED: readonly [RoomTypeId, RoomTypeId][] = [
  ['drawing-room', 'dining-room'],
  ['drawing-room', 'kitchen'],
];

export interface DoorInput {
  frame: HouseFrame;
  rooms: readonly TypedRoom[];
  /** Cells no door opens onto: stairwells and the rows they are reached from. */
  blocked: ReadonlySet<string>;
  /** Whether a cell lies inside the house on this floor. */
  inHouse: (x: number, y: number) => boolean;
  ground: boolean;
}

export function houseDoors(input: DoorInput): DungeonDoor[] {
  const { rooms, blocked, frame } = input;
  const doors: DungeonDoor[] = [];
  const id = (room: TypedRoom): number => rooms.indexOf(room);
  const between = (from: TypedRoom, to: TypedRoom, kind: DoorKind, place: Placement, width = 1, run = sharedRun(from, to)): boolean => {
    const cells = run && doorPlace(run, place, Math.min(width, run.cells.length), blocked);
    if (!run || !cells) return false;
    doors.push(edgeDoor(cells, run, kind, id(from), id(to)));
    return true;
  };
  const outer = (room: TypedRoom, side: CellDir, kind: DoorKind, place: Placement, width = 1): void => {
    const run = runsOf(room, side, (x, y) => !input.inHouse(x, y)).sort((p, q) => q.cells.length - p.cells.length)[0];
    const cells = run && doorPlace(run, place, width, blocked);
    if (!run || !cells) return;
    // An entrance's cell is the one outside, its way pointing in.
    const outside = cells.map((c) => ({ x: c.x + run.dir.x, y: c.y + run.dir.y }));
    doors.push(edgeDoor(outside, { cells: outside, dir: { x: -run.dir.x as -1 | 0 | 1, y: -run.dir.y as -1 | 0 | 1 } }, kind, null, id(room)));
  };
  const hall = rooms.find((r) => r.role === 'hall');
  const axisWidth = (frame.hall.w % 2 === 0 ? 2 : 1);
  if (input.ground && hall) outer(hall, { x: 0, y: 1 }, 'door', 'centre', axisWidth);
  const corridors = rooms.filter((r) => r.kind === 'corridor');
  const familyMain = corridors.find((r) => r.wing === 'main' && r.zone === 'family');
  const serviceMain = corridors.find((r) => r.wing === 'main' && r.zone === 'service');
  if (hall && familyMain) between(familyMain, hall, 'opening', 'centre', frame.hall.w >= 6 ? 2 : 1);
  if (familyMain && serviceMain) between(familyMain, serviceMain, 'door', 'corner');
  for (const c of corridors.filter((r) => r.wing !== 'main')) {
    const main = c.zone === 'family' ? familyMain : serviceMain;
    if (main) between(main, c, 'opening', 'centre', 2);
  }
  for (const room of rooms) {
    if (room.kind !== 'room' || room === hall || room.servedBy !== null) continue;
    const corridor = corridorOf(room, corridors);
    if (!corridor) continue;
    const width = room.role === 'saloon' ? axisWidth : 1;
    between(corridor, room, 'door', room.role === 'saloon' ? 'centre' : 'corner', width);
  }
  if (input.ground) enfilade(rooms, between);
  for (const room of rooms) if (room.servedBy !== null) between(rooms[room.servedBy]!, room, 'door', 'far');
  if (input.ground) {
    const saloon = rooms.find((r) => r.role === 'saloon' && !r.boss);
    if (saloon) outer(saloon, { x: 0, y: -1 }, 'door', 'centre', axisWidth);
    const kitchen = rooms.find((r) => r.type === 'kitchen');
    if (kitchen) for (const side of SIDES.filter((s) => s.y !== 1)) if (!doors.some((d) => d.to === id(kitchen) && d.from === null)) outer(kitchen, side, 'door', 'corner');
  }
  return doors;
}

/** The corridor a room opens on: the one across its corridor side, else any it shares a wall with. */
function corridorOf(room: TypedRoom, corridors: readonly TypedRoom[]): TypedRoom | undefined {
  const toward = room.toCorridor;
  const across = toward && corridors.find((c) => runsOf(room, toward, (x, y) => holds(c, x, y)).length > 0 && c.zone === room.zone);
  return across ?? corridors.find((c) => c.zone === room.zone && sharedRun(c, room)) ?? corridors.find((c) => sharedRun(c, room));
}

type Between = (from: TypedRoom, to: TypedRoom, kind: DoorKind, place: Placement, width?: number, run?: EdgeRun | null) => boolean;

/** Doors between neighbouring reception rooms by the outer wall, and the servery's into the dining room. */
function enfilade(rooms: readonly TypedRoom[], between: Between): void {
  const joined = (a: RoomTypeId | null, b: RoomTypeId | null): boolean =>
    a !== null && b !== null && (RECEPTION.has(a) && RECEPTION.has(b) ? !NEVER_JOINED.some(([p, q]) => (a === p && b === q) || (a === q && b === p)) : (a === 'servery' && b === 'dining-room') || (a === 'dining-room' && b === 'servery'));
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!;
      const b = rooms[j]!;
      if (a.boss || b.boss || a.role !== 'band' && a.role !== 'saloon' || b.role !== 'band' && b.role !== 'saloon' || !joined(a.type, b.type)) continue;
      const run = sharedRun(a, b);
      // Only across a cross wall, at the end by the outer wall, a cell clear of its corner (a stack may cut the wall short).
      if (!run || run.cells.length < 3 || run.dir.x * (a.toCorridor?.x ?? 0) + run.dir.y * (a.toCorridor?.y ?? 0) !== 0) continue;
      const corridorFirst = (run.cells[0]!.x - run.cells[run.cells.length - 1]!.x) * (a.toCorridor?.x ?? 0) + (run.cells[0]!.y - run.cells[run.cells.length - 1]!.y) * (a.toCorridor?.y ?? 0) > 0;
      between(a, b, 'door', corridorFirst ? 'far' : 'corner', 1, run);
    }
  }
}

export function edgeDoor(cells: readonly CellPoint[], run: EdgeRun, kind: DoorKind, from: number | null, to: number): DungeonDoor {
  const [first, second] = cells;
  const wide = second ? { x: (second.x - first!.x) as -1 | 0 | 1, y: (second.y - first!.y) as -1 | 0 | 1 } : undefined;
  return { x: first!.x, y: first!.y, dir: run.dir, kind, from, to, edge: true, ...(wide && { wide }) };
}
