/**
 * The shape a band along a line through a cave's room is given before it is laid: no straight
 * file of single cells longer than three (a crack or a flow swells now and then, where nothing
 * built runs dead straight), and where the band would cut its room in two, a bridge of rock one
 * or two cells wide across it, square to the grid so it can be walked straight over.
 */

import { cellKey, dir, perpendicular } from '../../geometry';
import type { CellDir, CellPoint } from '../../model';
import { type Rng, chance, shuffled } from '../../rng';
import type { RoomCells } from '../roomCells';

/** The longest straight file of single cells a band keeps. */
const LONGEST_FILE = 3;

/** A bridge of rock over a band: its cells (on the band's), the cells it lands on either end, kept clear, and the way it runs. */
export interface RockBridge {
  cells: CellPoint[];
  landings: CellPoint[];
  facing: CellDir;
}

/** The step of a cell grid nearest a direction. */
export function snapped(angle: number): CellDir {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return Math.abs(x) >= Math.abs(y) ? { x: Math.sign(x) as -1 | 1, y: 0 } : { x: 0, y: Math.sign(y) as -1 | 1 };
}

const GRID_STEPS: readonly CellDir[] = [dir(1, 0), dir(0, 1)];

/**
 * The first straight file of single cells longer than `LONGEST_FILE` among `cells`: cells in a row
 * along a grid line, none with a cell of the band on either side of it; its cells and its way, or null.
 */
function straightFile(cells: readonly CellPoint[], has: (c: CellPoint) => boolean): { file: CellPoint[]; step: CellDir } | null {
  for (const step of GRID_STEPS) {
    const side = perpendicular(step);
    const single = (c: CellPoint): boolean => has(c) && !has({ x: c.x + side.x, y: c.y + side.y }) && !has({ x: c.x - side.x, y: c.y - side.y });
    for (const start of cells) {
      if (!single(start) || single({ x: start.x - step.x, y: start.y - step.y })) continue;
      const file = [start];
      for (let n = { x: start.x + step.x, y: start.y + step.y }; single(n); n = { x: n.x + step.x, y: n.y + step.y }) file.push(n);
      if (file.length > LONGEST_FILE) return { file, step };
    }
  }
  return null;
}

/**
 * The band with a cell laid beside every straight file of single cells longer than
 * `LONGEST_FILE`, at its third cell and every third after, on whichever side `open` lets in; null
 * where neither side does at a third cell or the one after it.
 */
export function unbroken(cells: readonly CellPoint[], rng: Rng, open: (c: CellPoint) => boolean): CellPoint[] | null {
  const out = [...cells];
  const taken = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const has = (c: CellPoint): boolean => taken.has(cellKey(c.x, c.y));
  const besideOf = (c: CellPoint, step: CellDir): CellPoint | null => {
    const side = perpendicular(step);
    for (const s of shuffled(rng, [1, -1])) {
      const n = { x: c.x + side.x * s, y: c.y + side.y * s };
      if (!has(n) && open(n)) return n;
    }
    return null;
  };
  for (let found = straightFile(out, has); found; found = straightFile(out, has)) {
    const { file, step } = found;
    const at = LONGEST_FILE - 1;
    const added = besideOf(file[at]!, step) ?? besideOf(file[at + 1]!, step);
    if (!added) return null;
    out.push(added);
    taken.add(cellKey(added.x, added.y));
  }
  return out;
}

/** The cells a band holds at grid line `u` along `along`, by their place across it, if they lie in one unbroken run; null where they do not. */
function runAt(cells: readonly CellPoint[], along: CellDir, across: CellDir, u: number): CellPoint[] | null {
  const run = cells.filter((c) => c.x * along.x + c.y * along.y === u).sort((a, b) => a.x * across.x + a.y * across.y - (b.x * across.x + b.y * across.y));
  if (run.length === 0) return null;
  const first = run[0]!.x * across.x + run[0]!.y * across.y;
  return run.every((c, i) => c.x * across.x + c.y * across.y === first + i) ? run : null;
}

/** Whether the way leads from `from` to `to` over the room's floor round the band, without crossing it. */
function leadsRound(rc: RoomCells, own: ReadonlySet<string>, from: CellPoint, to: CellPoint): boolean {
  const seen = new Set([cellKey(from.x, from.y)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const d of [dir(1, 0), dir(-1, 0), dir(0, 1), dir(0, -1)]) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      const key = cellKey(n.x, n.y);
      if (seen.has(key) || own.has(key) || !rc.isFloor(n) || rc.isBlocked(n)) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return false;
}

/**
 * A bridge of rock across the band near its middle, one or two cells wide, each of its lines one
 * unbroken run across the band landing on free floor at both ends that the way cannot join round
 * it; the first such that leaves the room whole, or null where none does.
 */
export function bandBridge(rc: RoomCells, rng: Rng, angle: number, cells: readonly CellPoint[]): RockBridge | null {
  const along = snapped(angle);
  const across = perpendicular(along);
  const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const us = cells.map((c) => c.x * along.x + c.y * along.y).sort((a, b) => a - b);
  const middle = us[Math.floor(us.length / 2)]!;
  const lands = (c: CellPoint): boolean => rc.isFloor(c) && !rc.isBlocked(c) && !rc.nearStairs(c) && !own.has(cellKey(c.x, c.y));
  const widths = chance(rng, 0.5) ? [2, 1] : [1, 2];
  for (const width of widths) {
    for (const u of [middle, middle - 1, middle + 1, middle - 2, middle + 2]) {
      const runs = Array.from({ length: width }, (_, k) => runAt(cells, along, across, u + k));
      if (runs.some((run) => run === null)) continue;
      const landings = runs.flatMap((run) => [
        { x: run![0]!.x - across.x, y: run![0]!.y - across.y },
        { x: run![run!.length - 1]!.x + across.x, y: run![run!.length - 1]!.y + across.y },
      ]);
      const bridge = runs.flat() as CellPoint[];
      const needed = landings.every((c, i) => i % 2 === 1 || !leadsRound(rc, own, c, landings[i + 1]!));
      if (landings.every(lands) && needed && rc.allows(cells, 'block', bridge)) return { cells: bridge, landings, facing: across };
    }
  }
  return null;
}
