import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { RayQuery, RayStop } from '../../src/app/vision/gridRays';
import type { OutlineIndex } from '../../src/app/vision/outlineIndex';
import type { WallGrid } from '../../src/app/vision/wallGrid';
import { covers } from '../../src/app/vision/angularSpans';
import { rayHit } from '../../src/app/vision/visionGeometry';

/**
 * Parts of the culled sweep with one rule left out, for the negative controls: each must make
 * the equivalence checks fail.
 */

/** A walk along the ray that stops after the first cell holding any hit, though a nearer hit may lie in a later cell. */
export function firstHitInFirstCell(query: RayQuery, angle: number, limit: number): RayStop {
  const { grid, origin } = query;
  const { scratch, walls, minX, minY, cell, cols, rows, starts, items } = grid;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let cx = Math.floor((origin.x - minX) / cell), cy = Math.floor((origin.y - minY) / cell);
  const best: RayStop = { t: limit, wall: -1 };
  while (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
    const c = cy * cols + cx;
    for (let k = starts[c]!; k < starts[c + 1]!; k++) {
      const i = items[k]!;
      if (scratch.inReach[i] !== query.call || !covers(scratch.from[i]!, scratch.to[i]!, scratch.wraps[i] === 1, angle)) continue;
      const t = rayHit(origin, dx, dy, walls[i]!.p1, walls[i]!.p2);
      if (t < best.t) { best.t = t; best.wall = i; }
    }
    if (best.wall >= 0) return best;
    const tx = dx > 0 ? (minX + (cx + 1) * cell - origin.x) / dx : dx < 0 ? (minX + cx * cell - origin.x) / dx : Infinity;
    const ty = dy > 0 ? (minY + (cy + 1) * cell - origin.y) / dy : dy < 0 ? (minY + cy * cell - origin.y) / dy : Infinity;
    if (Math.min(tx, ty) > limit) return best;
    if (tx <= ty) cx += dx > 0 ? 1 : -1;
    else cy += dy > 0 ? 1 : -1;
  }
  return best;
}

/** An outline index that lists each edge only by the exact bearings of its ends and never falls back to every edge. */
export function looseOutlineIndex(origin: Point, polygon: readonly Point[]): OutlineIndex {
  const buckets = 4096, turn = 2 * Math.PI, n = polygon.length;
  const lists: number[][] = Array.from({ length: buckets }, () => []);
  const bearing = polygon.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));
  for (let i = 0; i < n; i++) {
    let from = bearing[i]!, span = bearing[(i + 1) % n]! - from;
    if (span > Math.PI) span -= turn;
    if (span < -Math.PI) span += turn;
    if (span < 0) { from = bearing[(i + 1) % n]!; span = -span; }
    const a = Math.floor(((from + Math.PI) / turn) * buckets), b = Math.floor(((from + span + Math.PI) / turn) * buckets);
    for (let k = a; k <= b; k++) lists[((k % buckets) + buckets) % buckets]!.push(i);
  }
  const starts = new Int32Array(buckets + 1);
  lists.forEach((list, k) => { starts[k + 1] = starts[k]! + list.length; });
  return { starts, edges: Int32Array.from(lists.flat()) };
}

/** A cache of grids by array alone: a wall replaced or moved in place is never noticed. */
export function gridsByIdentity(build: (walls: readonly WallSegment[]) => WallGrid): (walls: readonly WallSegment[]) => WallGrid {
  const grids = new Map<readonly WallSegment[], WallGrid>();
  return (walls) => {
    let grid = grids.get(walls);
    if (!grid) grids.set(walls, (grid = build(walls)));
    return grid;
  };
}
