/**
 * Cell geometry shared by layout, water, props and the renderer.
 *
 * Cells are integers; cell (x, y) covers the square [x, x + 1) × [y, y + 1). Points (columns,
 * props, water, rubble, cracks) live in that continuous space, so a cell's centre is (x + .5, y + .5).
 */

import type { CellDir, CellPoint, DungeonDoor, DungeonRoom, DungeonStack, DungeonStair } from './model';

/** An inclusive rectangle of cells. */
export interface CellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function unit(n: number): -1 | 0 | 1 {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

export function dir(x: number, y: number): CellDir {
  return { x: unit(x), y: unit(y) };
}

/** The axis turned a quarter clockwise on screen (y down). */
export function perpendicular(axis: CellDir): CellDir {
  return dir(-axis.y, axis.x);
}

export function inRect(rect: CellRect, x: number, y: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0) + 1;
}

/** Rectangles that share any cell. */
export function rectsTouch(a: CellRect, b: CellRect): boolean {
  return overlap(a.x0, a.x1, b.x0, b.x1) > 0 && overlap(a.y0, a.y1, b.y0, b.y1) > 0;
}

/** Walled rooms that overlap by more than a shared wall: more than one cell both ways. */
export function rectsClash(a: CellRect, b: CellRect): boolean {
  return overlap(a.x0, a.x1, b.x0, b.x1) > 1 && overlap(a.y0, a.y1, b.y0, b.y1) > 1;
}

/** Whether `inner` lies within `outer`. */
export function contains(outer: CellRect, inner: CellRect): boolean {
  return inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;
}

/** The overlap of two rectangles, or null. */
export function intersection(a: CellRect, b: CellRect): CellRect | null {
  const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return r.x0 <= r.x1 && r.y0 <= r.y1 ? r : null;
}

export function floorRect(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'>): CellRect {
  return { x0: room.x, y0: room.y, x1: room.x + room.w - 1, y1: room.y + room.h - 1 };
}

/** The floor with its ring of walls. */
export function wallRect(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'>): CellRect {
  return { x0: room.x - 1, y0: room.y - 1, x1: room.x + room.w, y1: room.y + room.h };
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function cellsOf(rect: CellRect): CellPoint[] {
  const cells: CellPoint[] = [];
  for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) cells.push({ x, y });
  return cells;
}

/** The cells after `from`, one `step` at a time, for as long as they lie within `rect`: the way straight in from a door. */
export function stepsWithin(rect: CellRect, from: CellPoint, step: CellDir): CellPoint[] {
  const out: CellPoint[] = [];
  for (let at = { x: from.x + step.x, y: from.y + step.y }; inRect(rect, at.x, at.y); at = { x: at.x + step.x, y: at.y + step.y }) out.push(at);
  return out;
}

/** A room's floor: the cells a cave shaped it to, else its rectangle. */
export function floorCellsOf(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells'>): CellPoint[] {
  return room.cells ?? cellsOf(floorRect(room));
}

const maskKeys = new WeakMap<readonly CellPoint[], ReadonlySet<string>>();

function keysOf(cells: readonly CellPoint[]): ReadonlySet<string> {
  let keys = maskKeys.get(cells);
  if (!keys) {
    keys = new Set(cells.map((c) => cellKey(c.x, c.y)));
    maskKeys.set(cells, keys);
  }
  return keys;
}

/** A cave room's cells as keys (`x,y`), the same set for the same mask; unset for a room that is its rectangle. */
export function maskOf(room: Pick<DungeonRoom, 'cells'>): ReadonlySet<string> | undefined {
  return room.cells && keysOf(room.cells);
}

/** Whether the cell is floor of the room: in its mask, else in its rectangle. */
export function holdsCell(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells'>, x: number, y: number): boolean {
  return room.cells ? keysOf(room.cells).has(cellKey(x, y)) : inRect(floorRect(room), x, y);
}

