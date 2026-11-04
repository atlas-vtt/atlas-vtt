import type { Point } from '../types/visionTypes';
import type { WallChannel, WallSegment } from '../types/wallTypes';
import { endAngleOf, firstHit, rayQuery, type RayQuery } from './gridRays';
import { endHints, isEndHidden, type EndHints } from './hiddenEnds';
import { BOUNDARY_RAYS, boundaryAngle, rayPlan, type RayPlan } from './rayPlan';
import { awayFromSeam, clearOfEdgeOn, oneWallGap, reachOver, tieSet } from './straightRuns';
import { placeableNumber, sweepableRadius, wallGridOf } from './wallGrid';

/** The plan's rays: each value's direction, how far its ray reaches and the wall it stops on (−1 at the radius, or not cast). */
interface Rays {
  plan: RayPlan;
  dx: Float64Array;
  dy: Float64Array;
  reach: Float64Array;
  wall: Int32Array;
}

/**
 * The full sweep's polygon (`computeVisibility` without a cone) to the last bit, casting rays
 * only where they are needed: towards boundary angles and wall ends the origin can see, and
 * wherever a run of hidden corners does not lie between two rays on one wall, away from the
 * ±π seam and from walls seen edge-on. The corners of hidden ends in such a run are written
 * from that wall. Null where the full sweep must run itself: with a limited wall in reach, or an
 * origin or walls that cannot be placed on a grid (`placeableNumber`), or a radius no walk can end at.
 */
export function culledSweep(origin: Point, radius: number, walls: readonly WallSegment[], channel?: WallChannel): Point[] | null {
  if (!placeableNumber(origin.x) || !placeableNumber(origin.y) || !sweepableRadius(radius)) return null;
  const grid = wallGridOf(walls);
  if (!grid) return null;
  const query = rayQuery(grid, origin, radius, channel);
  if (query.limited) return null;
  const boundary = Array.from({ length: BOUNDARY_RAYS }, (_, i) => firstHit(query, boundaryAngle(i), radius));
  const plan = planRays(query, endHints(Int32Array.from(boundary, (hit) => hit.wall)));
  const rays = castRays(query, plan, boundary);
  settleRuns(query, rays);
  return corners(origin, rays);
}

/** The sweep's angles: the boundary rays, and three at every end in reach, cast or not by whether the end is hidden. */
function planRays(query: RayQuery, hints: EndHints): RayPlan {
  const { grid, origin, reachCount } = query;
  const { scratch, coords, ends } = grid;
  const cast = new Float64Array(2 * reachCount), culled = new Float64Array(2 * reachCount);
  let castCount = 0, culledCount = 0;
  for (let k = 0; k < reachCount; k++) {
    const wall = scratch.reach[k]!;
    for (let slot = wall * 2; slot <= wall * 2 + 1; slot++) {
      const x = coords[slot * 2]!, y = coords[slot * 2 + 1]!;
      if (x === origin.x && y === origin.y) continue;
      const angle = endAngleOf(query, slot), end = ends[slot]!;
      if (scratch.endHidden[end] === 0) scratch.endHidden[end] = isEndHidden(query, x, y, angle, hints) ? 1 : 2;
      if (scratch.endHidden[end] === 1) culled[culledCount++] = angle;
      else cast[castCount++] = angle;
    }
  }
  return rayPlan(cast, castCount, culled, culledCount);
}

/** Every cast value's ray, with the boundary rays already cast. */
function castRays(query: RayQuery, plan: RayPlan, boundary: readonly { t: number; wall: number }[]): Rays {
  const { values, cast, length } = plan;
  const rays: Rays = { plan, dx: new Float64Array(length), dy: new Float64Array(length), reach: new Float64Array(length), wall: new Int32Array(length).fill(-1) };
  let next = 0;
  for (let i = 0; i < length; i++) {
    const angle = values[i]!, dx = Math.cos(angle), dy = Math.sin(angle);
    rays.dx[i] = dx;
    rays.dy[i] = dy;
    if (!cast[i]) continue;
    const hit = next < BOUNDARY_RAYS && angle === boundaryAngle(next) ? boundary[next++]! : firstHit(query, angle, query.radius, dx, dy);
    rays.reach[i] = hit.t;
    rays.wall[i] = hit.wall;
  }
  return rays;
}

/** The hidden values between each two neighbouring cast values, the last run wrapping round to the first cast value. */
function settleRuns(query: RayQuery, rays: Rays): void {
  const { cast, length } = rays.plan;
  let first = 0;
  while (!cast[first]) first++;
  let left = first;
  do {
    let right = left + 1;
    while (right < length && !cast[right]) right++;
    if (right >= length) right = first;
    settle(query, rays, left, right);
    left = right;
  } while (left !== first);
}

/**
 * The hidden values between the cast values `left` and `right` (indices, wrapping at the end of
 * the plan): written from the wall of the run where it passes, else the middle one is cast and
 * the two halves are settled alike.
 */
function settle(query: RayQuery, rays: Rays, left: number, right: number): void {
  const { origin, radius } = query;
  const { plan: { values, length }, dx, dy, reach, wall } = rays;
  const runs: number[] = [left, right];
  while (runs.length > 0) {
    const r = runs.pop()!, l = runs.pop()!;
    const inner = (r - l - 1 + length) % length;
    if (inner === 0) continue;
    const a = { t: reach[l]!, wall: wall[l]! }, b = { t: reach[r]!, wall: wall[r]! };
    if (oneWallGap(query, a, b) && awayFromSeam(values[l]!, values[r]!, r < l) && clearOfEdgeOn(query, values[l]!, values[r]!)) {
      const from = { x: origin.x + dx[l]! * a.t, y: origin.y + dy[l]! * a.t }, to = { x: origin.x + dx[r]! * b.t, y: origin.y + dy[r]! * b.t };
      const ties = tieSet(query, from, to, a.wall >= 0 ? a.wall : b.wall);
      for (let i = (l + 1) % length; i !== r; i = (i + 1) % length) reach[i] = reachOver(query, ties, values[i]!, dx[i], dy[i]);
      continue;
    }
    const middle = (l + 1 + Math.floor((inner - 1) / 2)) % length;
    const hit = firstHit(query, values[middle]!, radius, dx[middle], dy[middle]);
    reach[middle] = hit.t;
    wall[middle] = hit.wall;
    runs.push(l, middle, middle, r);
  }
}

/** The polygon: each value's corner, written as often as the full sweep writes it. */
function corners(origin: Point, { plan, dx, dy, reach }: Rays): Point[] {
  const polygon: Point[] = [];
  for (let i = 0; i < plan.length; i++) {
    const x = origin.x + dx[i]! * reach[i]!, y = origin.y + dy[i]! * reach[i]!;
    for (let n = 0; n < plan.counts[i]!; n++) polygon.push({ x, y });
  }
  return polygon;
}
