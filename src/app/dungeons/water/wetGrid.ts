/**
 * Which cells are under water. Floors below the level are wet; so are the walls around them,
 * so pools reach the walls, except where a wall also borders a dry floor: water never shows
 * through a wall into the next room. Enclosed dry pockets are filled, so every pool is one outline.
 */

import type { CellPoint, DungeonRoom } from '../model';
import { floorCellsOf } from '../geometry';

export interface CellGrid {
  /** Cell coordinates of index 0. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export const DRY = 0;
export const WET = 1;

/** The cells' extent grown by `pad` cells all round. */
export function gridOver(cells: readonly CellPoint[], pad: number): CellGrid {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
  }
  return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + 1 + 2 * pad, h: y1 - y0 + 1 + 2 * pad };
}

/** The rooms' walled extent with one free cell all round. */
export function gridAround(rooms: readonly DungeonRoom[]): CellGrid {
  return gridOver(floorCells(rooms), 2);
}

/** Cells marked on a grid round them (`pad` free cells all round), for tracing. */
export function cellMask(cells: readonly CellPoint[], pad = 1): { grid: CellGrid; marks: Uint8Array } {
  const grid = gridOver(cells, pad);
  const marks = new Uint8Array(grid.w * grid.h);
  for (const c of cells) marks[indexOf(grid, c.x, c.y)] = WET;
  return { grid, marks };
}

export function indexOf(grid: CellGrid, x: number, y: number): number {
  const gx = x - grid.x0;
  const gy = y - grid.y0;
  return gx < 0 || gy < 0 || gx >= grid.w || gy >= grid.h ? -1 : gy * grid.w + gx;
}

export function floorCells(rooms: readonly DungeonRoom[]): CellPoint[] {
  return rooms.flatMap((room) => floorCellsOf(room));
}

/** The rooms' floor cells marked on the grid. */
export function floorMarks(grid: CellGrid, rooms: readonly DungeonRoom[]): Uint8Array {
  const marks = new Uint8Array(grid.w * grid.h);
  for (const c of floorCells(rooms)) marks[indexOf(grid, c.x, c.y)] = 1;
  return marks;
}

const NEAR4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEAR8: readonly (readonly [number, number])[] = [...NEAR4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The floor and the walls round it: every cell a floor cell is among the eight neighbours of, or is. */
export function wallMarks(grid: CellGrid, floor: Uint8Array): Uint8Array {
  const walled = new Uint8Array(floor.length);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (!floor[y * grid.w + x]) continue;
      walled[y * grid.w + x] = 1;
      for (const [dx, dy] of NEAR8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < grid.w && ny < grid.h) walled[ny * grid.w + nx] = 1;
      }
    }
  }
  return walled;
}

function fillPockets(grid: CellGrid, wet: Uint8Array, keepDry?: Uint8Array): void {
  const outside = new Uint8Array(wet.length);
  const stack = [0];
  outside[0] = 1;
  while (stack.length > 0) {
    const at = stack.pop() as number;
    const x = at % grid.w;
    const y = (at - x) / grid.w;
    for (const [dx, dy] of NEAR4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const next = ny * grid.w + nx;
      if (outside[next] || wet[next] === WET) continue;
      outside[next] = 1;
      stack.push(next);
    }
  }
  outside.forEach((out, i) => {
    if (!out && !keepDry?.[i]) wet[i] = WET;
  });
}

/**
 * The wet cells: `floor` marks the floor cells (`floorMarks`), `wetFloor` the wet ones by grid
 * index; cells set in `keepDry` stay dry, an island where water surrounds them.
 */
export function wetGrid(grid: CellGrid, floor: Uint8Array, wetFloor: Uint8Array, keepDry?: Uint8Array): Uint8Array {
  const walled = wallMarks(grid, floor);
  const wet = new Uint8Array(wetFloor);
  const at = (x: number, y: number, marks: Uint8Array): number => (x < 0 || y < 0 || x >= grid.w || y >= grid.h ? 0 : (marks[y * grid.w + x] ?? 0));
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      if (!walled[i] || floor[i]) continue;
      const nearWet = NEAR8.some(([dx, dy]) => at(x + dx, y + dy, wetFloor) === WET);
      const nearDry = NEAR4.some(([dx, dy]) => at(x + dx, y + dy, floor) === 1 && at(x + dx, y + dy, wetFloor) !== WET);
      if (nearWet && !nearDry) wet[i] = WET;
    }
  }
  fillPockets(grid, wet, keepDry);
  return wet;
}

/** The most cells a puddle has that is dropped beside a larger body of water. */
const PUDDLE = 3;
/** How near, in cells, a larger body lies to drop a puddle beside it. */
const PUDDLE_REACH = 2;

/**
 * Dries every puddle (at most `PUDDLE` cells, none of them in `keep`) that lies within
 * `PUDDLE_REACH` cells of a body of water at least three times its size: a puddle beside a lake
 * reads as a stray mark of it, never as water of its own.
 */
export function dropPuddles(grid: CellGrid, wet: Uint8Array, keep: Uint8Array): void {
  const body = new Int32Array(wet.length).fill(-1);
  const sizes: number[] = [];
  const members: number[][] = [];
  for (let start = 0; start < wet.length; start++) {
    if (wet[start] !== WET || body[start]! >= 0) continue;
    const id = sizes.length;
    const cells = [start];
    body[start] = id;
    for (let k = 0; k < cells.length; k++) {
      const at = cells[k]!;
      const x = at % grid.w;
      const y = (at - x) / grid.w;
      for (const [dx, dy] of NEAR8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const next = ny * grid.w + nx;
        if (wet[next] !== WET || body[next]! >= 0) continue;
        body[next] = id;
        cells.push(next);
      }
    }
    sizes.push(cells.length);
    members.push(cells);
  }
  members.forEach((cells, id) => {
    const size = sizes[id]!;
    if (size > PUDDLE || cells.some((i) => keep[i])) return;
    const beside = cells.some((at) => {
      const x = at % grid.w;
      const y = (at - x) / grid.w;
      for (let dy = -PUDDLE_REACH; dy <= PUDDLE_REACH; dy++) for (let dx = -PUDDLE_REACH; dx <= PUDDLE_REACH; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const other = body[ny * grid.w + nx]!;
        if (other >= 0 && other !== id && sizes[other]! >= size * 3) return true;
      }
      return false;
    });
    if (beside) for (const i of cells) wet[i] = DRY;
  });
}
