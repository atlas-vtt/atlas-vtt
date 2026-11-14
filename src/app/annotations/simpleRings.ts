/**
 * A clipped shape as areas that hang together by more than a point.
 *
 * Where two areas meet in a single point (two squares on a diagonal), the clipping library gives
 * them as one ring through that point in some shapes, as an area and a hole that touch there in
 * others, and as two rings in yet others. Here the shape's edges are walked anew, and at such a
 * point the walk always turns back into the area it came along, so areas that only touch in a
 * point are always areas of their own. A ring that then still passes a point twice (its own area
 * comes back to it) is taken apart there: no ring passes a point twice, and what an area closes
 * off is a hole.
 */

import type { QShapePart } from '../lighting/polygonClip';
import type { QPolygon, QShape } from '../types/shapeTypes';

/** Twice the area a ring winds around, signed: above 0 for an outer ring of a clipped shape, below for a hole. Counted from its first corner, so the numbers stay whole. */
export function ringArea(ring: QPolygon): number {
  const x0 = ring[0] ?? 0;
  const y0 = ring[1] ?? 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    twice += (ring[i]! - x0) * (ring[j + 1]! - y0) - (ring[j]! - x0) * (ring[i + 1]! - y0);
  }
  return twice;
}

/**
 * The rings the edges of `shape` make when every walk along them keeps to its own area: at a
 * corner where more edges leave than one, it takes the one that turns most towards the inside
 * (the side an outer ring's inside lies on, and a hole's outside).
 */
function walkedRings(shape: QShape): QPolygon[] {
  const from: number[] = [];
  const to: number[] = [];
  /** The edges that leave each corner, by corner. */
  const leaving = new Map<string, number[]>();
  for (const ring of shape) {
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const corner = `${ring[i]},${ring[i + 1]}`;
      const edges = leaving.get(corner);
      if (edges) edges.push(from.length / 2);
      else leaving.set(corner, [from.length / 2]);
      from.push(ring[i]!, ring[i + 1]!);
      to.push(ring[j]!, ring[j + 1]!);
    }
  }
  const count = from.length / 2;
  const walked = new Uint8Array(count);
  /** The edge the walk takes after `edge`: of those not walked yet that leave its end, the one that turns most towards the inside. */
  const after = (edge: number): number | null => {
    const choices = leaving.get(`${to[edge * 2]},${to[edge * 2 + 1]}`) ?? [];
    const dx = to[edge * 2]! - from[edge * 2]!;
    const dy = to[edge * 2 + 1]! - from[edge * 2 + 1]!;
    let best: number | null = null;
    let most = -Infinity;
    for (const choice of choices) {
      if (walked[choice]) continue;
      const cx = to[choice * 2]! - from[choice * 2]!;
      const cy = to[choice * 2 + 1]! - from[choice * 2 + 1]!;
      const turn = Math.atan2(dx * cy - dy * cx, dx * cx + dy * cy);
      if (turn > most) {
        most = turn;
        best = choice;
      }
    }
    return best;
  };
  const rings: QPolygon[] = [];
  for (let start = 0; start < count; start++) {
    if (walked[start]) continue;
    const ring: number[] = [];
    for (let edge: number | null = start; edge !== null; edge = after(edge)) {
      walked[edge] = 1;
      ring.push(from[edge * 2]!, from[edge * 2 + 1]!);
      // Back where the walk began: the ring is closed.
      if (to[edge * 2] === from[start * 2] && to[edge * 2 + 1] === from[start * 2 + 1]) break;
    }
    if (ring.length >= 6) rings.push(ring);
  }
  return rings;
}

/**
 * The loops `ring` falls into at the corners it passes twice; itself where it passes none twice.
 * A walked ring passes a corner twice where its own area comes back to it: around a hole it
 * closes there, or between two holes that touch there.
 */
function loopsOf(ring: QPolygon): QPolygon[] {
  const path: number[] = [];
  /** Where in `path` each of its corners stands, by corner. */
  const places = new Map<string, number>();
  const loops: QPolygon[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i]!;
    const y = ring[i + 1]!;
    const corner = `${x},${y}`;
    const before = places.get(corner);
    if (before === undefined) {
      places.set(corner, path.length / 2);
      path.push(x, y);
      continue;
    }
    // Back at a corner: what was walked since is a loop of its own, and the walk goes on from the corner.
    const loop = path.splice(before * 2);
    for (let j = 2; j < loop.length; j += 2) places.delete(`${loop[j]},${loop[j + 1]}`);
    if (loop.length >= 6) loops.push(loop);
    path.push(x, y);
  }
  if (path.length >= 6) loops.push(path);
  return loops;
}

/** Whether the point (x, y) is inside `ring`. */
function holds(ring: QPolygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const [ax, ay, bx, by] = [ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!];
    if ((ay < y) !== (by < y) && ax + ((y - ay) * (bx - ax)) / (by - ay) > x) inside = !inside;
  }
  return inside;
}

/** Whether the point (x, y) is in `part`: inside its outline and in none of its holes. */
export function partHolds(part: QShapePart, x: number, y: number): boolean {
  return holds(part.outline, x, y) && !part.holes.some((hole) => holds(hole, x, y));
}

/**
 * A point strictly inside `part` (its holes may be left out for a point inside its outline):
 * halfway between its lowest corner's level and the next level any corner lies at, in the middle
 * of the first stretch of that line inside it. Null for a part without height.
 */
export function pointInPart(part: QShapePart): { x: number; y: number } | null {
  const rings = [part.outline, ...part.holes];
  let low = Infinity;
  for (let i = 1; i < part.outline.length; i += 2) low = Math.min(low, part.outline[i]!);
  let next = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i += 2) {
      if (ring[i]! > low && ring[i]! < next) next = ring[i]!;
    }
  }
  if (!Number.isFinite(next)) return null;
  const y = (low + next) / 2;
  const crossings: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const [ax, ay, bx, by] = [ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!];
      if ((ay < y) !== (by < y)) crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
  }
  if (crossings.length < 2) return null;
  crossings.sort((a, b) => a - b);
  return { x: (crossings[0]! + crossings[1]!) / 2, y };
}

/**
 * `shape` (the rings of a clipped shape: outer rings and holes that do not cross) as its separate
 * areas, each with its holes. No ring of them passes a corner twice; areas that touch in single
 * points are apart, and a hole lies in the smallest area around it.
 */
export function simpleParts(shape: QShape): QShapePart[] {
  const areas: { outline: QPolygon; holes: QPolygon[]; size: number }[] = [];
  const holes: QPolygon[] = [];
  for (const walked of walkedRings(shape)) {
    for (const ring of loopsOf(walked)) {
      const size = ringArea(ring);
      if (size > 0) areas.push({ outline: ring, holes: [], size });
      else if (size < 0) holes.push(ring);
    }
  }
  for (const hole of holes) {
    const inside = pointInPart({ outline: hole, holes: [] });
    if (!inside) continue;
    let around: (typeof areas)[number] | null = null;
    for (const area of areas) {
      if ((around === null || area.size < around.size) && holds(area.outline, inside.x, inside.y)) around = area;
    }
    around?.holes.push(hole);
  }
  return areas.map(({ outline, holes: cut }) => ({ outline, holes: cut }));
}
