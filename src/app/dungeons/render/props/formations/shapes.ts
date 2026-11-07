import { polyPath, type PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import type { GlyphFit } from '../../propShapes';
import { rngFrom } from '../../../rng';
import { stoneOutline } from '../../terrain/stones';
import { hash2, valueNoise } from '../../art/noise';
import type { Face } from './finish';

/**
 * What nature built in a cave, seen from straight above, in cells round the piece's centre (the
 * room towards −y; a wall piece's wall runs along y = +0.1). Every outline is worked out once here
 * and shared by both painters, so the Stone and the Engraved drawing and the shadow agree.
 */

/** A ring with its first point repeated at its end, to draw it as an open run that closes. */
export function closed(ring: readonly Vec[]): Vec[] {
  return [...ring, ring[0]!];
}

/** A lobed ring round `c`: `lobes` swellings of `amp` (a share of `r`), a second, finer rhythm over them. */
export function lobed(c: Vec, r: number, lobes: number, amp: number, phase: number, n = 28): Vec[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (1 + amp * Math.sin(lobes * a + phase) + amp * 0.45 * Math.sin((lobes * 2 + 1) * a + phase * 1.7));
    return { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr };
  });
}

/** One stalagmite: its foot, its rings of growth climbing towards a tip it leans to, and that tip. */
export interface Mound {
  c: Vec;
  r: number;
  foot: Vec[];
  rings: Vec[][];
  tip: Vec;
}

function mound(x: number, y: number, r: number, lean: Vec, phase: number): Mound {
  const c = { x, y };
  // Rings climb the cone and crowd towards its lean, as drip-fed calcite does.
  // A small cone swells in fewer lobes and is traced through fewer points: it is drawn small.
  const lobes = r < 0.1 ? 3 : 5;
  const points = (radius: number): number => Math.max(lobes * 4, Math.round(radius * 85));
  const rings = [0.72, 0.48, 0.27].map((s, i) => lobed({ x: x + lean.x * r * (1 - s), y: y + lean.y * r * (1 - s) }, r * s, lobes, 0.06 - i * 0.012, phase + i * 0.9, points(r * s)));
  return { c, r, foot: lobed(c, r, lobes, 0.07, phase, points(r)), rings, tip: { x: x + lean.x * r * 0.86, y: y + lean.y * r * 0.86 } };
}

/** A clump of stalagmites, the tallest in its middle, the smallest at its edges, each leaning a little its own way; no two feet overlap, so the clump is drawn as one. */
export const MOUNDS: readonly Mound[] = [
  mound(0.36, 0.32, 0.07, { x: 0.25, y: 0.2 }, 2.4),
  mound(-0.29, 0.24, 0.085, { x: -0.2, y: 0.25 }, 0.7),
  mound(-0.26, -0.22, 0.095, { x: -0.22, y: -0.2 }, 1.3),
  mound(0.07, -0.29, 0.08, { x: 0.05, y: -0.3 }, 5.2),
  mound(0.26, 0.15, 0.13, { x: 0.18, y: 0.08 }, 3.3),
  mound(-0.06, 0.03, 0.22, { x: -0.08, y: 0.05 }, 0.2),
];

/**
 * The calcite a cluster stands on: round the centre, as far as the farthest foot grown by `grow`,
 * so it hugs every stalagmite and dips between them.
 */
function padAround(mounds: readonly { c: Vec; r: number }[], grow: number, n = 32): Vec[] {
  const out: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    let reach = 0.08;
    for (const { c, r } of mounds) {
      // Where the ray leaves the foot's grown circle.
      const along = c.x * d.x + c.y * d.y;
      const off = c.x * d.y - c.y * d.x;
      const rr = r + grow;
      if (Math.abs(off) < rr) reach = Math.max(reach, along + Math.sqrt(rr * rr - off * off));
    }
    out.push({ x: d.x * reach, y: d.y * reach });
  }
  // Soften the dips between feet, so the base reads as one poured sheet.
  return out.map((p, i) => {
    const a = out[(i + n - 1) % n]!;
    const b = out[(i + 1) % n]!;
    return { x: (a.x + p.x * 2 + b.x) / 4, y: (a.y + p.y * 2 + b.y) / 4 };
  });
}

export const MOUND_PAD: readonly Vec[] = padAround(MOUNDS, 0.05);

/** A column where a stalactite met its stalagmite: a flared, rippled skirt, a fluted shaft and the small cones at its foot. */
export const COLUMN = {
  skirt: lobed({ x: 0, y: 0 }, 0.4, 6, 0.045, 0.6, 36),
  drips: [lobed({ x: 0.01, y: 0.01 }, 0.34, 7, 0.035, 1.9, 32)],
  shaft: lobed({ x: 0, y: 0 }, 0.255, 11, 0.055, 0.3, 55),
  core: lobed({ x: -0.02, y: -0.02 }, 0.13, 7, 0.06, 2.2, 21),
  foot: [mound(0.27, 0.27, 0.065, { x: 0.3, y: 0.3 }, 1.1), mound(-0.33, 0.1, 0.055, { x: -0.3, y: 0.1 }, 2.6)],
};

