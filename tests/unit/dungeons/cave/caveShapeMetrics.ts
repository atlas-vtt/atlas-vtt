/**
 * How natural a cave reads from above, measured apart from the generator: the longest straight
 * stretches of its drawn walls, how much of its smallest bounding rectangle a chamber fills, and
 * how the drawn passages' width and course vary. Each measure is what the eye reads, not the fine
 * grain: walls are judged after grain finer than about a third of a cell is smoothed away.
 */

import { spotRect } from '../../../../src/app/dungeons/floors/stairSpots';
import { doorCells } from '../../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import type { Vec } from '../../../../src/app/dungeons/render/geometry';
import { PolyField } from '../../../../src/app/dungeons/render/cave/polyField';
import { visibleFloor } from '../../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';

/** Walls are resampled every this many cells and smoothed over this many cells (one sigma). */
const STEP = 0.1;
const SMOOTH = 0.3;
/** A straight run turns by less than this in all. */
const STRAIGHT_TURN = (10 * Math.PI) / 180;

/** A ring walked every `STEP` along its length. */
function resample(ring: readonly Vec[]): Vec[] {
  const out: Vec[] = [];
  let carry = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let t = carry;
    for (; t < length; t += STEP) out.push({ x: a.x + ((b.x - a.x) * t) / length, y: a.y + ((b.y - a.y) * t) / length });
    carry = t - length;
  }
  return out;
}

function smoothed(points: readonly Vec[]): Vec[] {
  const reach = Math.ceil((3 * SMOOTH) / STEP);
  const weights = Array.from({ length: 2 * reach + 1 }, (_, k) => Math.exp(-(((k - reach) * STEP) ** 2) / (2 * SMOOTH * SMOOTH)));
  const total = weights.reduce((a, b) => a + b, 0);
  const n = points.length;
  return points.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -reach; k <= reach; k++) {
      const p = points[(((i + k) % n) + n) % n]!;
      x += weights[k + reach]! * p.x;
      y += weights[k + reach]! * p.y;
    }
    return { x: x / total, y: y / total };
  });
}

/** Whether a point lies on a cell edge a stairwell or doorway keeps straight on purpose. */
function pinnedOn(floor: DungeonFloor): (p: Vec) => boolean {
  const rects = [
    ...floor.stairs.map((stair) => spotRect(stair)),
    ...floor.doors.filter((door) => door.from === null || door.kind !== 'opening').flatMap(doorCells).map((c) => ({ x0: c.x, y0: c.y, x1: c.x, y1: c.y })),
  ];
  const near = 0.15;
  return (p) =>
    rects.some((r) => {
      const inX = p.x >= r.x0 - near && p.x <= r.x1 + 1 + near;
      const inY = p.y >= r.y0 - near && p.y <= r.y1 + 1 + near;
      const onX = Math.abs(p.x - r.x0) < near || Math.abs(p.x - r.x1 - 1) < near;
      const onY = Math.abs(p.y - r.y0) < near || Math.abs(p.y - r.y1 - 1) < near;
      return (onX && inY) || (onY && inX);
    });
}

/** The lengths, in cells, of every straight run of the floor's drawn walls, stairwell and doorway edges aside. */
export function straightRuns(model: DungeonModel, index: number): number[] {
  const floor = model.floors[index]!;
  const pinned = pinnedOn(floor);
  const out: number[] = [];
  for (const shape of visibleFloor(model, DEFAULT_VIEW, index).floors) {
    if (shape.kind !== 'poly') continue;
    for (const ring of shape.rings) {
      const points = smoothed(resample(ring));
      const n = points.length;
      if (n < 8) continue;
      const heading = points.map((p, i) => {
        const q = points[(i + 1) % n]!;
        return Math.atan2(q.y - p.y, q.x - p.x);
      });
      // Runs start at every point that ends one; walked twice round so a run over the ring's start counts whole.
      let start = 0;
      let lo = 0;
      let hi = 0;
      let unwrapped = heading[0]!;
      for (let k = 1; k < 2 * n; k++) {
        const i = k % n;
        let d = heading[i]! - heading[(i - 1 + n) % n]!;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        unwrapped += d;
        const breaks = pinned(points[i]!);
        if (breaks || Math.max(hi, unwrapped) - Math.min(lo, unwrapped) >= STRAIGHT_TURN) {
          if (start < n) out.push((k - start) * STEP);
          start = k;
          lo = hi = unwrapped;
          continue;
        }
        lo = Math.min(lo, unwrapped);
        hi = Math.max(hi, unwrapped);
      }
    }
  }
  return out;
}