/** The cells a door stands in: its own, and the one beside it where it is a narrows two cells wide. */
export function doorCells(door: Pick<DungeonDoor, 'x' | 'y' | 'wide'>): CellPoint[] {
  const own = { x: door.x, y: door.y };
  return door.wide ? [own, { x: door.x + door.wide.x, y: door.y + door.wide.y }] : [own];
}

/** The cells a door stands in, which no room's floor holds: a cell door's (`doorCells`), none for a door on an edge between two floors. */
export function doorwayCells(door: Pick<DungeonDoor, 'x' | 'y' | 'wide' | 'edge'>): CellPoint[] {
  return door.edge ? [] : doorCells(door);
}

/**
 * The floor cells of `room` beside a doorway, one per cell of a wide door: just inside a cell
 * door's wall, or the cell on the room's side of a door on an edge. None where the door does not
 * open into the room.
 */
export function doorSide(door: Pick<DungeonDoor, 'x' | 'y' | 'dir' | 'wide' | 'from' | 'to' | 'edge'>, room: number): CellPoint[] {
  const step = door.from === room ? -1 : door.to === room ? 1 : 0;
  if (step === 0) return [];
  // An edge door's own cell lies on its `from` side, so the room it leads from steps nowhere.
  const by = door.edge ? (step < 0 ? 0 : 1) : step;
  return doorCells(door).map((c) => ({ x: c.x + door.dir.x * by, y: c.y + door.dir.y * by }));
}

/** The middle of a doorway, in cells: of its cells, or of the edge a door on an edge stands on. */
export function doorMiddle(door: Pick<DungeonDoor, 'x' | 'y' | 'dir' | 'wide' | 'edge'>): CellPoint {
  const cells = doorCells(door);
  const shift = door.edge ? 0.5 : 0;
  return {
    x: cells.reduce((sum, c) => sum + c.x + 0.5, 0) / cells.length + door.dir.x * shift,
    y: cells.reduce((sum, c) => sum + c.y + 0.5, 0) / cells.length + door.dir.y * shift,
  };
}

/** The smallest rectangle round some cells, as a room's `x`, `y`, `w`, `h`. */
export function cellsBox(cells: readonly CellPoint[]): { x: number; y: number; w: number; h: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cells) [x0, y0, x1, y1] = [Math.min(x0, c.x), Math.min(y0, c.y), Math.max(x1, c.x), Math.max(y1, c.y)];
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The cells of a house (`DungeonFloor.walls === 'edges'`): every room's floor and every chimney stack, by key. */
export function houseCells(floor: { rooms: readonly Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells'>[]; stacks?: readonly DungeonStack[] | undefined }): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const room of floor.rooms) for (const c of floorCellsOf(room)) keys.add(cellKey(c.x, c.y));
  for (const s of floor.stacks ?? []) for (let x = s.x; x < s.x + s.w; x++) for (let y = s.y; y < s.y + s.h; y++) keys.add(cellKey(x, y));
  return keys;
}

/** Where a door's own frame is centred: its first cell's middle, or the middle of the edge a house's door stands on. */
export function doorAnchor(door: Pick<DungeonDoor, 'x' | 'y' | 'dir' | 'wide' | 'edge'>): CellPoint {
  return door.edge ? doorMiddle(door) : { x: door.x + 0.5, y: door.y + 0.5 };
}

/** A room's floor in cells: its cave cells where it has them, else its rectangle. */
export function roomArea(room: Pick<DungeonRoom, 'w' | 'h' | 'cells'>): number {
  return room.cells?.length ?? room.w * room.h;
}

/** Whether a stairwell lies in the room's floor. */
export function holdsStairs(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells'>, stairs: readonly Pick<DungeonStair, 'x' | 'y' | 'w' | 'h'>[]): boolean {
  return stairs.some((s) => cellsOf({ x0: s.x, y0: s.y, x1: s.x + s.w - 1, y1: s.y + s.h - 1 }).every((c) => holdsCell(room, c.x, c.y)));
}
