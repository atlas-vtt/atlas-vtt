// Frozen from 29c9495a56eeb8e49b86ff5b2a51d4312bb31dcd src/app/vision/visionGeometry.ts. Only import paths are adapted.
import type { Point } from '../../../src/app/types/visionTypes';

const EPSILON = 1e-10;

/** Line-segment intersection. Returns intersection point or null. */
export function segmentIntersection(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): Point | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < EPSILON) return null;

  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;

  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

/** Ray-segment intersection. Returns parameter t along ray or Infinity. */
export function raySegmentIntersect(
  origin: Point, angle: number,
  p1: Point, p2: Point,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const ex = p2.x - p1.x;
  const ey = p2.y - p1.y;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < EPSILON) return Infinity;

  const t = ((p1.x - origin.x) * ey - (p1.y - origin.y) * ex) / denom;
  const u = ((p1.x - origin.x) * dy - (p1.y - origin.y) * dx) / denom;

  if (t < EPSILON || u < -EPSILON || u > 1 + EPSILON) return Infinity;
  return t;
}

/** Distance squared between two points. */
export function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Distance squared from `point` to the nearest point of segment `a`–`b`. */
export function distSqToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return distSq(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Angle from origin to point in radians [-PI, PI]. */
export function angleTo(origin: Point, target: Point): number {
  return Math.atan2(target.y - origin.y, target.x - origin.x);
}

/** Compute the outward normal of a wall segment (for one-way walls). */
export function wallNormal(
  p1: Point, p2: Point,
  direction: 'left' | 'right',
): Point {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPSILON) return { x: 0, y: 0 };
  if (direction === 'left') {
    return { x: -dy / len, y: dx / len };
  }
  return { x: dy / len, y: -dx / len };
}

/** Check if source is on the blocking side of a one-way wall. */
export function isOnBlockingSide(
  source: Point,
  wallP1: Point, wallP2: Point,
  direction: 'left' | 'right',
): boolean {
  const normal = wallNormal(wallP1, wallP2, direction);
  const toSource = {
    x: source.x - (wallP1.x + wallP2.x) / 2,
    y: source.y - (wallP1.y + wallP2.y) / 2,
  };
  return (normal.x * toSource.x + normal.y * toSource.y) > 0;
}
