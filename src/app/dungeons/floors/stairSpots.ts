/**
 * Where a stairwell may stand in a room: a rectangle of 1 × 2 to 2 × 3 cells inside the floor,
 * against a wall, off the cells before its doors, and reached from a row of free floor (before
 * its high end on the upper floor, past its low end on the lower), with all the room's other floor
 * still one, so whatever door opens onto it later reaches the stairs. The same rectangle must fit both rooms it joins.
 */

import type { CellDir, CellPoint, DungeonDoor, DungeonRoom, DungeonStair } from '../model';
import { type CellRect, cellKey, cellsOf, dir, doorSide, floorRect, inRect, intersection } from '../geometry';

/**
 * The upper end is where the treads start down; the lower end is where they arrive. Ends are
 * physical: which floor holds which follows the stack (`floorStack.stairEnd`), not planning order.
 */
export type StairEnd = 'upper' | 'lower';

export type StairSpot = Pick<DungeonStair, 'x' | 'y' | 'w' | 'h' | 'down'>;

/** Along the treads' way down, then across it. */
const SHAPES: readonly (readonly [number, number])[] = [
  [2, 1],
  [3, 1],
  [2, 2],
  [3, 2],
];
export const STAIR_DIRS: readonly CellDir[] = [dir(0, 1), dir(1, 0), dir(0, -1), dir(-1, 0)];

/** What of a room a stairwell needs to know. */
export type StairRoom = Pick<DungeonRoom, 'id' | 'x' | 'y' | 'w' | 'h' | 'kind' | 'rotunda'>;

/** What a floor holds that a stairwell must keep clear of. */
export interface FloorSpace {
  doors: readonly DungeonDoor[];
  stairs: readonly StairSpot[];
  /** Each stair's end on this floor, by its index in `stairs`. */
  ends: readonly StairEnd[];
}

export function spotRect(spot: StairSpot): CellRect {
  return { x0: spot.x, y0: spot.y, x1: spot.x + spot.w - 1, y1: spot.y + spot.h - 1 };
}

/** The row of cells an end is reached from: before the high end above, past the low end below. */
export function approachCells(spot: StairSpot, end: StairEnd): CellPoint[] {
  const r = spotRect(spot);
  const side = end === 'upper' ? dir(-spot.down.x, -spot.down.y) : spot.down;
  if (side.x !== 0) {
    const x = side.x > 0 ? r.x1 + 1 : r.x0 - 1;
    return cellsOf({ x0: x, y0: r.y0, x1: x, y1: r.y1 });
  }
  const y = side.y > 0 ? r.y1 + 1 : r.y0 - 1;
  return cellsOf({ x0: r.x0, y0: y, x1: r.x1, y1: y });
}

/** Every stairwell, the rows it is reached from at either end and the cells round them, by key: what nothing low may crowd. */
export function stairsAndAround(stairs: readonly StairSpot[]): string[] {
  const cells = stairs.flatMap((s) => [...cellsOf(spotRect(s)), ...approachCells(s, 'upper'), ...approachCells(s, 'lower')]);
  return cells.flatMap((c) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => cellKey(c.x + dx, c.y + dy))));
}

/** The floor cells just inside a room's doors, one before each cell of a wide narrows. */
export function doorApproaches(room: Pick<DungeonRoom, 'id'>, doors: readonly DungeonDoor[]): CellPoint[] {
  return doors.flatMap((door) => doorSide(door, room.id));
}

/** Whether the `free` cells (keys of `cells`) are all reachable from each other, side by side. */
function connected(free: ReadonlySet<string>, cells: readonly CellPoint[]): boolean {
  const first = cells.find((c) => free.has(cellKey(c.x, c.y)));
  if (!first) return true;
  const seen = new Set([cellKey(first.x, first.y)]);
  const queue = [first];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as CellPoint;
    for (const d of STAIR_DIRS) {
      const key = cellKey(at.x + d.x, at.y + d.y);
      if (!free.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: at.x + d.x, y: at.y + d.y });
    }
  }
  return seen.size === free.size;
}

