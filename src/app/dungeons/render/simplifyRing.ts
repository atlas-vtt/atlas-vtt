/**
 * A closed ring with fewer corners, never straying from it by more than a tolerance: by
 * Douglas–Peucker (the fewest corners), or corner by corner (`thinCorners`: each decided by its
 * neighbours alone, so a change of the ring changes nothing far from it).
 */

import type { Vec } from './geometry';

/** Points of a closed ring kept by Douglas–Peucker within `tolerance`. */
export function simplifyRing(ring: readonly Vec[], tolerance: number): Vec[] {
  const keep = new Uint8Array(ring.length);
  const stack: [number, number][] = [[0, Math.floor(ring.length / 2)], [Math.floor(ring.length / 2), ring.length]];
  keep[0] = 1;
  keep[Math.floor(ring.length / 2)] = 1;
  while (stack.length) {
    const [from, to] = stack.pop()!;
    const a = ring[from]!;
    const b = ring[to % ring.length]!;
    let far = -1;
    let farthest = tolerance;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDistance(ring[i]!, a, b);
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([from, far], [far, to]);
  }
  return ring.filter((_, i) => keep[i]);
}

/**
 * The ring without the corners it hardly bends at: a corner goes where it lies within `tolerance`
 * of the line between its neighbours and nearer it than either of them does to theirs, so no two
 * neighbours go together; `rounds` times.
 */
export function thinCorners(ring: readonly Vec[], tolerance: number, rounds: number): Vec[] {
  let points = [...ring];
  for (let round = 0; round < rounds && points.length > 8; round++) {
    const n = points.length;
    const bend = points.map((p, i) => segmentDistance(p, points[(i - 1 + n) % n]!, points[(i + 1) % n]!));
    // Ties go by place, so the choice never hangs on where the ring starts.
    const before = (i: number, j: number): boolean => bend[i]! < bend[j]! || (bend[i] === bend[j] && (points[i]!.x < points[j]!.x || (points[i]!.x === points[j]!.x && points[i]!.y < points[j]!.y)));
    points = points.filter((_, i) => !(bend[i]! < tolerance && before(i, (i - 1 + n) % n) && before(i, (i + 1) % n)));
  }
  return points;
}

function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
