import { cellKey, cellsOf, doorCells, floorCellsOf } from '../../../../src/app/dungeons/geometry';
import type { CellDir, CellPoint, DungeonDoor, DungeonFloor, DungeonModel, DungeonStair } from '../../../../src/app/dungeons/model';
import { approachCells, spotRect } from '../../../../src/app/dungeons/floors/stairSpots';
import { stackOf, stairEnd } from '../../../../src/app/dungeons/floors/floorStack';

/** Cell lookups over a generated house, written apart from the planner for the house rules. */

export const SIDES: readonly CellDir[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Which room holds each cell of a floor, by key. */
export function owners(floor: DungeonFloor): Map<string, number> {
  const out = new Map<string, number>();
  for (const room of floor.rooms) for (const c of floorCellsOf(room)) out.set(cellKey(c.x, c.y), room.id);
  return out;
}

export function stackCells(floor: DungeonFloor): Set<string> {
  return new Set((floor.stacks ?? []).flatMap((s) => cellsOf({ x0: s.x, y0: s.y, x1: s.x + s.w - 1, y1: s.y + s.h - 1 }).map((c) => cellKey(c.x, c.y))));
}

/** Every cell of the house on a floor: its rooms and its stacks. */
export function houseKeys(floor: DungeonFloor): Set<string> {
  return new Set([...owners(floor).keys(), ...stackCells(floor)]);
}

/** The cells a door's way runs between: the side of `from` and the side of `to` (outside for an entrance). */
export function doorSides(door: DungeonDoor): { from: CellPoint[]; to: CellPoint[] } {
  const cells = doorCells(door);
  return { from: cells, to: cells.map((c) => ({ x: c.x + door.dir.x, y: c.y + door.dir.y })) };
}

/** Stairwell cells and the rows they are reached from, on the floor `index` of the model. */
export function stairKeys(model: DungeonModel, index: number): { cells: Set<string>; approach: Set<string> } {
  const floor = model.floors[index]!;
  const stack = stackOf(model);
  const cells = new Set(floor.stairs.flatMap((s) => cellsOf(spotRect(s)).map((c) => cellKey(c.x, c.y))));
  const approach = new Set(floor.stairs.flatMap((s: DungeonStair) => approachCells(s, stairEnd(stack, index, s.to)).map((c) => cellKey(c.x, c.y))));
  return { cells, approach };
}

/** The rooms reached from room 0 of a floor through its doors. */
export function reached(floor: DungeonFloor): Set<number> {
  const seen = new Set<number>([0]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of floor.doors) {
      if (d.from === null || d.to === null) continue;
      if (seen.has(d.from) !== seen.has(d.to)) {
        seen.add(d.from);
        seen.add(d.to);
        grew = true;
      }
    }
  }
  return seen;
}

/** Whether two rooms share an edge. */
export function touching(own: ReadonlyMap<string, number>, a: number, b: number): boolean {
  for (const [key, id] of own) {
    if (id !== a) continue;
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (SIDES.some((s) => own.get(cellKey(x + s.x, y + s.y)) === b)) return true;
  }
  return false;
}

/** The edges between cells of different rooms, or a room and the outside, as `x,y>dx,dy` from the room's cell. */
export function wallEdges(floor: DungeonFloor): Set<string> {
  const own = owners(floor);
  const stacks = stackCells(floor);
  const out = new Set<string>();
  for (const [key, id] of own) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    for (const s of SIDES) {
      const k = cellKey(x + s.x, y + s.y);
      if (own.get(k) !== id && !stacks.has(k)) out.add(`${key}>${s.x},${s.y}`);
    }
  }
  return out;
}
