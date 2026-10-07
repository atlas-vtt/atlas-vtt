import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';

/**
 * A wall whose line passes nearer the origin than this share of its far end's distance is seen
 * edge-on. Where a ray meets any other wall, the sweep's arithmetic rounds the distance by less
 * than five parts in 10¹¹ of it; along a wall seen edge-on the rounding has no such bound, so a
 * ray may stop on it far from where the wall stands.
 */
const EDGE_ON = 1e-5;

/** Whether `wall` is seen edge-on from `origin`: its line passes within `EDGE_ON` of its far end's distance. */
export function seenEdgeOn(wall: WallSegment, origin: Point): boolean {
  const { p1, p2 } = wall;
  const ex = p2.x - p1.x, ey = p2.y - p1.y;
  const cross = ex * (origin.y - p1.y) - ey * (origin.x - p1.x);
  const far = Math.max((p1.x - origin.x) ** 2 + (p1.y - origin.y) ** 2, (p2.x - origin.x) ** 2 + (p2.y - origin.y) ** 2);
  return cross * cross < EDGE_ON * EDGE_ON * far * (ex * ex + ey * ey);
}
