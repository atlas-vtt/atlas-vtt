import type { FloorPattern } from '../../style';
import type { Bounds, Vec } from '../geometry';
import { hash2 } from './noise';

/**
 * The stones a floor is laid with, as polygons in cells, each with a shade of its own: the same
 * wherever and at whatever size it is drawn, since every stone follows from its place and the
 * dungeon's seed. Joints keep to the cell lines where the pattern allows, so the grid reads as
 * the floor's own.
 */
export interface FloorStone {
  poly: Vec[];
  /** 0..1, the stone's own shade. */
  tone: number;
}

const rect = (x: number, y: number, w: number, h: number): Vec[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

/** Irregular flagstones: 2 × 2 cell blocks split again and again on half cells, larger stones rarer. */
function flagstones(b: Bounds, seed: number, keep: (x: number, y: number) => boolean): FloorStone[] {
  const out: FloorStone[] = [];
  const split = (x: number, y: number, w: number, h: number, depth: number): void => {
    const r = hash2(Math.round(x * 4) + depth * 101, Math.round(y * 4) - depth * 37, seed);
    const area = w * h;
    const chance = area > 2 ? 1 : area > 1 ? 0.75 : area > 0.5 ? 0.4 : 0;
    if (r < chance) {
      const vertical = w > h ? true : w < h ? false : hash2(Math.round(x * 4), Math.round(y * 4), seed + 9) < 0.5;
      const span = vertical ? w : h;
      const cuts = Math.round(span * 2) - 1;
      const at = (1 + Math.floor(hash2(Math.round(x * 8), Math.round(y * 8), seed + depth) * cuts)) / 2;
      if (vertical) {
        split(x, y, at, h, depth + 1);
        split(x + at, y, w - at, h, depth + 1);
      } else {
        split(x, y, w, at, depth + 1);
        split(x, y + at, w, h - at, depth + 1);
      }
      return;
    }
    if (keep(x + w / 2, y + h / 2)) out.push({ poly: rect(x, y, w, h), tone: hash2(Math.round(x * 4), Math.round(y * 4), seed + 3) });
  };
  for (let y = Math.floor(b.minY / 2) * 2; y < b.maxY; y += 2) for (let x = Math.floor(b.minX / 2) * 2; x < b.maxX; x += 2) split(x, y, 2, 2, 0);
  return out;
}

/** Ashlar: courses half a cell deep, stones of irregular length, every course offset. */
function ashlar(b: Bounds, seed: number, keep: (x: number, y: number) => boolean): FloorStone[] {
  const out: FloorStone[] = [];
  const course = 0.5;
  for (let row = Math.floor(b.minY / course); row * course < b.maxY; row++) {
    const y = row * course;
    let x = Math.floor(b.minX) - hash2(row, 7, seed);
    while (x < b.maxX) {
      const w = 0.75 + Math.round(hash2(Math.floor(x * 8), row, seed + 1) * 4) * 0.25;
      if (keep(x + w / 2, y + course / 2)) out.push({ poly: rect(x, y, w, course), tone: hash2(Math.floor(x * 16), row, seed + 3) });
      x += w;
    }
  }
  return out;
}

/** One square slab a cell, laid on the grid. */
function slabs(b: Bounds, seed: number, keep: (x: number, y: number) => boolean): FloorStone[] {
  const out: FloorStone[] = [];
  for (let y = Math.floor(b.minY); y < b.maxY; y++) for (let x = Math.floor(b.minX); x < b.maxX; x++) if (keep(x + 0.5, y + 0.5)) out.push({ poly: rect(x, y, 1, 1), tone: hash2(x, y, seed + 3) });
  return out;
}

/** The jittered point of lattice cell (i, j), three a cell. */
function cobblePoint(i: number, j: number, seed: number): Vec {
  return { x: (i + 0.2 + hash2(i, j, seed) * 0.6) / 3, y: (j + 0.2 + hash2(i, j, seed + 1) * 0.6) / 3 };
}

/** The polygon of a point's Voronoi cell among its neighbours, by cutting a square with half-planes. */
function voronoiCell(i: number, j: number, seed: number): Vec[] {
  const p = cobblePoint(i, j, seed);
  let poly: Vec[] = rect(p.x - 0.5, p.y - 0.5, 1, 1);
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      if (!di && !dj) continue;
      const q = cobblePoint(i + di, j + dj, seed);
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const n = { x: q.x - p.x, y: q.y - p.y };
      const side = (v: Vec): number => (v.x - m.x) * n.x + (v.y - m.y) * n.y;
      const next: Vec[] = [];
      poly.forEach((a, k) => {
        const c = poly[(k + 1) % poly.length]!;
        const sa = side(a);
        const sc = side(c);
        if (sa <= 0) next.push(a);
        if (sa * sc < 0) {
          const t = sa / (sa - sc);
          next.push({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
        }
      });
      poly = next;
    }
  }
  return poly;
}

/** Rounded cobbles: the Voronoi cells of a jittered lattice, three across a cell. */
function cobbles(b: Bounds, seed: number, keep: (x: number, y: number) => boolean): FloorStone[] {
  const out: FloorStone[] = [];
  for (let j = Math.floor(b.minY * 3) - 1; j <= b.maxY * 3; j++) {
    for (let i = Math.floor(b.minX * 3) - 1; i <= b.maxX * 3; i++) {
      const p = cobblePoint(i, j, seed);
      if (!keep(p.x, p.y)) continue;
      out.push({ poly: voronoiCell(i, j, seed), tone: hash2(i, j, seed + 3) });
    }
  }
  return out;
}

const PATTERNS: Record<FloorPattern, typeof slabs> = { flagstone: flagstones, ashlar, slab: slabs, cobble: cobbles };

/** The stones of `pattern` within `bounds` whose middle `keep` accepts (near the floors). */
export function floorStones(pattern: FloorPattern, bounds: Bounds, seed: number, keep: (x: number, y: number) => boolean): FloorStone[] {
  return PATTERNS[pattern](bounds, seed, keep);
}
