import type { QPolygon, QShape } from '../types/shapeTypes';
import { assertQ } from './quantizedPoint';

type Pair = readonly [number, number];
interface Contour { ring: number[]; hole: boolean }

function validateRing(ring: QPolygon): void {
  if (ring.length % 2 !== 0) throw new RangeError('A shape ring must contain coordinate pairs');
  for (const coordinate of ring) assertQ(coordinate);
}

/** Twice a ring's signed area, with exact accumulation even when large terms cancel. */
export function signedAreaTwice(ring: QPolygon): bigint {
  validateRing(ring);
  let area = 0n;
  for (let i = 0; i < ring.length; i += 2) {
    const next = (i + 2) % ring.length;
    area += BigInt(ring[i]!) * BigInt(ring[next + 1]!) - BigInt(ring[i + 1]!) * BigInt(ring[next]!);
  }
  return area;
}

function equal(a: Pair, b: Pair): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function collinear(a: Pair, b: Pair, c: Pair): boolean {
  // Coordinates are bounded by 2^24, so these products and their difference remain exact.
  return (b[0] - a[0]) * (c[1] - b[1]) === (b[1] - a[1]) * (c[0] - b[0]);
}

function cleanRing(ring: QPolygon): number[] {
  validateRing(ring);
  const points: Pair[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const point: Pair = [ring[i]! === 0 ? 0 : ring[i]!, ring[i + 1]! === 0 ? 0 : ring[i + 1]!];
    if (points.length && equal(points[points.length - 1]!, point)) continue;
    while (points.length > 1 && collinear(points[points.length - 2]!, points[points.length - 1]!, point)) points.pop();
    points.push(point);
  }
  while (points.length > 1 && equal(points[0]!, points[points.length - 1]!)) points.pop();
  let from = 0;
  while (points.length - from >= 3) {
    const last = points.length - 1;
    if (collinear(points[last - 1]!, points[last]!, points[from]!)) points.pop();
    else if (collinear(points[last]!, points[from]!, points[from + 1]!)) from++;
    else break;
  }
  return points.length - from < 3 ? [] : points.slice(from).flat();
}

function comparePoint(a: QPolygon, ai: number, b: QPolygon, bi: number): number {
  return a[ai + 1]! - b[bi + 1]! || a[ai]! - b[bi]!;
}

function rotateRing(ring: number[]): number[] {
  let start = 0;
  for (let i = 2; i < ring.length; i += 2) {
    if (comparePoint(ring, i, ring, start) < 0) start = i;
  }
  return [...ring.slice(start), ...ring.slice(0, start)];
}

function compareContours(a: Contour, b: Contour): number {
  const first = comparePoint(a.ring, 0, b.ring, 0) || Number(a.hole) - Number(b.hole);
  if (first !== 0) return first;
  for (let i = 2; i < Math.min(a.ring.length, b.ring.length); i += 2) {
    const order = comparePoint(a.ring, i, b.ring, i);
    if (order !== 0) return order;
  }
  return a.ring.length - b.ring.length;
}

/**
 * Cleans normalized boundary rings while preserving their outer/hole winding.
 * Resolve raw self-intersections and assign contour roles before calling this function.
 */
export function canonicalForm(shape: QShape): QShape {
  const contours: Contour[] = [];
  for (const input of shape) {
    const ring = cleanRing(input);
    const area = signedAreaTwice(ring);
    if (area !== 0n) contours.push({ ring: rotateRing(ring), hole: area < 0n });
  }
  contours.sort(compareContours);
  return contours.map(contour => contour.ring);
}
