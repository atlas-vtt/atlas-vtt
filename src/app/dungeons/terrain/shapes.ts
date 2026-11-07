/**
 * Shapes of whole cells in a room's own frame (`RoomCells`: `i` along the axis, `j` across):
 * bands that run from wall to wall across the way through, jagged blobs, runs along a wall.
 * Each returns cells only; whether they may be taken is the room's to say.
 */

import type { CellPoint } from '../model';
import { cellKey } from '../geometry';
import { type Rng, chance, int } from '../rng';
import type { RoomCells } from './roomCells';

/** A band across the room, rows `i0` to `i0 + thickness - 1` give or take a jagged edge, and the cells a bridge takes across it. */
export interface Band {
  cells: CellPoint[];
  bridge: CellPoint[];
}

/**
 * A band across the room from wall to wall (or stopping one cell short of one wall, so a longer
 * way leads round it), `thickness` rows deep from row `i0`, its far edge stepping by a row here
 * and there when `jagged`. Its bridge runs straight across it at column `bridgeJ`, or none at -1.
 */
export function bandAcross(rc: RoomCells, rng: Rng, i0: number, thickness: number, options: { jagged: boolean; gapAt: -1 | 0 | 1; bridgeJ: number }): Band {
  const cells: CellPoint[] = [];
  const bridge: CellPoint[] = [];
  let extra = 0;
  for (let j = 0; j < rc.width; j++) {
    if ((options.gapAt === 0 && j === 0) || (options.gapAt === 1 && j === rc.width - 1)) continue;
    if (options.jagged && j !== options.bridgeJ && chance(rng, 0.35)) extra = extra === 0 ? (chance(rng, 0.5) ? 1 : -1) : 0;
    const top = i0 + Math.min(0, extra);
    const bottom = i0 + thickness - 1 + Math.max(0, extra);
    for (let i = top; i <= bottom; i++) {
      const c = rc.cell(i, j);
      cells.push(c);
      if (j === options.bridgeJ) bridge.push(c);
    }
  }
  return { cells, bridge };
}

/** A rectangle of `di` × `dj` cells at (i, j) with each corner cell dropped half the time where both sides are at least three. */
export function jaggedBlock(rc: RoomCells, rng: Rng, i: number, j: number, di: number, dj: number, irregular = false): CellPoint[] {
  const cells = rc.block(i, j, di, dj);
  if (di < 3 || dj < 3) return cells;
  const all = [rc.cell(i, j), rc.cell(i, j + dj - 1), rc.cell(i + di - 1, j), rc.cell(i + di - 1, j + dj - 1)];
  const dropped = all.filter(() => chance(rng, 0.5));
  // A natural hole is never a plain rectangle: it loses a corner at least.
  if (irregular && dropped.length === 0) dropped.push(all[Math.floor(rng() * all.length)] as CellPoint);
  const corners = new Set(dropped.map((c) => cellKey(c.x, c.y)));
  return cells.filter((c) => !corners.has(cellKey(c.x, c.y)));
}

/** A blob of up to `size` cells grown from `start` by random steps among free cells, never thinner than a cell. */
export function grownBlob(rc: RoomCells, rng: Rng, start: CellPoint, size: number): CellPoint[] {
  if (!rc.isFree(start)) return [];
  const out = [start];
  const seen = new Set([cellKey(start.x, start.y)]);
  for (let tries = 0; out.length < size && tries < size * 6; tries++) {
    const from = out[int(rng, 0, out.length - 1)] as CellPoint;
    const step = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ][int(rng, 0, 3)] as CellPoint;
    const next = { x: from.x + step.x, y: from.y + step.y };
    const key = cellKey(next.x, next.y);
    if (seen.has(key) || !rc.isFree(next)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

/** The longest run of free cells along the wall at `j` (0 or `width - 1`), between rows `from` and `to`. */
export function freeRunAlong(rc: RoomCells, j: number, from: number, to: number): CellPoint[] {
  let best: CellPoint[] = [];
  let run: CellPoint[] = [];
  for (let i = from; i <= to; i++) {
    const c = rc.cell(i, j);
    if (rc.isFree(c)) run.push(c);
    else run = [];
    if (run.length > best.length) best = [...run];
  }
  return best;
}

/** Whether no cell of `cells` lies beside (or on) a cell another piece in the room fills: pieces stand apart. */
export function standsApart(rc: RoomCells, cells: readonly CellPoint[], taken: ReadonlySet<string>): boolean {
  return cells.every((c) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (taken.has(cellKey(c.x + dx, c.y + dy))) return false;
    return rc.isFloor(c);
  });
}