/** How far the column's fluted shaft certainly reaches: its outline lighting takes as a wall. */
export const COLUMN_SOLID = 0.24;

/** How far a wall piece's sheet reaches up to its wall. */
export const SHEET_TOP = 0.072;

/**
 * Flowstone's lower edge: tongues of different breadth and length poured from the wall into the
 * room, spaced unevenly, run together at their roots, the ends of the sheet tucked back to the wall.
 */
export function flowLobes(fit: GlyphFit): { edge: Vec[]; tips: Vec[] } {
  const half = fit.along / 2 - 0.07;
  const tongues: { x: number; w: number; reach: number }[] = [];
  for (let x = -half + 0.08, i = 0; x < half - 0.04; i++) {
    const w = 0.1 + 0.09 * hash2(i, 3, 41);
    tongues.push({ x, w, reach: 0.05 + 0.075 * hash2(i, 5, 43) });
    x += w * (1.15 + 0.5 * hash2(i, 7, 47));
  }
  const steps = Math.max(12, Math.round((half * 2) / 0.02));
  const edge = Array.from({ length: steps + 1 }, (_, k) => {
    const x = -half + (k / steps) * half * 2;
    let drop = 0.035;
    for (const t of tongues) {
      const u = (x - t.x) / t.w;
      if (Math.abs(u) < 1) drop = Math.max(drop, 0.035 + t.reach * (1 - u * u) ** 0.55);
    }
    const end = Math.min(1, (half - Math.abs(x)) / 0.08);
    return { x, y: SHEET_TOP - drop * Math.sqrt(Math.max(0, end)) };
  });
  return { edge, tips: tongues.map(t => ({ x: t.x, y: SHEET_TOP - 0.035 - t.reach })) };
}

/** The flowstone sheet as a closed outline: its lobed lower edge and the wall side it pours from. */
export function flowSheet(fit: GlyphFit): Vec[] {
  const { edge } = flowLobes(fit);
  return [...edge, { x: edge[edge.length - 1]!.x, y: SHEET_TOP }, { x: edge[0]!.x, y: SHEET_TOP }];
}

/** A curtain's middle line: a drapery folded to and fro along the wall, hung a little off it. */
export function curtainLine(fit: GlyphFit): Vec[] {
  const half = fit.along / 2 - 0.08;
  const folds = Math.max(3, Math.round((half * 2) / 0.2));
  const steps = folds * 8;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const end = Math.min(1, Math.min(t, 1 - t) * folds);
    // Folds of different depth, as a drapery grows, its line drifting a little off the wall and back.
    const fold = Math.floor(t * folds * 2);
    const deep = 0.022 + 0.013 * hash2(fold, 1, 53);
    const drift = (valueNoise(t * folds * 0.7, 0.5, 59) - 0.5) * 0.02;
    return { x: -half + t * half * 2, y: -0.018 + drift - Math.sin(t * folds * Math.PI * 2) * deep * (0.4 + 0.6 * end) };
  });
}

/** The curtain as a ribbon of `thick` cells round its middle line. */
export function ribbon(line: readonly Vec[], thick: number): Vec[] {
  const side = (s: number): Vec[] => line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(line.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const taper = Math.min(1, Math.min(i, line.length - 1 - i) / 3);
    const w = (thick / 2) * (0.35 + 0.65 * taper) * s;
    return { x: p.x - ((b.y - a.y) / len) * w, y: p.y + ((b.x - a.x) / len) * w };
  });
  return [...side(1), ...side(-1).reverse()];
}

/** The low flowstone a curtain's foot spreads into, along the wall. */
export function curtainFoot(fit: GlyphFit): Vec[] {
  const half = fit.along / 2 - 0.05;
  const steps = Math.max(8, Math.round(half * 40));
  const edge = Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const end = Math.min(1, Math.min(t, 1 - t) * 6);
    return { x: -half + t * half * 2, y: SHEET_TOP - (0.085 + 0.03 * Math.sin(t * 23 + 0.4) ** 2) * end };
  });
  return [...edge, { x: half, y: SHEET_TOP }, { x: -half, y: SHEET_TOP }];
}

/** A crystal: a hexagonal prism leaning out of the rock, its pointed end towards `tip`. */
export interface Crystal {
  /** Its termination's six corners, the facets meeting at `apex`. */
  hex: Vec[];
  apex: Vec;
  /** Its body from the rock to the termination: the hull of both ends. */
  body: Vec[];
  /** The body's two long sides either side of its ridge, each with the way it faces. */
  sides: Face[];
  ridge: Vec[];
  r: number;
}

function hexagon(c: Vec, r: number, turn: number): Vec[] {
  return Array.from({ length: 6 }, (_, k) => ({ x: c.x + Math.cos(turn + (k * Math.PI) / 3) * r, y: c.y + Math.sin(turn + (k * Math.PI) / 3) * r }));
}

