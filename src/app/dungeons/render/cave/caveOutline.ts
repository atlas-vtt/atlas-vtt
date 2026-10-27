/**
 * A cave's floor as drawn. The outline of its floor cells is walked every quarter cell, smoothed
 * so a staircase of cells becomes a slanting wall and a corner a curve, pushed out and in by the
 * rock's relief (`outlineRelief.ts`) and rounded once more. The drawing is free of the cell grid,
 * held only to agree with it (`outlineGuard.ts`): where a cell would be drawn as the other kind,
 * or the outline would cross itself, the wall near it is eased back towards the cells' own edge,
 * as far as needed. Entrances, crawls and stairwells keep their pinned cell edges straight.
 */

import type { CellPoint } from '../../model';
import { traceLoops } from '../../water/contour';
import { type CellGrid, WET } from '../../water/wetGrid';
import { type FloorShape, type Vec, polysOf } from '../geometry';
import { thinCorners } from '../simplifyRing';
import { faultless, outlineFaults } from './outlineGuard';
import { outlineRelief, type Relief } from './outlineRelief';

/** A cell edge that stays straight: an entrance's outer mouth. */
export interface PinnedEdge {
  a: Vec;
  b: Vec;
}

/** Corners per cell along the walked outline. */
const STEPS_PER_CELL = 4;
/** How far each way along the outline a corner is averaged with its neighbours, in corners, and how softly. */
const REACH = 8;
const SIGMA = 3.4;
/** How far from a pinned edge the outline takes its full smoothing and relief, in cells. */
const FADE = 1;
/** How many times a misdrawn stretch is eased back, by this much each time, before it keeps to its cells. */
const EASINGS = 8;
const EASE = 0.6;
/** How far the drawn ring may stray from the rounded one when it drops corners, in cells: far below a pixel at any zoom. */
const SIMPLIFY = 0.01;
/** How many times the corners are thinned: each round drops at most every other corner. */
const THINNINGS = 2;
/** Corners either side of a fault that are eased with it. */
const EASE_REACH = 2;

type IsFloor = (x: number, y: number) => boolean;

/** One traced loop, walked: where its corners lie on the cell edges, and where the free drawing would put them. */
interface Walk {
  base: Vec[];
  pinned: boolean[];
  /** Corners that keep their place when the ring is rounded: the pinned ones, and those the last easing sent to their cell edge. */
  held: boolean[];
  free: Vec[];
  /** Each corner's way out into the rock, square to the cell edges it lies on. */
  normal: Vec[];
  /** How much of the free drawing's move into the floor and into the rock each corner keeps: 1 all, 0 none. */
  keepIn: Float64Array;
  keepOut: Float64Array;
}

function onEdge(p: Vec, edge: PinnedEdge): boolean {
  const { a, b } = edge;
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) < 1e-9 && p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
}

/** The loop's corners walked every quarter cell. */
function quarterSteps(loop: readonly Vec[]): Vec[] {
  return loop.flatMap((a, i) => {
    const b = loop[(i + 1) % loop.length]!;
    const steps = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * STEPS_PER_CELL);
    return Array.from({ length: steps }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }));
  });
}

/** How far each corner lies from the nearest pinned one along the loop, as a share of `FADE` (1 where none is near). */
function fades(pinned: readonly boolean[]): number[] {
  const n = pinned.length;
  const reach = FADE * STEPS_PER_CELL;
  const steps = pinned.map((p) => (p ? 0 : reach));
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < 2 * n; k++) {
      const i = k % n;
      steps[i] = Math.min(steps[i]!, steps[(i - 1 + n) % n]! + 1);
      const j = n - 1 - i;
      steps[j] = Math.min(steps[j]!, steps[(j + 1) % n]! + 1);
    }
  }
  return steps.map((s) => Math.min(1, s / reach));
}

const WEIGHTS = Array.from({ length: 2 * REACH + 1 }, (_, k) => Math.exp(-((k - REACH) ** 2) / (2 * SIGMA * SIGMA)));
const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);

