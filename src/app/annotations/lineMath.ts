/**
 * The plane geometry the annotation rules share. The tests that run once per segment of every
 * drawing take plain numbers and make no objects.
 */

import type { Point } from '../types/visionTypes';

/** The squared distance from (px, py) to the segment from (ax, ay) to (bx, by). */
export function segmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = px - ax - t * dx;
  const y = py - ay - t * dy;
  return x * x + y * y;
}

/** The squared distance from `point` to the line through `points` (one point is a dot); Infinity for none. */
export function pathDistanceSq(point: Point, points: readonly Point[]): number {
  const first = points[0];
  if (!first) return Infinity;
  let least = (point.x - first.x) ** 2 + (point.y - first.y) ** 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const distance = segmentDistanceSq(point.x, point.y, a.x, a.y, b.x, b.y);
    if (distance < least) least = distance;
  }
  return least;
}

/** The length of the line through `points`. */
export function pathLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return length;
}

/** Whether the segments a–b and c–d have a point in common. */
export function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // An end of one on the other, or both on one line.
  return (d1 === 0 && segmentDistanceSq(c.x, c.y, a.x, a.y, b.x, b.y) === 0)
    || (d2 === 0 && segmentDistanceSq(d.x, d.y, a.x, a.y, b.x, b.y) === 0)
    || (d3 === 0 && segmentDistanceSq(a.x, a.y, c.x, c.y, d.x, d.y) === 0)
    || (d4 === 0 && segmentDistanceSq(b.x, b.y, c.x, c.y, d.x, d.y) === 0);
}

/** The squared distance between the segments a–b and c–d. */
export function segmentsDistanceSq(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsMeet(a, b, c, d)) return 0;
  return Math.min(
    segmentDistanceSq(a.x, a.y, c.x, c.y, d.x, d.y),
    segmentDistanceSq(b.x, b.y, c.x, c.y, d.x, d.y),
    segmentDistanceSq(c.x, c.y, a.x, a.y, b.x, b.y),
    segmentDistanceSq(d.x, d.y, a.x, a.y, b.x, b.y),
  );
}

/** The squared distance between the lines through `one` and through `other` (a line of one point is a dot); Infinity where either is empty. */
export function linesDistanceSq(one: readonly Point[], other: readonly Point[]): number {
  let least = Infinity;
  if (one.length === 0 || other.length === 0) return least;
  for (let i = 0; i < Math.max(1, one.length - 1); i++) {
    const a = one[i]!;
    const b = one[i + 1] ?? a;
    for (let j = 0; j < Math.max(1, other.length - 1); j++) {
      const c = other[j]!;
      const distance = segmentsDistanceSq(a, b, c, other[j + 1] ?? c);
      if (distance === 0) return 0;
      if (distance < least) least = distance;
    }
  }
  return least;
}

/**
 * How often the outline `ring` winds around `point` (the last corner joins the first; a repeated
 * closing point changes nothing). A fill covers the points it winds around at all, the nonzero
 * rule the clipping library and `filledPieces` fill by, so an outline that crosses itself is
 * filled the same everywhere.
 */
export function windingNumber(point: Point, ring: readonly Point[]): number {
  let winding = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    const side = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (a.y <= point.y) {
      if (b.y > point.y && side > 0) winding++;
    } else if (b.y <= point.y && side < 0) winding--;
  }
  return winding;
}

/** Whether `point` lies in the fill of `outline` less `holes`. */
export function inFill(point: Point, outline: readonly Point[], holes: readonly (readonly Point[])[]): boolean {
  if (windingNumber(point, outline) === 0) return false;
  for (const hole of holes) {
    if (windingNumber(point, hole) !== 0) return false;
  }
  return true;
}
