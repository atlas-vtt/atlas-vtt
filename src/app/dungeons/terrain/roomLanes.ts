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

/** A shortest 4-connected way over the room's walkable floor from `from` to `to`, both included; [] where none leads. */
function lane(rc: RoomCells, from: CellPoint, to: CellPoint): CellPoint[] {
  const back = new Map<string, CellPoint | null>([[cellKey(from.x, from.y), null]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as CellPoint;
    if (at.x === to.x && at.y === to.y) {
      const path: CellPoint[] = [];
      for (let c: CellPoint | null = at; c; c = back.get(cellKey(c.x, c.y)) ?? null) path.push(c);
      return path.reverse();
    }
    for (const d of STEPS) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      const key = cellKey(next.x, next.y);
      if (back.has(key) || !rc.isFloor(next) || rc.isBlocked(next)) continue;
      back.set(key, at);
      queue.push(next);
    }
  }
  return [];
}

/** Keeps a straight-as-it-gets lane clear between every pair of the room's needed cells, so nothing stands between doors and stairs. */
export function reserveLanes(rc: RoomCells): void {
  const needed = rc.needed;
  for (let a = 0; a < needed.length; a++) {
    for (let b = a + 1; b < needed.length; b++) rc.keepClear(lane(rc, needed[a] as CellPoint, needed[b] as CellPoint));
  }
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