/** Whether taking `cut` out of `floor` leaves two pieces: it reaches from one wall to the opposite one, wall left on either side. */
function splits(floor: CellRect, cut: CellRect): boolean {
  const across = cut.y0 <= floor.y0 && cut.y1 >= floor.y1 && cut.x0 > floor.x0 && cut.x1 < floor.x1;
  const along = cut.x0 <= floor.x0 && cut.x1 >= floor.x1 && cut.y0 > floor.y0 && cut.y1 < floor.y1;
  return across || along;
}

function touchesWall(r: CellRect, floor: CellRect, open: CellDir): boolean {
  const sides: [boolean, CellDir][] = [
    [r.x0 === floor.x0, dir(-1, 0)],
    [r.x1 === floor.x1, dir(1, 0)],
    [r.y0 === floor.y0, dir(0, -1)],
    [r.y1 === floor.y1, dir(0, 1)],
  ];
  return sides.some(([touching, side]) => touching && (side.x !== open.x || side.y !== open.y));
}

/** Whether a stairwell end may stand at `spot` in `room` of the floor `space` describes. */
export function spotFits(room: StairRoom, space: FloorSpace, spot: StairSpot, end: StairEnd): boolean {
  if (room.kind !== 'room' || room.rotunda) return false;
  const floor = floorRect(room);
  const rect = spotRect(spot);
  const cells = cellsOf(rect);
  if (!cells.every((c) => inRect(floor, c.x, c.y))) return false;
  const open = end === 'upper' ? dir(-spot.down.x, -spot.down.y) : spot.down;
  if (!touchesWall(rect, floor, open)) return false;
  const inFloor = (c: CellPoint): boolean => inRect(floor, c.x, c.y);
  const taken = new Set(space.stairs.flatMap((s) => cellsOf(spotRect(s))).map((c) => cellKey(c.x, c.y)));
  const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const approach = approachCells(spot, end);
  const needed = [
    ...doorApproaches(room, space.doors),
    ...space.stairs.flatMap((s, k) => approachCells(s, space.ends[k] ?? 'upper')).filter(inFloor),
    ...approach,
  ];
  if (!approach.every(inFloor) || cells.some((c) => taken.has(cellKey(c.x, c.y)))) return false;
  if (needed.some((c) => own.has(cellKey(c.x, c.y)) || taken.has(cellKey(c.x, c.y)))) return false;
  // A rectangle less one rectangle stays one piece unless the cut runs wall to wall through its middle.
  if (!space.stairs.some((s) => intersection(spotRect(s), floor))) return !splits(floor, rect);
  const floorCells = cellsOf(floor);
  const free = new Set(floorCells.map((c) => cellKey(c.x, c.y)).filter((key) => !taken.has(key) && !own.has(key)));
  return connected(free, floorCells);
}

/** Every stairwell rectangle that lies inside `rect`, in every direction and shape at least `least` cells across. */
export function spotsWithin(rect: CellRect, least = 1): StairSpot[] {
  const out: StairSpot[] = [];
  for (const down of STAIR_DIRS) {
    for (const [along, across] of SHAPES) {
      if (across < least) continue;
      const w = down.x !== 0 ? along : across;
      const h = down.x !== 0 ? across : along;
      for (let y = rect.y0; y + h - 1 <= rect.y1; y++) for (let x = rect.x0; x + w - 1 <= rect.x1; x++) out.push({ x, y, w, h, down });
    }
  }
  return out;
}

/** Every cell within `reach` of an entrance from the outside, by key: where a cave's water keeps off, so it never meets the floor's straight edge at a mouth. */
export function entrancesAndAround(doors: readonly DungeonDoor[], reach = 2): string[] {
  const cells = doors.filter((door) => door.from === null).flatMap((door) => [{ x: door.x, y: door.y }, ...(door.wide ? [{ x: door.x + door.wide.x, y: door.y + door.wide.y }] : [])]);
  const out: string[] = [];
  for (const c of cells) for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) out.push(cellKey(c.x + dx, c.y + dy));
  return out;
}