/** The convex hull of `points` (gift wrapping; a handful of points). */
function hull(points: readonly Vec[]): Vec[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Vec[]): Vec[] => {
    const out: Vec[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function crystal(root: Vec, tip: Vec, r: number, turn: number): Crystal {
  const d = { x: tip.x - root.x, y: tip.y - root.y };
  const len = Math.hypot(d.x, d.y) || 1;
  const n = { x: -d.y / len, y: d.x / len };
  const hex = hexagon(tip, r, turn);
  const sides = [1, -1].map(s => ({
    poly: [root, tip, { x: tip.x + n.x * r * 0.85 * s, y: tip.y + n.y * r * 0.85 * s }, { x: root.x + n.x * r * 0.8 * s, y: root.y + n.y * r * 0.8 * s }],
    out: { x: n.x * s, y: n.y * s },
  }));
  return { hex, apex: { x: tip.x + (d.x / len) * r * 0.32, y: tip.y + (d.y / len) * r * 0.32 }, body: hull([...hexagon(root, r * 0.92, turn), ...hex]), sides, ridge: [root, tip], r };
}

/** The rock the crystals grow from, against the wall. */
export const MATRIX: readonly Vec[] = lobed({ x: 0, y: 0.2 }, 0.2, 4, 0.12, 0.9, 30).map(p => ({ x: p.x * 1.55, y: 0.2 + (p.y - 0.2) * 0.9 }));

/**
 * Seven crystals of the rock at the wall: three long ones leaning out into the room, four short ones
 * standing nearly upright between them and showing their ends; no two overlap, so they are drawn together.
 */
export const CRYSTALS: readonly Crystal[] = [
  crystal({ x: -0.3, y: 0.27 }, { x: -0.36, y: 0.2 }, 0.055, 0.4),
  crystal({ x: 0.3, y: 0.27 }, { x: 0.36, y: 0.21 }, 0.05, 0.1),
  crystal({ x: 0.175, y: 0.04 }, { x: 0.18, y: -0.02 }, 0.045, 0.45),
  crystal({ x: -0.12, y: 0.05 }, { x: -0.125, y: -0.02 }, 0.05, 0.3),
  crystal({ x: 0.18, y: 0.2 }, { x: 0.34, y: -0.07 }, 0.07, 0.2),
  crystal({ x: -0.16, y: 0.21 }, { x: -0.32, y: -0.1 }, 0.08, 0.5),
  crystal({ x: 0.01, y: 0.19 }, { x: 0.07, y: -0.27 }, 0.09, 0.05),
];

/** A fallen block: its outline of fracture faces, the flat top it broke along, its crack. */
export interface Block {
  outline: Vec[];
  top: Vec[];
  c: Vec;
}

function block(seed: number, c: Vec, r: number, topShift: Vec): Block {
  const outline = stoneOutline(rngFrom(seed), c, r);
  // The top: the outline drawn in towards a point a little up the slope, as a block's flat face lies.
  const t = { x: c.x + topShift.x, y: c.y + topShift.y };
  return { outline, top: outline.map(p => ({ x: t.x + (p.x - t.x) * 0.56, y: t.y + (p.y - t.y) * 0.56 })), c };
}

/** One large block and a smaller one broken from it, with chips at their foot. */
export const BOULDERS: readonly Block[] = [
  block(4, { x: 0.25, y: 0.21 }, 0.15, { x: -0.02, y: -0.02 }),
  block(11, { x: -0.06, y: -0.05 }, 0.3, { x: -0.04, y: -0.03 }),
];
export const CHIPS: readonly Vec[][] = [
  stoneOutline(rngFrom(21), { x: -0.33, y: 0.27 }, 0.04),
  stoneOutline(rngFrom(22), { x: -0.22, y: 0.33 }, 0.03),
  stoneOutline(rngFrom(23), { x: 0.36, y: -0.22 }, 0.035),
];

/** A crack across the large block's top, with a branch that dies out. */
export function crack(b: Block): Vec[][] {
  const [p, q] = [b.top[1]!, b.top[Math.floor(b.top.length / 2) + 1]!];
  const mid = { x: (p.x + q.x) / 2 + 0.03, y: (p.y + q.y) / 2 - 0.02 };
  const main = [b.outline[1]!, p, mid, q];
  const branch = [mid, { x: mid.x + 0.07, y: mid.y + 0.06 }, { x: mid.x + 0.1, y: mid.y + 0.12 }];
  return [main, branch];
}

/** The silhouettes, which cast each piece's shadow and hold its texture. */
// What stands is the cones and the column's shaft; the calcite round them lies flat and casts nothing.
export const moundsSilhouette: PathFn = path => {
  for (const m of MOUNDS) polyPath(m.foot)(path);
};
export const columnSilhouette: PathFn = polyPath(COLUMN.shaft);
export const crystalsSilhouette: PathFn = path => {
  polyPath(MATRIX)(path);
  for (const c of CRYSTALS) polyPath(c.body)(path);
};
export const boulderSilhouette: PathFn = path => {
  for (const b of BOULDERS) polyPath(b.outline)(path);
};
