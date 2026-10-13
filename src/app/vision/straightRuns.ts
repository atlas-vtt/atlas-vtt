import type { Point } from '../types/visionTypes';
import { covers, SPAN_SLACK } from './angularSpans';
import { wallsNear, type RayQuery, type RayStop } from './gridRays';
import { rayHit } from './visionGeometry';
import { GRID_MARGIN } from './wallGrid';

/**
 * Between two neighbouring cast rays that stop on one wall inside the radius, the polygon's
 * outline runs along that wall: every hidden corner there lies on it, so it is written from the
 * wall (and the walls that lie along it within a hair) without a ray of its own.
 */

/** Whether the rays on either side of a run of hidden corners stop on one wall (the same object), both inside the radius. */
export function oneWallGap(query: RayQuery, left: RayStop, right: RayStop): boolean {
  if (left.wall < 0 || right.wall < 0 || !(left.t < query.radius) || !(right.t < query.radius)) return false;
  return query.grid.walls[left.wall] === query.grid.walls[right.wall];
}

/**
 * Whether a run lies away from the ±π seam: neither ray's angle beyond −π or π, and the run not
 * wrapping from the end of the angles to their start. There the order of the sweep's angles is
 * not the order of their bearings, so a run's corners might lie beyond either ray.
 */
export function awayFromSeam(left: number, right: number, wraps: boolean): boolean {
  return !wraps && left >= -Math.PI && left <= Math.PI && right >= -Math.PI && right <= Math.PI;
}

/**
 * Whether no wall seen edge-on (`RayQuery.edgeOn`) is tested by any ray between the angles
 * `from` and `to` (a run away from the seam): along such a wall the sweep's rounding is not
 * bounded, so a hidden corner there may lie off the run's wall, and the run is cast instead.
 */
export function clearOfEdgeOn(query: RayQuery, from: number, to: number): boolean {
  const { scratch } = query.grid;
  return query.edgeOn.every((i) => {
    const lo = scratch.from[i]! - 2 * SPAN_SLACK, hi = scratch.to[i]! + 2 * SPAN_SLACK;
    return scratch.wraps[i] === 1 ? to < lo && from > hi : to < lo || from > hi;
  });
}

/**
 * The walls a run's corners are written from: every wall in reach within `GRID_MARGIN` of the
 * chord from `a` to `b` (the corners of its two rays), `wall` among them. A wall that lies along
 * the run's wall within float noise may be the nearer at some corner, and the full sweep takes
 * the nearest.
 */
export function tieSet(query: RayQuery, a: Point, b: Point, wall: number): number[] {
  const near = wallsNear(query, a, b, GRID_MARGIN);
  if (!near.includes(wall)) near.push(wall);
  return near;
}

/** How far the full sweep's ray at `angle` (direction `dx`, `dy`) reaches, worked out over `ties` alone with its own arithmetic. */
export function reachOver(query: RayQuery, ties: readonly number[], angle: number, dx = Math.cos(angle), dy = Math.sin(angle)): number {
  const { origin, radius, grid } = query;
  const { scratch, walls } = grid;
  let reach = radius;
  for (const i of ties) {
    if (!covers(scratch.from[i]!, scratch.to[i]!, scratch.wraps[i] === 1, angle)) continue;
    const wall = walls[i]!;
    reach = Math.min(reach, rayHit(origin, dx, dy, wall.p1, wall.p2));
  }
  return reach;
}
