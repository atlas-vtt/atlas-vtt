/**
 * The walls round a lit fireplace's firebox (`FireSite.firebox`) on a house's floor: the firebox is
 * cut into the chimney stack, behind the wall line of the stack's face, so the scene opens that
 * line across the mouth and walls the recess along its cheeks and fire-back instead. The fire then
 * burns in the open recess, and its light leaves only through the mouth.
 */

import type { Vec } from '../render/geometry';
import { STEPS, hitsOnRing, type RingHit } from './wallOutline';

const EPS = 1e-6;

/** Where a firebox's cheeks meet the wall ring of the stack's face, and its fire-back's two corners. */
export interface FireboxCut {
  /** On the left cheek, then the right, as the firebox's corners run. */
  cuts: [RingHit, RingHit];
  back: [Vec, Vec];
}

/**
 * Where the cheek from a firebox's back corner `back` towards its mouth corner `mouth` first meets
 * a wall ring, within `reach` cells past the mouth; snapped to the grid every ring corner lies on.
 */
function cheekHit(rings: readonly Vec[][], back: Vec, mouth: Vec, reach: number): RingHit | null {
  const length = Math.hypot(mouth.x - back.x, mouth.y - back.y);
  const across = { x: (mouth.x - back.x) / length, y: (mouth.y - back.y) / length };
  const hits: RingHit[] = [];
  rings.forEach((_, r) => hitsOnRing(rings, r, { at: back, across }, hits));
  const first = hits.filter(h => h.t > EPS && h.t <= length + reach).reduce<RingHit | null>((p, h) => (p && p.t <= h.t ? p : h), null);
  return first && { ...first, point: { x: Math.round(first.point.x * STEPS) / STEPS, y: Math.round(first.point.y * STEPS) / STEPS } };
}

/**
 * A firebox's cut into the wall rings (corners: the mouth's two on the stack's face, then the
 * fire-back's two), or null where a cheek meets no ring within `reach` of the mouth or the two
 * meet different rings.
 */
export function fireboxCut(rings: readonly Vec[][], firebox: readonly Vec[], reach: number): FireboxCut | null {
  const [m0, m1, b1, b0] = firebox as [Vec, Vec, Vec, Vec];
  const left = cheekHit(rings, b0, m0, reach);
  const right = cheekHit(rings, b1, m1, reach);
  return left && right && left.ring === right.ring ? { cuts: [left, right], back: [b0, b1] } : null;
}

function between(p: Vec, a: Vec, b: Vec): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const off = Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / length;
  const along = (dx * (p.x - a.x) + dy * (p.y - a.y)) / (length * length);
  return off < EPS && along > -EPS && along < 1 + EPS;
}

/** Whether a ring's edge from `a` to `b` lies across a firebox's mouth, between its two cuts: no wall stands there. */
export function acrossMouth(cuts: readonly FireboxCut[]): (a: Vec, b: Vec) => boolean {
  return (a, b) => cuts.some(({ cuts: [p, q] }) => between(a, p.point, q.point) && between(b, p.point, q.point));
}

/** The walls of a firebox's recess, cheek to fire-back to cheek, each from one corner to the next. */
export function recessWalls({ cuts: [left, right], back: [b0, b1] }: FireboxCut): [Vec, Vec][] {
  return [[left.point, b0], [b0, b1], [b1, right.point]];
}