/** The cells' corners' convex hull. */
function hull(cells: readonly CellPoint[]): Vec[] {
  const points = cells.flatMap((c) => [
    { x: c.x, y: c.y },
    { x: c.x + 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x + 1, y: c.y + 1 },
  ]);
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: readonly Vec[]): Vec[] => {
    const out: Vec[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(points), ...half([...points].reverse())];
}

/** A chamber's cell count over the area of the smallest rectangle, at any angle, round its cells. */
export function rectangleFill(cells: readonly CellPoint[]): number {
  const h = hull(cells);
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of h) {
      const u = p.x * ux + p.y * uy;
      const v = -p.x * uy + p.y * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    best = Math.min(best, (maxU - minU) * (maxV - minV));
  }
  return cells.length / best;
}

export interface PassageProfile {
  /** How wide the drawn passage is at each sample along it, in cells. */
  widths: number[];
  /** The middle of the drawn passage at each sample. */
  centre: Vec[];
}

/** A passage: a tunnel, or a chamber whose rectangle is three cells across at most and at least four long. */
function isPassage(room: DungeonRoom): boolean {
  return Math.max(room.w, room.h) >= 4 && (room.kind !== 'room' || Math.min(room.w, room.h) <= 3);
}

/** Samples along a passage per cell, and the step across it the drawn floor is read with, in cells. */
const SAMPLES_PER_CELL = 2;
const ACROSS_STEP = 0.05;
const ACROSS_REACH = 4;

/**
 * Every passage of a floor as it is drawn, cut across its rectangle's long side twice a cell, its
 * end cells left out: at each cut, the stretch of drawn floor through the middle of the passage's
 * cells there, its length and its middle.
 */
export function passageProfiles(model: DungeonModel, index: number): PassageProfile[] {
  const floor = model.floors[index]!;
  const field = new PolyField(visibleFloor(model, DEFAULT_VIEW, index).floors.flatMap((shape) => (shape.kind === 'poly' ? shape.rings : [])));
  const out: PassageProfile[] = [];
  for (const room of floor.rooms.filter((r) => isPassage(r) && (r.cells?.length ?? 0) > 0)) {
    const flat = room.w >= room.h;
    const along = (c: Vec): number => (flat ? c.x : c.y);
    const across = (c: Vec): number => (flat ? c.y : c.x);
    const point = (u: number, v: number): Vec => (flat ? { x: u, y: v } : { x: v, y: u });
    const cells = room.cells!;
    const first = Math.min(...cells.map(along)) + 1;
    const last = Math.max(...cells.map(along)) - 1;
    const widths: number[] = [];
    const centre: Vec[] = [];
    for (let u = first + 0.5 / SAMPLES_PER_CELL; u < last + 1; u += 1 / SAMPLES_PER_CELL) {
      const slice = cells.filter((c) => along(c) === Math.floor(u));
      if (slice.length === 0) continue;
      const mid = slice.reduce((sum, c) => sum + across(c) + 0.5, 0) / slice.length;
      const drawn = (v: number): boolean => {
        const p = point(u, v);
        return field.inside(p.x, p.y);
      };
      if (!drawn(mid)) continue;
      let lo = mid;
      let hi = mid;
      while (mid - lo < ACROSS_REACH && drawn(lo - ACROSS_STEP)) lo -= ACROSS_STEP;
      while (hi - mid < ACROSS_REACH && drawn(hi + ACROSS_STEP)) hi += ACROSS_STEP;
      widths.push(hi - lo);
      centre.push(point(u, (lo + hi) / 2));
    }
    out.push({ widths, centre });
  }
  return out;
}

/** The share of a centreline, read two cells at a time, that runs within 10° of a grid axis. */
export function axisShare(centre: readonly Vec[]): number {
  const span = 4;
  let aligned = 0;
  let all = 0;
  for (let i = 0; i + span < centre.length; i++) {
    const a = centre[i]!;
    const b = centre[i + span]!;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const off = Math.abs(Math.atan2(Math.sin(4 * angle), Math.cos(4 * angle))) / 4;
    all++;
    if (off < STRAIGHT_TURN) aligned++;
  }
  return all === 0 ? 0 : aligned / all;
}

/** Every chamber's cells, every floor. */
export function chambersOf(model: DungeonModel): CellPoint[][] {
  return model.floors.flatMap((floor) => floor.rooms.filter((room) => room.kind === 'room' && (room.cells?.length ?? 0) > 0).map((room) => room.cells!));
}

