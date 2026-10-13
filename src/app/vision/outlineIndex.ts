import type { Point } from '../types/visionTypes';
import { rayHit } from './visionGeometry';

const TURN = 2 * Math.PI;
const BUCKETS = 4096;
/** Each edge is listed this much (radians) beyond the bearings of its ends, more than any rounding of a hit at its end. */
const EDGE_SLACK = 1e-6;
/**
 * A corner this near the origin, or nearer than this share of the length of an edge it ends,
 * makes its edges' bearings too uncertain to index: the outline is then sampled over every edge.
 */
const NEAR = 1e-3;
const NEAR_SHARE = 2e-4;
/** An edge whose bearings span this close to half a turn passes too near the origin to index. */
const WIDE = Math.PI - 1e-3;

/** A star-shaped polygon's edges listed by the bearings (from its origin) they span; null where every edge must be tested. */
export interface OutlineIndex {
  starts: Int32Array;
  edges: Int32Array;
}

function bucketOf(angle: number): number {
  return Math.min(BUCKETS - 1, Math.max(0, Math.floor(((angle + Math.PI) / TURN) * BUCKETS)));
}

/**
 * Lists each edge of `polygon` by the bearings it spans as seen from `origin`, or null where that
 * cannot be relied on. `bearing` holds each corner's bearing (`angleTo`) where already known.
 */
export function indexOutline(origin: Point, polygon: readonly Point[], bearing = Float64Array.from(polygon, (p) => Math.atan2(p.y - origin.y, p.x - origin.x))): OutlineIndex | null {
  const n = polygon.length;
  const distanceSq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = polygon[i]!;
    distanceSq[i] = (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2;
    if (distanceSq[i]! < NEAR * NEAR) return null;
  }
  const first = new Int32Array(n), count = new Int32Array(n);
  const starts = new Int32Array(BUCKETS + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const near = NEAR_SHARE * NEAR_SHARE * ((polygon[j]!.x - polygon[i]!.x) ** 2 + (polygon[j]!.y - polygon[i]!.y) ** 2);
    if (distanceSq[i]! < near || distanceSq[j]! < near) return null;
    let from = bearing[i]!, span = bearing[j]! - from;
    if (span > Math.PI) span -= TURN;
    if (span < -Math.PI) span += TURN;
    if (span < 0) { from = bearing[j]!; span = -span; }
    if (span > WIDE) return null;
    const a = Math.floor(((from - EDGE_SLACK + Math.PI) / TURN) * BUCKETS);
    const b = Math.floor(((from + span + EDGE_SLACK + Math.PI) / TURN) * BUCKETS);
    first[i] = a;
    count[i] = Math.min(BUCKETS, b - a + 1);
    for (let k = 0; k < count[i]!; k++) starts[(((a + k) % BUCKETS) + BUCKETS) % BUCKETS + 1]!++;
  }
  for (let k = 0; k < BUCKETS; k++) starts[k + 1]! += starts[k]!;
  const edges = new Int32Array(starts[BUCKETS]!);
  const fill = starts.slice(0, BUCKETS);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < count[i]!; k++) edges[fill[(((first[i]! + k) % BUCKETS) + BUCKETS) % BUCKETS]!++] = i;
  }
  return { starts, edges };
}

/**
 * Where the ray from `origin` at `angle` leaves the polygon: the nearest of its edges, as
 * `raySegmentIntersect` finds it, over the edges `index` lists for the angle (every edge without
 * an index); the origin itself if it misses (never, for a star-shaped polygon).
 */
export function outlineAt(origin: Point, polygon: readonly Point[], angle: number, index: OutlineIndex | null): Point {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const n = polygon.length;
  // The bearing the ray points at, whatever the size of `angle`; none where `angle` is no number or endless.
  const bearing = Math.atan2(dy, dx);
  let reach = Infinity;
  if (!index || Number.isNaN(bearing)) {
    for (let i = 0; i < n; i++) reach = Math.min(reach, rayHit(origin, dx, dy, polygon[i]!, polygon[(i + 1) % n]!));
  } else {
    const bucket = bucketOf(bearing);
    for (let k = index.starts[bucket]!; k < index.starts[bucket + 1]!; k++) {
      const i = index.edges[k]!;
      reach = Math.min(reach, rayHit(origin, dx, dy, polygon[i]!, polygon[(i + 1) % n]!));
    }
  }
  if (!Number.isFinite(reach)) return { ...origin };
  return { x: origin.x + dx * reach, y: origin.y + dy * reach };
}
