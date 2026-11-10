import { valueNoise } from '../art/noise';
import type { Vec } from '../geometry';

/**
 * Lines across a cave's floor drawn by hand: an edge, a step or a rim is a run of points, never a
 * ruled line, so the eye reads rock and not a grid. The low side of a run is named by `low`: +1 the
 * left of its direction of travel (on screen, y down), −1 its right.
 */

/** A point of a run with its unit tangent and left normal. */
export interface RunPoint {
  p: Vec;
  t: Vec;
  n: Vec;
}

/** The unit left normal at each point of a run (on screen, y down: the tangent turned a quarter anticlockwise). */
export function normalsOf(run: readonly Vec[], closed = false): Vec[] {
  const n = run.length;
  return run.map((_, i) => {
    const a = run[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const b = run[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  });
}

/** The run moved `d(i)` cells along its normals on side `side` (+1 left, −1 right). */
export function offsetRun(run: readonly Vec[], normals: readonly Vec[], d: (i: number) => number, side: number): Vec[] {
  return run.map((p, i) => ({ x: p.x + normals[i]!.x * d(i) * side, y: p.y + normals[i]!.y * d(i) * side }));
}

/** How long a run is, in cells. */
export function runLength(run: readonly Vec[], closed = false): number {
  let sum = 0;
  for (let i = 1; i < run.length + (closed ? 1 : 0); i++) {
    const a = run[i - 1]!;
    const b = run[i % run.length]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** Points every `step` cells along a run (from `start`), with their tangents and left normals. */
export function along(run: readonly Vec[], step: number, start = step / 2, closed = false): RunPoint[] {
  const out: RunPoint[] = [];
  let next = start;
  let walked = 0;
  for (let i = 1; i < run.length + (closed ? 1 : 0); i++) {
    const a = run[i - 1]!;
    const b = run[i % run.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    while (next <= walked + len) {
      const k = (next - walked) / len;
      out.push({ p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, t, n: { x: t.y, y: -t.x } });
      next += step;
    }
    walked += len;
  }
  return out;
}

/** The run cut every `step` cells, its ends kept. */
export function resampled(run: readonly Vec[], step: number, closed = false): Vec[] {
  const points = along(run, step, 0, closed).map(q => q.p);
  if (!closed) points.push(run[run.length - 1]!);
  return points;
}

/**
 * The run as a hand draws it: cut into short pieces and moved off its line by a slow wander
 * (`amplitude` cells over about a cell) and a fine tremor, the same wherever it is drawn again.
 */
export function wobbled(run: readonly Vec[], seed: number, amplitude = 0.04, closed = false): Vec[] {
  const points = resampled(run, 0.08, closed);
  const normals = normalsOf(points, closed);
  return points.map((p, i) => {
    const slow = (valueNoise(p.x * 1.1, p.y * 1.1, seed) - 0.5) * 2 * amplitude;
    const fine = (valueNoise(p.x * 9, p.y * 9, seed + 3) - 0.5) * 0.02;
    return { x: p.x + normals[i]!.x * (slow + fine), y: p.y + normals[i]!.y * (slow + fine) };
  });
}

/** A quadratic bow from `a` to `b`, `bow` cells off its chord to its left at the middle, in `n` pieces. */
export function bowed(a: Vec, b: Vec, bow: number, n = 16): Vec[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const left = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const off = 4 * t * (1 - t) * bow;
    return { x: a.x + (b.x - a.x) * t + left.x * off, y: a.y + (b.y - a.y) * t + left.y * off };
  });
}

/** Pieces of a run kept where a noise stays under `keep` (0..1): a broken line, as a crumbling lip is drawn. */
export function broken(run: readonly Vec[], seed: number, keep: number, scale = 5, closed = false): Vec[][] {
  const out: Vec[][] = [];
  let piece: Vec[] = [];
  const points = resampled(run, 0.06, closed);
  for (const p of points) {
    if (valueNoise(p.x * scale, p.y * scale, seed) < keep) piece.push(p);
    else {
      if (piece.length > 1) out.push(piece);
      piece = [];
    }
  }
  if (piece.length > 1) out.push(piece);
  return out;
}
