import { hash2, valueNoise } from '../art/noise';
import { rectPoly } from '../art/paths';
import type { Bounds, Vec } from '../geometry';

/**
 * A wooden floor's boards: rows a quarter of a cell wide, so every fourth seam lies on a cell line
 * and the grid reads as the floor's own, along the room's longer side as boards are laid; each row
 * of planks of their own length, butted where they end. The same wherever it is drawn: every plank
 * follows from its place and the dungeon's seed.
 */

/** A row's width and the shortest and longest plank, in cells. */
const ROW = 0.25;
const SHORTEST = 1.25;
const LONGEST = 3;

export interface Plank {
  poly: Vec[];
  /** 0..1, the plank's own shade. */
  tone: number;
}

/** Whether the boards of a room this shape run along x (its longer side) or along y. */
export function boardsRunAlongX(b: Bounds): boolean {
  return b.maxX - b.minX >= b.maxY - b.minY;
}

/** The planks covering `b` (whole rows, from the cell lines), running along x or along y. */
export function boardPlanks(b: Bounds, alongX: boolean, seed: number): Plank[] {
  const [from, to] = alongX ? [b.minX, b.maxX] : [b.minY, b.maxY];
  const [across0, across1] = alongX ? [b.minY, b.maxY] : [b.minX, b.maxX];
  const out: Plank[] = [];
  for (let row = Math.floor(across0 / ROW); row * ROW < across1; row++) {
    const salt = seed + (alongX ? 0 : 7919);
    // Each row starts at a joint of its own, so no two rows butt in line.
    let at = Math.floor(from) - hash2(row, 3, salt) * LONGEST;
    while (at < to) {
      const length = SHORTEST + Math.round(hash2(Math.round(at * 8), row, salt + 1) * (LONGEST - SHORTEST) * 4) / 4;
      const tone = hash2(Math.round(at * 8), row, salt + 2);
      const a = row * ROW;
      out.push({ poly: alongX ? rectPoly({ x: at, y: a, w: length, h: ROW }) : rectPoly({ x: a, y: at, w: ROW, h: length }), tone });
      at += length;
    }
  }
  return out;
}

/**
 * The seams between the boards as graphite runs: each plank's leading side and its butt joint,
 * broken where the floor is worn so they never read as a ruled grid.
 */
export function boardSeams(planks: readonly Plank[], alongX: boolean, seed: number): Vec[][] {
  const runs: Vec[][] = [];
  for (const { poly } of planks) {
    const [a, b, , d] = poly as [Vec, Vec, Vec, Vec];
    // The row's seam along its first side, and the butt joint across at its start.
    const seam: [Vec, Vec] = alongX ? [a, b] : [a, d];
    const butt: [Vec, Vec] = alongX ? [a, d] : [a, b];
    for (const [p, q] of [seam, butt]) runs.push(...brokenRun(p, q, seed));
  }
  return runs;
}

/** A line from `p` to `q` in pieces, left out where the noise says the floor is worn. */
function brokenRun(p: Vec, q: Vec, seed: number): Vec[][] {
  const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.12));
  const runs: Vec[][] = [];
  let run: Vec[] = [];
  for (let k = 0; k <= n; k++) {
    const x = p.x + ((q.x - p.x) * k) / n;
    const y = p.y + ((q.y - p.y) * k) / n;
    if (valueNoise(x * 2.3, y * 2.3, seed + 9) > 0.72) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else run.push({ x, y });
  }
  if (run.length > 1) runs.push(run);
  return runs;
}
