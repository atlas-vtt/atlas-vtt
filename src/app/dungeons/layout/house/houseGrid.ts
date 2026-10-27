/** Rectangles of cells for the house planner: `x`, `y` the first cell, `w`, `h` how many. */

import { cellKey } from '../../geometry';
import type { CellDir, CellPoint } from '../../model';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function box(x: number, y: number, w: number, h: number): Box {
  return { x, y, w, h };
}

export function boxCells(b: Box): CellPoint[] {
  const out: CellPoint[] = [];
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) out.push({ x, y });
  return out;
}

export function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

/** The box `by` cells smaller on the sides towards each of `sides`. */
export function shrunk(b: Box, sides: readonly CellDir[], by = 1): Box {
  let { x, y, w, h } = b;
  for (const s of sides) {
    if (s.x < 0) {
      x += by;
      w -= by;
    }
    if (s.x > 0) w -= by;
    if (s.y < 0) {
      y += by;
      h -= by;
    }
    if (s.y > 0) h -= by;
  }
  return { x, y, w, h };
}

/** The cells of all `boxes`, by key. */
export function keysOf(boxes: readonly Box[]): Set<string> {
  const keys = new Set<string>();
  for (const b of boxes) for (const c of boxCells(b)) keys.add(cellKey(c.x, c.y));
  return keys;
}

/** The axis a band runs along: across the way to its corridor. */
export function alongOf(toCorridor: CellDir): CellDir {
  return toCorridor.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
}

/** Where a box starts and how long it is along `along`. */
export function spanOf(b: Box, along: CellDir): [number, number] {
  return along.x !== 0 ? [b.x, b.w] : [b.y, b.h];
}

/** The part of a box from `from` for `length` cells along `along`. */
export function sliceOf(b: Box, along: CellDir, from: number, length: number): Box {
  return along.x !== 0 ? { ...b, x: from, w: length } : { ...b, y: from, h: length };
}

/** Whether a cell lies in any of `boxes`, by a set of their cells built once. */
export function inBoxes(boxes: readonly Box[]): (x: number, y: number) => boolean {
  const keys = keysOf(boxes);
  return (x, y) => keys.has(cellKey(x, y));
}
