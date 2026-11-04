import type { Point } from '../../types/visionTypes';
import type { WallInput, WallSegment } from '../../types/wallTypes';
import { distSqToSegment } from '../../vision/visionGeometry';
import { keptByParts } from '../../lighting/segments';

/** Splits never leave a piece shorter than this share of the wall. */
const MIN_SPLIT_SHARE = 0.05;

/** A piece of wall beside a door shorter than this share of the door's width is not kept: the door takes it. */
const MIN_PIECE_SHARE = 0.25;

/** Where the point nearest `at` lies along `wall`, as a share of its length from `p1` (unclamped); null for a zero-length wall. */
export function shareAlong(wall: Pick<WallSegment, 'p1' | 'p2'>, at: Point): number | null {
  const dx = wall.p2.x - wall.p1.x;
  const dy = wall.p2.y - wall.p1.y;
  const lengthSq = dx * dx + dy * dy;
  return lengthSq === 0 ? null : ((at.x - wall.p1.x) * dx + (at.y - wall.p1.y) * dy) / lengthSq;
}

function pointAlong(wall: Pick<WallSegment, 'p1' | 'p2'>, share: number): Point {
  return { x: wall.p1.x + share * (wall.p2.x - wall.p1.x), y: wall.p1.y + share * (wall.p2.y - wall.p1.y) };
}

/** The two walls replacing `wall` when it is split at the point nearest `at`; null for a zero-length wall. */
export function splitWall(wall: WallSegment, at: Point): [WallInput, WallInput] | null {
  const projected = shareAlong(wall, at);
  if (projected === null) return null;
  const split = pointAlong(wall, Math.max(MIN_SPLIT_SHARE, Math.min(1 - MIN_SPLIT_SHARE, projected)));
  const { id: _id, kind: _kind, p1, p2, ...shared } = wall;
  return [{ ...shared, p1, p2: split }, { ...shared, p1: split, p2 }];
}

/**
 * Where a door `width` wide centred at `share` lies on a wall `length` long, as shares of the
 * wall `[start, end]`: on the wall and no wider than it, and taking a piece beside it too short
 * to be a wall, so a door placed in a wall about its width fills it.
 */
export function doorSpan(length: number, share: number, width: number): [number, number] {
  if (length <= 0) return [0, 1];
  const door = Math.min(1, width / length);
  const start = Math.min(1 - door, Math.max(0, share - door / 2));
  const end = start + door;
  const shortest = (width * MIN_PIECE_SHARE) / length;
  return [start < shortest ? 0 : start, 1 - end < shortest ? 1 : end];
}

/**
 * The walls that replace `wall` when a closed door `width` wide is placed at the point nearest
 * `at`: the door and the pieces of wall left beside it, which all keep what the wall blocks and
 * its chain.
 */
export function placeDoor(wall: WallSegment, at: Point, width: number, doorType: 'door' | 'secret-door'): WallInput[] {
  const [start, end] = doorSpan(Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y), shareAlong(wall, at) ?? 0.5, width);
  const shared = keptByParts(wall);
  const from = pointAlong(wall, start);
  const to = pointAlong(wall, end);
  return [
    ...(start > 0 ? [{ type: wall.type, p1: wall.p1, p2: from, ...shared }] : []),
    { type: doorType, p1: from, p2: to, closed: true, ...shared },
    ...(end < 1 ? [{ type: wall.type, p1: to, p2: wall.p2, ...shared }] : []),
  ];
}

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of a freehand stroke. */
export function simplifyStroke(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let farthest = 0;
  let farthestIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = Math.sqrt(distSqToSegment(points[i]!, first, last));
    if (distance > farthest) {
      farthest = distance;
      farthestIndex = i;
    }
  }
  if (farthest <= tolerance) return [first, last];
  const left = simplifyStroke(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyStroke(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}
