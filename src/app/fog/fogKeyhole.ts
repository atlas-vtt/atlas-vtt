/**
 * Ground with holes in it as one outline. Fog is filled by the nonzero rule, so an outline that
 * runs out along a line to a hole, round the hole the other way and back along the same line
 * covers the ground and leaves the hole: the slit has no width and takes nothing. A ring corridor
 * round a room is one lasso and one area that way. `outlineRings` gives such an outline back as
 * the rings it is made of, for whoever draws its edge or snaps to it.
 */

import type { Point } from '../types/visionTypes';

type Ring = readonly Point[];

/** The pairs of corners tried for the slit to one hole before the nearest is taken as it is. */
const MOST_TRIES = 48;

const placeOf = (point: Point): string => `${point.x},${point.y}`;
const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

function twiceSigned(ring: Ring): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return twice;
}

/** Which side of the line from `a` to `b` the point `c` lies on: positive, negative, or 0 on it. */
function side(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/** Whether `c`, on the line through `a` and `b`, lies between them. */
function between(a: Point, b: Point, c: Point): boolean {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}

/** Whether the edge from `a` to `b` is in the way of a slit from `p` to `q`: it crosses it, or touches it anywhere but at an end the two share. */
function inTheWay(p: Point, q: Point, a: Point, b: Point): boolean {
  const [pa, pb, ap, aq] = [side(p, q, a), side(p, q, b), side(a, b, p), side(a, b, q)];
  if (pa * pb < 0 && ap * aq < 0) return true;
  if (pa === 0 && between(p, q, a) && !same(a, p) && !same(a, q)) return true;
  if (pb === 0 && between(p, q, b) && !same(b, p) && !same(b, q)) return true;
  if (ap === 0 && between(a, b, p) && !same(p, a) && !same(p, b)) return true;
  return aq === 0 && between(a, b, q) && !same(q, a) && !same(q, b);
}

function clearOf(p: Point, q: Point, rings: readonly Ring[]): boolean {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      if (inTheWay(p, q, ring[i]!, ring[(i + 1) % ring.length]!)) return false;
    }
  }
  return true;
}

/**
 * The corner of `ring` and the corner of `hole` the slit between them runs from and to: the
 * nearest two that nothing of `rings` (every outline there is) lies between, never a corner the
 * ring passes twice (`twice`, a slit's end already). Where none of the nearest is clear, the
 * nearest: the fill is the same.
 */
function slit(ring: Ring, twice: readonly boolean[], hole: Ring, rings: readonly Ring[]): [number, number] {
  let first: [number, number] | null = null;
  // The pairs in the order of their length, each found by looking at all of them: the first is nearly always clear.
  let [after, afterI, afterJ] = [-1, -1, -1];
  for (let tries = 0; tries < MOST_TRIES; tries++) {
    let [best, bestI, bestJ] = [Infinity, -1, -1];
    for (let i = 0; i < ring.length; i++) {
      if (twice[i]) continue;
      const a = ring[i]!;
      for (let j = 0; j < hole.length; j++) {
        const b = hole[j]!;
        const away = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (away >= best) continue;
        // Those tried already come before: shorter, or as long and earlier in the rings.
        if (away < after || (away === after && (i < afterI || (i === afterI && j <= afterJ)))) continue;
        [best, bestI, bestJ] = [away, i, j];
      }
    }
    if (bestI < 0) break;
    first ??= [bestI, bestJ];
    if (clearOf(ring[bestI]!, hole[bestJ]!, rings)) return [bestI, bestJ];
    [after, afterI, afterJ] = [best, bestI, bestJ];
  }
  return first ?? [0, 0];
}

/** How near the hole comes to the ring, corner to corner, squared. */
function nearness(ring: Ring, hole: Ring): number {
  let nearest = Infinity;
  for (const a of ring) {
    for (const b of hole) nearest = Math.min(nearest, (a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }
  return nearest;
}

/**
 * `outer` with `holes` cut out of it, as one outline: from a corner of the outline a slit runs to
 * the nearest corner of each hole, round the hole against the outline's own direction and back.
 * The holes lie inside the outline and apart from each other. Corners are the outlines' own.
 */
export function keyholed(outer: Ring, holes: readonly Ring[]): Point[] {
  let ring: Point[] = outer.map(({ x, y }) => ({ x, y }));
  const turn = Math.sign(twiceSigned(ring));
  const waiting = holes
    .filter((hole) => hole.length >= 3)
    .map((hole) => (Math.sign(twiceSigned(hole)) === turn ? [...hole].reverse() : [...hole]))
    .map((hole) => ({ hole, near: nearness(outer, hole) }))
    // The holes nearest the outline first: a hole behind another is reached from that one.
    .sort((a, b) => a.near - b.near)
    .map(({ hole }) => hole);
  if (waiting.length === 0) return ring;
  /** Which corners of the ring lie where it passes twice: an outline that touches itself there, and the ends of the slits made. */
  const passes = new Map<string, number>();
  for (const corner of ring) passes.set(placeOf(corner), (passes.get(placeOf(corner)) ?? 0) + 1);
  let twice = ring.map((corner) => passes.get(placeOf(corner)) !== 1);
  waiting.forEach((hole, index) => {
    const [i, j] = slit(ring, twice, hole, [ring, ...waiting.slice(index)]);
    const round = [...hole.slice(j), ...hole.slice(0, j + 1)].map(({ x, y }) => ({ x, y }));
    ring = [...ring.slice(0, i + 1), ...round, { ...ring[i]! }, ...ring.slice(i + 1)];
    twice = [...twice.slice(0, i), true, ...round.map((_, at) => at === 0 || at === round.length - 1), true, ...twice.slice(i + 1)];
  });
  return ring;
}

const rings = new WeakMap<Ring, readonly Ring[]>();

/**
 * The rings `outline` is made of: itself where it passes no place twice, else the outline of
 * its ground and of each hole, without the slits between them. The same rings for the same outline.
 */
export function outlineRings(outline: Ring): readonly Ring[] {
  let known = rings.get(outline);
  if (!known) rings.set(outline, known = ringsOf(outline));
  return known;
}

function ringsOf(outline: Ring): readonly Ring[] {
  if (new Set(outline.map(placeOf)).size === outline.length) return [outline];
  /** The corners since the last ring was closed, and where each lies among them. */
  const open: Point[] = [];
  const at = new Map<string, number>();
  const found: Point[][] = [];
  for (const corner of outline) {
    const place = placeOf(corner);
    const before = at.get(place);
    if (before === undefined) {
      at.set(place, open.length);
      open.push(corner);
      continue;
    }
    // Back at a place: what was passed since is a ring of its own, or a slit run out and back.
    const loop = open.splice(before + 1);
    for (const passed of loop) at.delete(placeOf(passed));
    if (loop.length >= 2) found.push([open[before]!, ...loop]);
  }
  if (open.length >= 3) found.push(open);
  return found;
}
