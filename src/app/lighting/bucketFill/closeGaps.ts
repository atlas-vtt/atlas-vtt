import type { Point } from '../../types/visionTypes';

/**
 * The bucket's failsafe against spills. A fill that runs out to its radius has found no wall all
 * round the drop: often the room is open through a gap (a doorway, a weak spot in a wall) and the
 * flood went on into the next room or the rock. Gaps are closed, narrowest first and up to
 * `maxGap` pixels wide, by cutting the fill where it is narrower than the gap (an opening of the
 * pixels with a disc), until the part around the drop no longer reaches the radius. A fill that no
 * such cut encloses (a room larger than the bucket, a corridor narrower than the gap) stays as it is.
 */

const FAR = 1e20;

/**
 * Squared distance from each pixel to the nearest pixel of `target` (exact): the distance down each
 * column first, swept row by row so it reads memory in order (Meijster), then each row's lower
 * envelope of parabolas (Felzenszwalb–Huttenlocher).
 */
export function squaredDistanceTo(target: (i: number) => boolean, width: number, height: number): Float64Array {
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = target(i) ? 0 : i >= width && grid[i - width]! < FAR ? grid[i - width]! + 1 : FAR;
  for (let i = grid.length - width - 1; i >= 0; i--) if (grid[i + width]! + 1 < grid[i]!) grid[i] = grid[i + width]! + 1;
  for (let i = 0; i < grid.length; i++) if (grid[i]! < FAR) grid[i] = grid[i]! * grid[i]!;
  const size = width;
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  // One row, starting at `base`.
  const n = width;
  const pass = (base: number): void => {
    for (let q = 0; q < n; q++) f[q] = grid[base + q]!;
    let k = 0;
    v[0] = 0;
    z[0] = -FAR;
    z[1] = FAR;
    for (let q = 1; q < n; q++) {
      let s: number;
      for (;;) {
        const p = v[k]!;
        s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
        if (s > z[k]! || k === 0) break;
        k--;
      }
      if (s <= z[k]!) k = -1;
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = FAR;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1]! < q) k++;
      const p = v[k]!;
      d[q] = (q - p) * (q - p) + f[p]!;
    }
    for (let q = 0; q < n; q++) grid[base + q] = d[q]!;
  };
  for (let y = 0; y < height; y++) pass(y * width);
  return grid;
}

/** The 4-connected pieces of `mask` that hold the pixels `from`. */
function piecesAt(mask: Uint8Array, width: number, from: readonly number[]): Uint8Array {
  const piece = new Uint8Array(mask.length);
  const stack = from.filter((i) => mask[i]);
  for (const i of stack) piece[i] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const visit = (n: number): void => {
      if (mask[n] && !piece[n]) {
        piece[n] = 1;
        stack.push(n);
      }
    };
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < mask.length) visit(i + width);
  }
  return piece;
}

export interface GapCut {
  width: number;
  height: number;
  /** Where the bucket was poured, the squared distance of every pixel to the nearest of those places, and how far it reaches, in pixels. */
  from: readonly Point[];
  toDrop: Float64Array;
  radius: number;
  /** The widest gap to close, and the smallest part worth keeping (a cell's area), in pixels. */
  maxGap: number;
  leastArea: number;
}

/** `fill` (1 where the bucket filled) with its gaps closed where that stops a spill; `fill` itself where nothing does. */
export function closedOff(fill: Uint8Array, { width, height, from, toDrop, radius, maxGap, leastArea }: GapCut): Uint8Array {
  const reach = (radius - 1.5) ** 2;
  const spills = (mask: Uint8Array): boolean => {
    for (let i = 0; i < mask.length; i++) if (mask[i] && toDrop[i]! >= reach) return true;
    return false;
  };
  if (maxGap < 2 || !spills(fill)) return fill;
  const toEdge = squaredDistanceTo((i) => !fill[i], width, height);
  const step = Math.max(1, maxGap / 20);
  for (let half = 1; half <= maxGap / 2; half += step) {
    // What is left of the fill once every part narrower than the gap is taken away.
    const core = new Uint8Array(fill.length);
    for (let i = 0; i < core.length; i++) core[i] = toEdge[i]! > half * half ? 1 : 0;
    const starts = from.map((drop) => nearestOf(core, width, height, drop, half + leastArea ** 0.5 / 2)).filter((i) => i >= 0);
    if (starts.length === 0) continue;
    const kept = piecesAt(core, width, starts);
    // Grown back by as much, within the fill: the room again, without what lay beyond the gap.
    const grown = grownWithin(kept, fill, width, height, half + 1);
    const part = piecesAt(grown, width, starts);
    let area = 0;
    for (let i = 0; i < part.length; i++) area += part[i]!;
    if (area >= leastArea && !spills(part)) return part;
  }
  return fill;
}

/**
 * The pixels of `mask` within `reach` of a pixel of `target` (exactly, as a distance transform
 * would say): the distance along each row to `target`, as far as `reach`, then the rows within
 * `reach` above and below asked only for the pixels of `mask` not in `target`, a band along its edge.
 */
function grownWithin(target: Uint8Array, mask: Uint8Array, width: number, height: number, reach: number): Uint8Array {
  const rows = Math.floor(reach);
  const beyond = rows + 1;
  const along = new Int32Array(target.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let d = beyond;
    for (let x = 0; x < width; x++) along[row + x] = d = target[row + x] ? 0 : Math.min(beyond, d + 1);
    d = beyond;
    for (let x = width - 1; x >= 0; x--) along[row + x] = d = Math.min(along[row + x]!, d + 1);
  }
  const squared = reach * reach;
  const grown = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    if (target[i]) {
      grown[i] = 1;
      continue;
    }
    const y = Math.floor(i / width);
    for (let dy = Math.max(-rows, -y); dy <= Math.min(rows, height - 1 - y); dy++) {
      const d = along[i + dy * width]!;
      if (d * d + dy * dy <= squared) {
        grown[i] = 1;
        break;
      }
    }
  }
  return grown;
}

/** The pixel of `mask` nearest `from` within `within` pixels, or -1. */
function nearestOf(mask: Uint8Array, width: number, height: number, from: Point, within: number): number {
  let best = -1;
  let nearest = within * within;
  for (let y = Math.max(0, Math.floor(from.y - within)); y <= Math.min(height - 1, from.y + within); y++) {
    for (let x = Math.max(0, Math.floor(from.x - within)); x <= Math.min(width - 1, from.x + within); x++) {
      const d = (x - from.x) ** 2 + (y - from.y) ** 2;
      if (mask[y * width + x] && d <= nearest) [nearest, best] = [d, y * width + x];
    }
  }
  return best;
}
