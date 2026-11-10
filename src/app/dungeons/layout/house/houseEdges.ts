/**
 * The edges between a house's rooms, in cells: where two rooms meet (a run of edges along one wall)
 * or a room meets the outside, and where along such a run a door goes, a cell clear of the run's
 * ends where it is three cells long or more, never before stairs.
 */

import { cellKey } from '../../geometry';
import type { CellDir, CellPoint } from '../../model';
import { boxCells, inBox } from './houseGrid';
import type { StoreyRoom } from './houseStorey';

/** A run of edges: the cells on one side, in order along the wall, and the way across it. */
export interface EdgeRun {
  cells: CellPoint[];
  dir: CellDir;
}

export const SIDES: readonly CellDir[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** A room's floor: its box but for the stack cut from it. */
export function roomCells(room: Pick<StoreyRoom, 'box' | 'notch'>): CellPoint[] {
  const { notch } = room;
  return boxCells(room.box).filter((c) => !notch || !inBox(notch, c.x, c.y));
}

export function holds(room: Pick<StoreyRoom, 'box' | 'notch'>, x: number, y: number): boolean {
  return inBox(room.box, x, y) && !(room.notch && inBox(room.notch, x, y));
}

/** The edges of `room` towards `dir` whose far cell passes `beyond`, as runs of neighbouring cells. */
export function runsOf(room: Pick<StoreyRoom, 'box' | 'notch'>, dir: CellDir, beyond: (x: number, y: number) => boolean): EdgeRun[] {
  const cells = roomCells(room)
    .filter((c) => !holds(room, c.x + dir.x, c.y + dir.y) && beyond(c.x + dir.x, c.y + dir.y))
    .sort((p, q) => p.x - q.x || p.y - q.y);
  const runs: EdgeRun[] = [];
  for (const c of cells) {
    const last = runs[runs.length - 1];
    const prev = last?.cells[last.cells.length - 1];
    const along = dir.x !== 0 ? prev?.x === c.x && prev.y === c.y - 1 : prev?.y === c.y && prev.x === c.x - 1;
    if (last && along) last.cells.push(c);
    else runs.push({ cells: [c], dir });
  }
  return runs;
}

/** The longest run of edges from `a` into `b`, or null where they share none. */
export function sharedRun(a: Pick<StoreyRoom, 'box' | 'notch'>, b: Pick<StoreyRoom, 'box' | 'notch'>): EdgeRun | null {
  let best: EdgeRun | null = null;
  for (const dir of SIDES) for (const run of runsOf(a, dir, (x, y) => holds(b, x, y))) if (!best || run.cells.length > best.cells.length) best = run;
  return best;
}

export type Placement = 'corner' | 'centre' | 'far';

/**
 * Where on a run a door `width` cells wide stands: a cell clear of the run's ends where it is three
 * long or more; at its middle (`centre`), at its start's end (`corner`) or its other end (`far`);
 * never where a cell on either side is `blocked`. Null where it fits nowhere.
 */
export function doorPlace(run: EdgeRun, place: Placement, width: number, blocked: ReadonlySet<string>): CellPoint[] | null {
  const n = run.cells.length;
  const margin = n >= width + 2 ? 1 : 0;
  const starts: number[] = [];
  for (let k = margin; k + width <= n - margin; k++) starts.push(k);
  const mid = (n - width) / 2;
  const order = place === 'centre' ? starts.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q) : place === 'far' ? starts.reverse() : starts;
  for (const k of order) {
    const cells = run.cells.slice(k, k + width);
    const clear = cells.every((c) => !blocked.has(cellKey(c.x, c.y)) && !blocked.has(cellKey(c.x + run.dir.x, c.y + run.dir.y)));
    if (clear) return cells;
  }
  return null;
}
