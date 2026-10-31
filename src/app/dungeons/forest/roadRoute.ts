import { MinHeap } from '../layout/minHeap';
import type { CellPoint } from '../model';

/**
 * The cheapest way over a grid of cells, as a road is laid: each cell costs what it takes to cross
 * it (open ground little, woods more, water a great deal, what must not be built over nothing it
 * can pay), steps go to the eight neighbours, and turning costs too, more the sharper the turn, so
 * a road keeps its line and bends only where the ground asks it to. A* over (cell, heading).
 */

/** Costs by cell over a rectangle of the floor's grid; Infinity where no road may go. */
export interface CostGrid {
  x0: number;
  y0: number;
  w: number;
  h: number;
  cost: Float32Array;
}

const STEPS: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
/** What turning costs, by how many eighths of a turn: none, a gentle bend, a corner; sharper is refused. */
const TURN = [0, 0.7, 3] as const;

/**
 * The cells of the cheapest way from `from` to any cell `goal` accepts, both in the grid's cells;
 * null where there is none.
 */
export function cheapestRoute(grid: CostGrid, from: CellPoint, goal: (x: number, y: number) => boolean, towards: CellPoint): CellPoint[] | null {
  const { x0, y0, w, h, cost } = grid;
  const index = (x: number, y: number): number => (y - y0) * w + (x - x0);
  const states = w * h * 8;
  const spent = new Float32Array(states).fill(Infinity);
  const came = new Int32Array(states).fill(-1);
  const heap = new MinHeap<number>();
  // The least a cell costs, so the estimate never overstates the way left.
  const least = cost.reduce((m, c) => Math.min(m, c), Infinity);
  const estimate = (x: number, y: number): number => {
    const dx = Math.abs(x - towards.x);
    const dy = Math.abs(y - towards.y);
    return least * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  };
  for (let d = 0; d < 8; d++) {
    const s = index(from.x, from.y) * 8 + d;
    spent[s] = 0;
    heap.push(s, estimate(from.x, from.y));
  }
  for (let top = heap.pop(); top; top = heap.pop()) {
    const s = top.item;
    const cell = Math.floor(s / 8);
    const d = s % 8;
    const x = (cell % w) + x0;
    const y = Math.floor(cell / w) + y0;
    if (goal(x, y)) return walkBack(came, s, w, x0, y0);
    for (let turn = -2; turn <= 2; turn++) {
      const nd = (d + turn + 8) % 8;
      const [sx, sy] = STEPS[nd]!;
      const nx = x + sx;
      const ny = y + sy;
      if (nx < x0 || ny < y0 || nx >= x0 + w || ny >= y0 + h) continue;
      const c = cost[index(nx, ny)]!;
      if (!Number.isFinite(c)) continue;
      const next = index(nx, ny) * 8 + nd;
      const total = spent[s]! + c * (sx && sy ? Math.SQRT2 : 1) + TURN[Math.abs(turn)]!;
      if (total >= spent[next]!) continue;
      spent[next] = total;
      came[next] = s;
      heap.push(next, total + estimate(nx, ny));
    }
  }
  return null;
}

function walkBack(came: Int32Array, end: number, w: number, x0: number, y0: number): CellPoint[] {
  const cells: CellPoint[] = [];
  for (let s = end; s >= 0; s = came[s]!) {
    const cell = Math.floor(s / 8);
    cells.push({ x: (cell % w) + x0, y: Math.floor(cell / w) + y0 });
  }
  return cells.reverse();
}
