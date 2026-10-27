/**
 * Where ways meet, painted maps round the corner between them instead of leaving it square, and a walk
 * widens a little where it meets a door. Each rounding is a fillet: the piece of ground between the
 * two edges and a quarter circle touching both, worked out from the edges themselves (a straight edge,
 * or the turning circle's), so the ways are joined in one union and never grown and shrunk.
 */

import type { Vec } from '../geometry';

/** How far a fillet reaches into what it joins, so a wavering edge leaves no seam. */
const OVERLAP = 0.06;
/** How many straight pieces draw a fillet's quarter circle. */
const ARC_STEPS = 6;

const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/**
 * The fillet in the corner `corner` between an edge running along `along` (the edge of the way that
 * ends there, `from` its outward side) and a straight edge across it, the edge of what it meets
 * (`along` pointing into that): a quarter circle of `radius` touching both.
 */
export function squareFillet(corner: Vec, along: Vec, from: Vec, radius: number): Vec[] {
  const centre = add(add(corner, from, radius), along, -radius);
  const start = add(corner, along, -radius);
  const end = add(corner, from, radius);
  return filletPiece(corner, start, end, centre, radius, along);
}

/**
 * The fillet where the edge through `point` running along `along` (towards the circle; `from` its
 * outward side) meets the circle round `centre` of `radius` from outside it: a circle of `fillet`
 * touching both, on the edge's outward side. Null where the edge misses the circle.
 */
export function circleFillet(point: Vec, along: Vec, from: Vec, centre: Vec, radius: number, fillet: number): Vec[] | null {
  // First where the line meets a circle of `r` round the turn's centre, going along it from `p`.
  const meet = (p: Vec, r: number): Vec | null => {
    const d = { x: p.x - centre.x, y: p.y - centre.y };
    const b = d.x * along.x + d.y * along.y;
    const disc = b * b - (d.x * d.x + d.y * d.y - r * r);
    return disc < 0 ? null : add(p, along, -b - Math.sqrt(disc));
  };
  const corner = meet(point, radius);
  const middle = meet(add(point, from, fillet), radius + fillet);
  if (!corner || !middle) return null;
  const start = add(middle, from, -fillet);
  const toward = { x: (middle.x - centre.x) / (radius + fillet), y: (middle.y - centre.y) / (radius + fillet) };
  const end = add(centre, toward, radius);
  return filletPiece(corner, start, end, middle, fillet, { x: -toward.x, y: -toward.y });
}

/** The ground between a corner, the two points where a fillet touches its edges, and the fillet's arc between them. */
function filletPiece(corner: Vec, start: Vec, end: Vec, centre: Vec, radius: number, into: Vec): Vec[] {
  const a0 = Math.atan2(end.y - centre.y, end.x - centre.x);
  let a1 = Math.atan2(start.y - centre.y, start.x - centre.x);
  // The short way round, from where it touches what it meets back to the way that ends.
  while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
  while (a0 - a1 > Math.PI) a1 += Math.PI * 2;
  const arc = Array.from({ length: ARC_STEPS + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / ARC_STEPS;
    return { x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius };
  });
  return [add(corner, into, OVERLAP), add(end, into, OVERLAP), ...arc, corner];
}
