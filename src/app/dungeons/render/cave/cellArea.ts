/**
 * How much of one cell an outline draws as floor, exactly: a narrow way's cell is drawn a set
 * share across (`NARROW_SHARE`), finer than the guard's seven samples a row can tell, which count
 * a band of 0.45 as three columns or four depending on where it lies.
 */

import type { Vec } from '../geometry';

interface RingBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** What a cell's share is read with: each ring's bounds, so a cell asks only the rings round it, and the way outer rings wind. */
export interface RingIndex {
  bounds: RingBounds[];
  /** 1 where outer rings wind with a positive area, −1 where with a negative one: the largest ring is always an outer one. */
  sign: number;
}

function ringBounds(ring: readonly Vec[]): RingBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** The ring clipped to one side of an axis-aligned line (Sutherland–Hodgman): `keep` says which points stay. */
function clipSide(ring: readonly Vec[], keep: (p: Vec) => number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const da = keep(a);
    const db = keep(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function signedArea(ring: readonly Vec[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function ringIndex(rings: readonly Vec[][]): RingIndex {
  let largest = 0;
  for (const ring of rings) {
    const area = signedArea(ring);
    if (Math.abs(area) > Math.abs(largest)) largest = area;
  }
  return { bounds: rings.map(ringBounds), sign: Math.sign(largest) || 1 };
}

/**
 * The share of cell (x, y) the rings draw as floor. A ring clipped to a convex square keeps its
 * signed area there however it bends, and holes wind the other way, so the rings' clipped areas
 * add up to the floor's.
 */
export function cellFloorShare(rings: readonly Vec[][], index: RingIndex, x: number, y: number): number {
  let total = 0;
  rings.forEach((ring, k) => {
    const b = index.bounds[k]!;
    if (b.maxX <= x || b.minX >= x + 1 || b.maxY <= y || b.minY >= y + 1) return;
    let clipped = clipSide(ring, (p) => p.x - x);
    clipped = clipSide(clipped, (p) => x + 1 - p.x);
    clipped = clipSide(clipped, (p) => p.y - y);
    clipped = clipSide(clipped, (p) => y + 1 - p.y);
    if (clipped.length >= 3) total += signedArea(clipped);
  });
  return Math.max(0, Math.min(1, total * index.sign));
}
