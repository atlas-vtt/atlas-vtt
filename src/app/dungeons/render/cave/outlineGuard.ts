/**
 * Whether a drawn cave outline tells the truth about its cells, and where it does not. The drawing
 * is free, but the grid and the drawing must agree for movement: a floor cell has its middle on
 * drawn floor and at least `FLOOR_SHARE` of it drawn floor; a rock cell has its middle on rock and
 * at most `ROCK_SHARE` of it drawn floor. In a kept cell (the way through, where something stands)
 * no wall enters the middle `CELL_CORE` at all. And the outline is one clean ring per piece: no
 * ring crosses itself or another.
 */

import type { CellPoint } from '../../model';
import type { CellGrid } from '../../water/wetGrid';
import type { Vec } from '../geometry';

/** Samples a cell is read with, each way; odd, so one lies on the cell's middle. */
const SAMPLES = 7;
const MIDDLE = (SAMPLES - 1) / 2;
/** The least of a floor cell drawn floor, and the most of a rock cell: a margin inside 60 % and 40 % for the coarse sampling. */
export const FLOOR_SHARE = 0.66;
export const ROCK_SHARE = 0.34;
const EPS = 1e-12;
/** The share of a kept cell, about its middle, that no wall enters, each way. */
export const CELL_CORE = 0.6;
const CORE_MARGIN = (1 - CELL_CORE) / 2;

type IsFloor = (x: number, y: number) => boolean;

/** Where the outline misleads: cells drawn as the other kind, and the corners of segments that cross. */
export interface OutlineFaults {
  cells: CellPoint[];
  /** Per ring, the indices of segments (from corner i to i + 1) that cross another. */
  crossings: Set<number>[];
}

/**
 * How many of each cell's samples lie on drawn floor (non-zero winding over every ring), over the
 * box grown by one cell. Each sample row is cut into the spans the rings fill; a cell a span covers
 * whole is added through a difference array per cell row, so the cost follows the outline, not the
 * floor's area.
 */
function drawnSamples(rings: readonly Vec[][], box: CellGrid): { counts: Uint16Array; middles: Uint8Array; x0: number; y0: number; w: number; h: number } {
  const x0 = box.x0 - 1;
  const y0 = box.y0 - 1;
  const w = box.w + 2;
  const h = box.h + 2;
  const rows: number[][] = Array.from({ length: h * SAMPLES }, () => []);
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (a.y === b.y) continue;
      const lo = Math.max(0, Math.ceil((Math.min(a.y, b.y) - y0) * SAMPLES - 0.5));
      const hi = Math.min(rows.length - 1, Math.ceil((Math.max(a.y, b.y) - y0) * SAMPLES - 0.5) - 1);
      const up = b.y > a.y ? 1 : -1;
      for (let r = lo; r <= hi; r++) {
        const y = y0 + (r + 0.5) / SAMPLES;
        const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
        rows[r]!.push(x, up);
      }
    }
  }
  const counts = new Uint16Array(w * h);
  const middles = new Uint8Array(w * h);
  const whole = new Int32Array(w + 1);
  const middle = new Int32Array(w + 1);
  for (let cy = 0; cy < h; cy++) {
    whole.fill(0);
    for (let sr = 0; sr < SAMPLES; sr++) {
      const row = rows[cy * SAMPLES + sr]!;
      const pairs: [number, number][] = [];
      for (let k = 0; k < row.length; k += 2) pairs.push([row[k]!, row[k + 1]!]);
      pairs.sort((p, q) => p[0] - q[0]);
      const middleRow = sr === MIDDLE;
      if (middleRow) middle.fill(0);
      let winding = 0;
      for (let k = 0; k < pairs.length - 1; k++) {
        winding += pairs[k]![1];
        if (winding === 0) continue;
        const first = Math.max(0, Math.ceil((pairs[k]![0] - x0) * SAMPLES - 0.5));
        const last = Math.min(w * SAMPLES - 1, Math.ceil((pairs[k + 1]![0] - x0) * SAMPLES - 0.5) - 1);
        if (first > last) continue;
        const cf = Math.floor(first / SAMPLES);
        const cl = Math.floor(last / SAMPLES);
        if (cf === cl) counts[cy * w + cf]! += last - first + 1;
        else {
          counts[cy * w + cf]! += (cf + 1) * SAMPLES - first;
          counts[cy * w + cl]! += last - cl * SAMPLES + 1;
          whole[cf + 1]! += 1;
          whole[cl]! -= 1;
        }
        if (middleRow) {
          const mf = Math.ceil((first - MIDDLE) / SAMPLES);
          const ml = Math.floor((last - MIDDLE) / SAMPLES);
          if (mf <= ml) {
            middle[mf]! += 1;
            middle[ml + 1]! -= 1;
          }
        }
      }
      if (middleRow) {
        let inside = 0;
        for (let cx = 0; cx < w; cx++) {
          inside += middle[cx]!;
          if (inside > 0) middles[cy * w + cx] = 1;
        }
      }
    }
    let spans = 0;
    for (let cx = 0; cx < w; cx++) {
      spans += whole[cx]!;
      counts[cy * w + cx]! += spans * SAMPLES;
    }
  }
  return { counts, middles, x0, y0, w, h };
}