/** The free drawing of a walked loop: smoothed along the loop, then moved along its normal by the relief. */
function freeDrawing(base: readonly Vec[], fade: readonly number[], relief: Relief): Vec[] {
  const n = base.length;
  const smooth = base.map((b, i) => {
    let x = 0;
    let y = 0;
    for (let k = -REACH; k <= REACH; k++) {
      const p = base[(i + k + n) % n]!;
      const w = WEIGHTS[k + REACH]!;
      x += w * p.x;
      y += w * p.y;
    }
    const f = fade[i]!;
    return { x: b.x + f * (x / WEIGHT_SUM - b.x), y: b.y + f * (y / WEIGHT_SUM - b.y) };
  });
  return smooth.map((s, i) => {
    const before = smooth[(i - 1 + n) % n]!;
    const after = smooth[(i + 1) % n]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    // Floor lies on the right of the way round, so the rock lies on the left: (dy, −dx).
    const moved = relief(s.x, s.y, dy / length, -dx / length);
    const f = fade[i]!;
    return { x: s.x + f * (moved.x - s.x), y: s.y + f * (moved.y - s.y) };
  });
}

/** The corners as drawn now: each between its cell edge and its free place, by how much it keeps. */
function placed(walk: Walk): Vec[] {
  return walk.base.map((b, i) => {
    const f = walk.free[i]!;
    const n = walk.normal[i]!;
    const kIn = walk.keepIn[i]!;
    const kOut = walk.keepOut[i]!;
    const ox = f.x - b.x;
    const oy = f.y - b.y;
    // Out into the rock and along the wall are eased apart from in onto the floor.
    const out = ox * n.x + oy * n.y;
    const along = Math.min(kIn, kOut);
    const across = out < 0 ? kIn : kOut;
    return { x: b.x + along * (ox - out * n.x) + across * out * n.x, y: b.y + along * (oy - out * n.y) + across * out * n.y };
  });
}

/** Each walked corner's way out into the rock, from the corners two steps either side. */
function normals(base: readonly Vec[]): Vec[] {
  const n = base.length;
  return base.map((_, i) => {
    const before = base[(i - 2 + n) % n]!;
    const after = base[(i + 2) % n]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    // Floor lies on the right of the way round, so the rock lies on the left: (dy, −dx).
    return { x: dy / length, y: -dx / length };
  });
}

/** One round of Chaikin's corner cutting that keeps pinned corners, and the straight run between two, where they are. */
function cutCorners(points: readonly Vec[], pinned: readonly boolean[]): Vec[] {
  return points.flatMap((p, i) => {
    const j = (i + 1) % points.length;
    const q = points[j]!;
    const near = { x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y };
    const far = { x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y };
    if (pinned[i] && pinned[j]) return [p];
    if (pinned[i]) return [p, far];
    if (pinned[j]) return [near];
    return [near, far];
  });
}

/** Which walked corner each corner of the rounded ring came from. */
function roundedOrigins(pinned: readonly boolean[]): number[] {
  return pinned.flatMap((p, i) => {
    const q = pinned[(i + 1) % pinned.length];
    if (p && q) return [i];
    if (p) return [i, i];
    if (q) return [i];
    return [i, i];
  });
}

/** The cells an outline is checked against, read once into grids over its box: floor (asked again outside the box), and those kept. */
interface Cells {
  box: CellGrid;
  floor: IsFloor;
  kept?: IsFloor;
}

function readCells(isFloor: IsFloor, box: CellGrid, kept?: IsFloor): Cells {
  const read = (is: IsFloor): Uint8Array => {
    const grid = new Uint8Array(box.w * box.h);
    for (let gy = 0; gy < box.h; gy++) for (let gx = 0; gx < box.w; gx++) if (is(box.x0 + gx, box.y0 + gy)) grid[gy * box.w + gx] = 1;
    return grid;
  };
  const at = (grid: Uint8Array, outside: IsFloor): IsFloor => (x, y) => {
    const gx = x - box.x0;
    const gy = y - box.y0;
    return gx >= 0 && gy >= 0 && gx < box.w && gy < box.h ? grid[gy * box.w + gx] === 1 : outside(x, y);
  };
  return { box, floor: at(read(isFloor), isFloor), ...(kept && { kept: at(read(kept), () => false) }) };
}

/** The cells within one of any of `cells`, over the box grown by two: a corner there may have drawn them wrong. */
function nearAny(cells: readonly CellPoint[], box: CellGrid): (p: Vec) => boolean {
  const x0 = box.x0 - 2;
  const y0 = box.y0 - 2;
  const w = box.w + 4;
  const h = box.h + 4;
  const grid = new Uint8Array(w * h);
  for (const c of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) grid[(c.y + dy - y0) * w + (c.x + dx - x0)] = 1;
  return (p) => {
    const gx = Math.floor(p.x) - x0;
    const gy = Math.floor(p.y) - y0;
    return gx >= 0 && gy >= 0 && gx < w && gy < h && grid[gy * w + gx] === 1;
  };
}

