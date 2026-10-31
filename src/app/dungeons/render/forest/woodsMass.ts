import { hash2 } from '../art/noise';
import type { Vec } from '../geometry';
import type { Clump } from '../grounds/crowns';
import { crownClump, treeKind, type TreeKind } from './treeShapes';

/** A clump of the woods' mass and how deep into the woods it stands (cells from the clearing). */
export interface WoodsClump {
  clump: Clump;
  depth: number;
  kind: TreeKind;
}

/** How deep the drawn mass reaches into the woods before it is the woods' flat colour. */
export const MASS_DEPTH = 1.8;
/** The grid candidates are tried on, in cells, and how far apart clumps stay (share of their radii together). */
const STEP = 0.3;
const APART = 0.5;
/** The points the mass is checked for gaps at, in cells. */
const COVER_STEP = 0.12;

/**
 * The woods as Watabou's glades and Reprieve draw them: one mass of small leafy clumps packed in
 * layers along every clearing, its silhouette the clumps' edge (never the outline's), reaching
 * `MASS_DEPTH` into the woods (lone trees in the clearings are `loneTrees`). `outside` is the
 * distance outside every clearing (cells, negative inside). Deepest first, then top to bottom, the
 * order they are drawn in. Deterministic in `seed`.
 */
export function woodsMass(bounds: { minX: number; minY: number; maxX: number; maxY: number }, outside: (p: Vec) => number, seed: number, trees: { conifers: number; bare: number }): WoodsClump[] {
  const placed: WoodsClump[] = [];
  const buckets = new Map<string, WoodsClump[]>();
  const keyOf = (x: number, y: number): string => `${Math.floor(x)},${Math.floor(y)}`;
  const free = (at: Vec, r: number): boolean => {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      for (const other of buckets.get(`${Math.floor(at.x) + i},${Math.floor(at.y) + j}`) ?? []) {
        if (Math.hypot(other.clump.centre.x - at.x, other.clump.centre.y - at.y) < APART * (other.clump.radius + r)) return false;
      }
    }
    return true;
  };
  const add = (at: Vec, r: number, depth: number, salt: number): void => {
    const kind = treeKind(salt, trees);
    const entry = { clump: crownClump(at, r, salt, kind, 13 + (salt % 5)), depth, kind };
    placed.push(entry);
    const key = keyOf(at.x, at.y);
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  };
  const i0 = Math.floor(bounds.minX / STEP);
  const j0 = Math.floor(bounds.minY / STEP);
  for (let j = j0; j * STEP < bounds.maxY; j++) {
    for (let i = i0; i * STEP < bounds.maxX; i++) {
      const h = (k: number): number => hash2(i, j, seed + k * 131);
      const at = { x: (i + h(1)) * STEP, y: (j + h(2)) * STEP };
      const depth = outside(at);
      const r = 0.24 + 0.36 * h(3) ** 1.6 + 0.05 * Math.max(0, depth);
      // The mass may overhang the clearing by a little of each clump, never stand in it.
      // Never beyond the mass's depth: the floor field reads every point farther than its reach (3 cells) as at its reach.
      if (depth < r * 0.25 || depth > MASS_DEPTH) continue;
      if (free(at, r)) add(at, r, depth, Math.floor(h(4) * 1e6));
    }
  }
  // Close every gap the spread left within the mass: a point it does not cover takes a clump of its
  // own, so the woods' ground beneath (and the outline under it) never shows between the clumps.
  const covered = (at: Vec): boolean => {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      for (const other of buckets.get(`${Math.floor(at.x) + i},${Math.floor(at.y) + j}`) ?? []) {
        if (Math.hypot(other.clump.centre.x - at.x, other.clump.centre.y - at.y) < other.clump.radius * 0.8) return true;
      }
    }
    return false;
  };
  for (let j = Math.floor(bounds.minY / COVER_STEP); j * COVER_STEP < bounds.maxY; j++) {
    for (let i = Math.floor(bounds.minX / COVER_STEP); i * COVER_STEP < bounds.maxX; i++) {
      const at = { x: i * COVER_STEP, y: j * COVER_STEP };
      const depth = outside(at);
      if (depth < 0.35 || depth > MASS_DEPTH || covered(at)) continue;
      const h = (k: number): number => hash2(i, j, seed + 500 + k * 131);
      add({ x: at.x + (h(1) - 0.5) * 0.1, y: at.y + (h(2) - 0.5) * 0.1 }, 0.26 + 0.2 * h(3) + 0.05 * depth, depth, Math.floor(h(4) * 1e6));
    }
  }
  return placed.sort((a, b) => b.depth - a.depth || a.clump.centre.y - b.clump.centre.y);
}