/** The cells drawn as the other kind. */
function misdrawnCells(rings: readonly Vec[][], isFloor: IsFloor, box: CellGrid): CellPoint[] {
  const { counts, middles, x0, y0, w, h } = drawnSamples(rings, box);
  const most = SAMPLES * SAMPLES;
  const out: CellPoint[] = [];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      const share = counts[i]! / most;
      const floor = isFloor(x0 + gx, y0 + gy);
      if (floor ? share < FLOOR_SHARE || !middles[i] : share > ROCK_SHARE || middles[i]) out.push({ x: x0 + gx, y: y0 + gy });
    }
  }
  return out;
}

const cross = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** Bucket side for the crossing search, in cells. */
const BUCKET = 0.5;

/** Every segment that crosses another, found through buckets of half a cell. */
function crossingSegments(rings: readonly Vec[][]): Set<number>[] {
  const out = rings.map(() => new Set<number>());
  const buckets = new Map<number, number[]>();
  const keyOf = (bx: number, by: number): number => (bx + 32768) * 65536 + (by + 32768);
  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      for (let by = Math.floor(Math.min(a.y, b.y) / BUCKET); by <= Math.floor(Math.max(a.y, b.y) / BUCKET); by++) {
        for (let bx = Math.floor(Math.min(a.x, b.x) / BUCKET); bx <= Math.floor(Math.max(a.x, b.x) / BUCKET); bx++) {
          const key = keyOf(bx, by);
          const list = buckets.get(key);
          if (list) list.push(r, i);
          else buckets.set(key, [r, i]);
        }
      }
    }
  });
  for (const list of buckets.values()) {
    for (let p = 0; p < list.length; p += 2) {
      for (let q = p + 2; q < list.length; q += 2) {
        const [r, i, s, j] = [list[p]!, list[p + 1]!, list[q]!, list[q + 1]!];
        const ring = rings[r]!;
        const other = rings[s]!;
        if (r === s && (Math.abs(i - j) <= 1 || Math.abs(i - j) === ring.length - 1)) continue;
        if (segmentsCross(ring[i]!, ring[(i + 1) % ring.length]!, other[j]!, other[(j + 1) % other.length]!)) {
          out[r]!.add(i);
          out[s]!.add(j);
        }
      }
    }
  }
  return out;
}

/** Whether the segment enters the open square [x0, x1] × [y0, y1]. */
function entersSquare(a: Vec, b: Vec, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ] as const) {
    if (p === 0) {
      if (q <= EPS) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  return t1 - t0 > EPS;
}

/** The kept cells whose middle `CELL_CORE` a segment of the outline enters. */
function breachedCores(rings: readonly Vec[][], kept: IsFloor): CellPoint[] {
  const out = new Map<number, CellPoint>();
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      for (let y = Math.floor(Math.min(a.y, b.y)); y <= Math.floor(Math.max(a.y, b.y)); y++) {
        for (let x = Math.floor(Math.min(a.x, b.x)); x <= Math.floor(Math.max(a.x, b.x)); x++) {
          if (kept(x, y) && entersSquare(a, b, x + CORE_MARGIN, y + CORE_MARGIN, x + 1 - CORE_MARGIN, y + 1 - CORE_MARGIN)) out.set((x + 32768) * 65536 + (y + 32768), { x, y });
        }
      }
    }
  }
  return [...out.values()];
}

/** Everything wrong with the outline: misdrawn cells, kept cells whose middle a wall enters, and crossing segments. */
export function outlineFaults(rings: readonly Vec[][], isFloor: IsFloor, box: CellGrid, kept?: IsFloor): OutlineFaults {
  const cells = misdrawnCells(rings, isFloor, box);
  return { cells: kept ? [...cells, ...breachedCores(rings, kept)] : cells, crossings: crossingSegments(rings) };
}

export function faultless(faults: OutlineFaults): boolean {
  return faults.cells.length === 0 && faults.crossings.every((set) => set.size === 0);
}
