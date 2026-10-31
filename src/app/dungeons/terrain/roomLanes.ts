/**
 * The walkable lanes a furnished room keeps: one shortest way between every pair of the cells it
 * must keep reachable (before its doors, onto its stairs), and the cells around a piece its clear
 * side names.
 */

import { cellKey, dir } from '../geometry';
import type { CellDir, CellPoint } from '../model';
import type { PropSpec } from '../props/catalogue';
import type { RoomCells } from './roomCells';

const STEPS: readonly CellDir[] = [dir(0, -1), dir(1, 0), dir(0, 1), dir(-1, 0)];

/**
 * The shortest 4-connected ways over the room's walkable floor (but `blocked`) from `from` to
 * every cell of `to`: each cell's step back towards `from`. A breadth-first search gives a cell its
 * step when it first meets it and never changes it, so one search serves the way to every cell,
 * and it stops once it has met them all.
 */
function waysFrom(rc: RoomCells, from: CellPoint, to: readonly CellPoint[], blocked: ReadonlySet<string>): Map<string, CellPoint | null> {
  const back = new Map<string, CellPoint | null>([[cellKey(from.x, from.y), null]]);
  const queue = [from];
  const unmet = new Set(to.map((c) => cellKey(c.x, c.y)));
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as CellPoint;
    unmet.delete(cellKey(at.x, at.y));
    if (unmet.size === 0) break;
    for (const d of STEPS) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      const key = cellKey(next.x, next.y);
      if (back.has(key) || !rc.isFloor(next) || rc.isBlocked(next) || blocked.has(key)) continue;
      back.set(key, at);
      queue.push(next);
    }
  }
  return back;
}

/** The way from the search's start to `to`, both included; [] where none leads. */
function wayTo(back: ReadonlyMap<string, CellPoint | null>, to: CellPoint): CellPoint[] {
  if (!back.has(cellKey(to.x, to.y))) return [];
  const path: CellPoint[] = [];
  for (let c: CellPoint | null = to; c; c = back.get(cellKey(c.x, c.y)) ?? null) path.push(c);
  return path.reverse();
}

/** The cells of a straight-as-it-gets lane between every pair of the room's needed cells, with `blocked` blocked too. */
export function laneCells(rc: RoomCells, blocked: ReadonlySet<string> = new Set()): CellPoint[] {
  const needed = rc.needed;
  const out: CellPoint[] = [];
  for (let a = 0; a + 1 < needed.length; a++) {
    const targets = needed.slice(a + 1);
    const back = waysFrom(rc, needed[a] as CellPoint, targets, blocked);
    for (const to of targets) out.push(...wayTo(back, to));
  }
  return out;
}

/** Keeps a straight-as-it-gets lane clear between every pair of the room's needed cells, so nothing stands between doors and stairs. */
export function reserveLanes(rc: RoomCells): void {
  rc.keepClear(laneCells(rc));
}

/**
 * The cells a piece standing on `cells` and facing `facing` keeps walkable: the row before it
 * (`front`) or every cell beside it (`ring`); only cells of the room's floor.
 */
export function clearCells(rc: RoomCells, cells: readonly CellPoint[], spec: PropSpec, facing: CellDir): CellPoint[] {
  const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const around = (offsets: readonly CellDir[]): CellPoint[] => {
    const out = new Map<string, CellPoint>();
    for (const c of cells) {
      for (const d of offsets) {
        const next = { x: c.x + d.x, y: c.y + d.y };
        const key = cellKey(next.x, next.y);
        if (!own.has(key) && rc.isFloor(next)) out.set(key, next);
      }
    }
    return [...out.values()];
  };
  switch (spec.clear) {
    case 'front':
      return around([facing]);
    case 'ring':
      return around(STEPS);
    case 'none':
      return [];
  }
}
