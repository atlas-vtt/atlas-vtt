import type { Point } from '../../../types/visionTypes';

/** Corners of a polygon that lie along one ray from the fan's origin, and the nearest of them. */
interface RayRun {
  head: number;
  hub: number;
  tail: number;
}

/**
 * The corners of `polygon` in runs along the rays from `origin`: where a wall's corner hides what
 * lies behind it, the outline runs along a ray. A corner within `tolerance` of the ray through its
 * neighbour lies on it.
 */
function rayRuns(origin: Point, polygon: readonly Point[], tolerance: number): RayRun[] {
  const n = polygon.length;
  const distance = (i: number): number => Math.hypot(polygon[i]!.x - origin.x, polygon[i]!.y - origin.y);
  const alongRay = (i: number): boolean => {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const [ax, ay, bx, by] = [a.x - origin.x, a.y - origin.y, b.x - origin.x, b.y - origin.y];
    return ax * bx + ay * by >= 0 && Math.abs(ax * by - ay * bx) <= tolerance * Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
  };
  let start = 0;
  while (start < n && alongRay((start + n - 1) % n)) start++;
  if (start === n) return [];
  const runs: RayRun[] = [];
  for (let seen = 0; seen < n; seen++) {
    const i = (start + seen) % n;
    const run = runs.at(-1);
    if (run === undefined || !alongRay((i + n - 1) % n)) runs.push({ head: i, hub: i, tail: i });
    else {
      run.tail = i;
      if (distance(i) < distance(run.hub)) run.hub = i;
    }
  }
  return runs;
}

/**
 * Triangles that cover `polygon`, star-shaped around `origin`, each texel once, as indices of
 * `[origin, ...polygon]` in threes. A plain fan does not: where its outline runs along a ray from a
 * near corner to a far one, the triangles on either side end on two different edges that a
 * rasteriser, which rounds every corner to its own grid, does not lay on one line, so a texel
 * centre between them is drawn twice or not at all, and a light adds up to a bright dot there. So
 * all triangles on either side of such a ray end on the edge to its nearest corner, and what lies
 * beyond that corner is a fan of its own.
 */
export function fanTriangles(origin: Point, polygon: readonly Point[], tolerance: number): number[] {
  const indices: number[] = [];
  const triangle = (a: number, b: number, c: number): void => void indices.push(a, b, c);
  const runs = rayRuns(origin, polygon, tolerance);
  const corner = (i: number): number => i + 1;
  runs.forEach((run, r) => {
    const next = runs[(r + 1) % runs.length]!;
    if (run === next) return;
    triangle(0, corner(run.hub), corner(next.hub));
    if (run.tail !== run.hub) triangle(corner(next.hub), corner(run.hub), corner(run.tail));
    if (next.head !== next.hub) triangle(corner(next.hub), corner(run.tail), corner(next.head));
  });
  return indices;
}