/**
 * Eases the corners near every fault back towards their cell edges, only in the way that made it:
 * a floor cell drawn too thin (or a kept cell's middle entered) eases their moves onto the floor,
 * a rock cell drawn too full their moves into the rock, a crossing both. `all` sends them the
 * whole way and holds them there, unrounded.
 */
function ease(walks: readonly Walk[], rounded: readonly Vec[][], origins: readonly number[][], cells: Cells, all: boolean): boolean {
  const { box } = cells;
  const faults = outlineFaults(rounded, cells.floor, box, cells.kept);
  if (faultless(faults)) return false;
  const nearThin = nearAny(faults.cells.filter((c) => cells.floor(c.x, c.y)), box);
  const nearFull = nearAny(faults.cells.filter((c) => !cells.floor(c.x, c.y)), box);
  walks.forEach((walk, r) => {
    const inward = new Set<number>();
    const outward = new Set<number>();
    for (const segment of faults.crossings[r]!) {
      for (const k of [segment, (segment + 1) % origins[r]!.length]) {
        inward.add(origins[r]![k]!);
        outward.add(origins[r]![k]!);
      }
    }
    rounded[r]!.forEach((p, k) => {
      if (nearThin(p)) inward.add(origins[r]![k]!);
      if (nearFull(p)) outward.add(origins[r]![k]!);
    });
    const n = walk.base.length;
    const spread = (marked: ReadonlySet<number>): Set<number> => {
      const out = new Set<number>();
      for (const i of marked) for (let k = -EASE_REACH; k <= EASE_REACH; k++) out.add((i + k + n) % n);
      return out;
    };
    for (const j of spread(inward)) walk.keepIn[j] = all ? 0 : walk.keepIn[j]! * EASE;
    for (const j of spread(outward)) walk.keepOut[j] = all ? 0 : walk.keepOut[j]! * EASE;
    if (all) for (const j of spread(new Set([...inward, ...outward]))) {
      walk.keepIn[j] = 0;
      walk.keepOut[j] = 0;
      walk.held[j] = true;
    }
  });
  return true;
}

/** The rings with the corners they hardly bend at left out, where that leaves them as true to their cells. */
function fewerCorners(rings: readonly Vec[][], cells: Cells): Vec[][] {
  const fewer = rings.map((ring) => thinCorners(ring, SIMPLIFY, THINNINGS));
  if (fewer.every((ring, k) => ring.length === rings[k]!.length)) return [...rings];
  return faultless(outlineFaults(fewer, cells.floor, cells.box, cells.kept)) ? fewer : [...rings];
}

/**
 * The traced, smoothed outline of the cells `isFloor` names in `box`, one poly per piece with its
 * holes. No wall enters the middle `CELL_CORE` of a cell `kept` names.
 */
export function caveOutline(seed: number, floor: number, isFloor: IsFloor, box: CellGrid, pinned: readonly PinnedEdge[], kept?: IsFloor): FloorShape[] {
  const cells = readCells(isFloor, box, kept);
  const marks = new Uint8Array(box.w * box.h);
  for (let gy = 0; gy < box.h; gy++) for (let gx = 0; gx < box.w; gx++) if (cells.floor(box.x0 + gx, box.y0 + gy)) marks[gy * box.w + gx] = WET;
  const relief = outlineRelief(seed, floor);
  const walks: Walk[] = traceLoops(box, marks).map((loop) => {
    const base = quarterSteps(loop);
    const pins = base.map((p) => pinned.some((edge) => onEdge(p, edge)));
    return { base, pinned: pins, held: [...pins], free: freeDrawing(base, fades(pins), relief), normal: normals(base), keepIn: new Float64Array(base.length).fill(1), keepOut: new Float64Array(base.length).fill(1) };
  });
  const draw = (): Vec[][] => walks.map((walk) => cutCorners(placed(walk), walk.held));
  let rounded = draw();
  for (let round = 0; round <= EASINGS; round++) {
    if (!ease(walks, rounded, walks.map((walk) => roundedOrigins(walk.held)), cells, round === EASINGS)) return polysOf(fewerCorners(rounded, cells));
    rounded = draw();
  }
  // Held to their cell edges where faults remained; should any be left, the cells' own outline.
  return polysOf(faultless(outlineFaults(rounded, cells.floor, box, cells.kept)) ? rounded : walks.map((walk) => cutCorners(walk.base, walk.base.map(() => true))));
}
