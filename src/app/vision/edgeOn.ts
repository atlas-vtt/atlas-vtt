import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { covers } from './angularSpans';
import type { RayQuery, RayStop } from './gridRays';
import { rayHit } from './visionGeometry';

/**
 * A wall whose line passes nearer the origin than this share of its far end's distance is seen
 * edge-on. Where a ray meets any other wall, the sweep's arithmetic rounds the distance by less
 * than five parts in 10¹¹ of it; along a wall seen edge-on the rounding has no such bound, so a
 * ray may stop on it far from where the wall stands.
 */
const EDGE_ON = 1e-5;

/**
 * Whether `wall` is seen edge-on from `origin`: its line passes within `EDGE_ON` of its far end's
 * distance, but not through the origin to the last bit. `cross` is what the sweep divides to get
 * a ray's distance to the wall (`rayHit`), whatever the ray: where it is exactly zero, every
 * distance is zero and the wall stops no ray at all, so there is no rounding to be wary of. Such
 * are a wall that ends at the origin and, on a map drawn on a grid, every wall of the row and
 * column a place on a grid line lies in.
 */
export function seenEdgeOn(wall: WallSegment, origin: Point): boolean {
  const { p1, p2 } = wall;
  const ex = p2.x - p1.x, ey = p2.y - p1.y;
  const cross = (p1.x - origin.x) * ey - (p1.y - origin.y) * ex;
  if (cross === 0) return false;
  const far = Math.max((p1.x - origin.x) ** 2 + (p1.y - origin.y) ** 2, (p2.x - origin.x) ** 2 + (p2.y - origin.y) ** 2);
  return cross * cross < EDGE_ON * EDGE_ON * far * (ex * ex + ey * ey);
}

/**
 * Moves `stop` to the nearest hit before it of the ray at `angle` (direction `dx`, `dy`) on a wall
 * seen edge-on, as the full sweep tests such a wall. The distance the sweep works out along one
 * may lie well before the wall stands, in a cell that does not list it and that a walk another
 * wall stops never leaves, so these walls are tested for the ray itself, whatever the cells hold.
 */
export function stopOnEdgeOn(query: RayQuery, angle: number, dx: number, dy: number, stop: RayStop): void {
  const { scratch, walls } = query.grid;
  for (const i of query.edgeOn) {
    if (!covers(scratch.from[i]!, scratch.to[i]!, scratch.wraps[i] === 1, angle)) continue;
    const t = rayHit(query.origin, dx, dy, walls[i]!.p1, walls[i]!.p2);
    if (t < stop.t) {
      stop.t = t;
      stop.wall = i;
    }
  }
}
