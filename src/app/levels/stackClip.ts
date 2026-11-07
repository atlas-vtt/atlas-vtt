/**
 * The part of a level's explored memory that may record what is seen of it through openings
 * above: the memory's texels that lie wholly where the stack shows that level. A memory texel
 * touching any other texel of the stack is left out, so the memory records too little at the
 * edge of an opening, never more than was shown.
 */

import type { LevelStack } from './levelStack';

/** A level's explored memory as a grid: `columns` × `rows` texels over a map of `mapWidth` × `mapHeight` world pixels, stamped at `scale` texels per world pixel. */
export interface MemoryGrid {
  columns: number;
  rows: number;
  mapWidth: number;
  mapHeight: number;
  scale: number;
}

/** A memory texel reaching this close to a stack texel, in stack texels, touches it. */
const EDGE = 1e-6;

/** Memory texels (`x`, `y` and on, `columns` × `rows`) where `allowed` is 1; every texel outside this box is left out. */
export interface TexelMask {
  x: number;
  y: number;
  columns: number;
  rows: number;
  allowed: Uint8Array;
}

/**
 * The memory texels of `memory` that touch only texels of `stack` showing level `index`; null
 * where there are none. A memory texel is stamped at `scale` and read back stretched to the map's
 * size, so it is taken to cover the union of both: the clip holds for either.
 */
export function stampClip(stack: LevelStack, index: number, memory: MemoryGrid): TexelMask | null {
  const { box, grid, cells } = stack;
  if (!box) return null;
  // Counts of texels showing `index` over the box: a corner-anchored running sum.
  const sums = new Uint32Array((box.columns + 1) * (box.rows + 1));
  const stride = box.columns + 1;
  for (let row = 0; row < box.rows; row++) {
    let line = 0;
    for (let column = 0; column < box.columns; column++) {
      line += cells[row * box.columns + column] === index ? 1 : 0;
      sums[(row + 1) * stride + column + 1] = sums[row * stride + column + 1]! + line;
    }
  }
  const count = (c0: number, r0: number, c1: number, r1: number): number =>
    sums[(r1 + 1) * stride + c1 + 1]! - sums[r0 * stride + c1 + 1]! - sums[(r1 + 1) * stride + c0]! + sums[r0 * stride + c0]!;

  const xs = extents(memory.scale, memory.mapWidth, memory.columns);
  const ys = extents(memory.scale, memory.mapHeight, memory.rows);
  const { texel } = grid;
  // The memory texels whose extent may lie within the box.
  const mx0 = Math.max(0, Math.floor((box.x * texel) / xs.wide) - 1);
  const my0 = Math.max(0, Math.floor((box.y * texel) / ys.wide) - 1);
  const mx1 = Math.min(memory.columns, Math.ceil(((box.x + box.columns) * texel) / xs.narrow) + 1);
  const my1 = Math.min(memory.rows, Math.ceil(((box.y + box.rows) * texel) / ys.narrow) + 1);
  if (mx1 <= mx0 || my1 <= my0) return null;
  const columns = mx1 - mx0;
  const rows = my1 - my0;
  const allowed = new Uint8Array(columns * rows);
  let any = false;
  for (let my = my0; my < my1; my++) {
    // Touching a stack texel's edge counts as touching it.
    const r0 = Math.floor((my * ys.narrow) / texel - EDGE) - box.y;
    const r1 = Math.floor(((my + 1) * ys.wide) / texel + EDGE) - box.y;
    if (r0 < 0 || r1 >= box.rows) continue;
    for (let mx = mx0; mx < mx1; mx++) {
      const c0 = Math.floor((mx * xs.narrow) / texel - EDGE) - box.x;
      const c1 = Math.floor(((mx + 1) * xs.wide) / texel + EDGE) - box.x;
      if (c0 < 0 || c1 >= box.columns) continue;
      if (count(c0, r0, c1, r1) !== (c1 - c0 + 1) * (r1 - r0 + 1)) continue;
      allowed[(my - my0) * columns + mx - mx0] = 1;
      any = true;
    }
  }
  return any ? { x: mx0, y: my0, columns, rows, allowed } : null;
}

/** World pixels a memory texel spans along one side, the narrower and the wider of stamping and reading it. */
function extents(scale: number, size: number, texels: number): { narrow: number; wide: number } {
  const stamped = 1 / scale;
  const read = size / Math.max(1, texels);
  return { narrow: Math.min(stamped, read), wide: Math.max(stamped, read) };
}
