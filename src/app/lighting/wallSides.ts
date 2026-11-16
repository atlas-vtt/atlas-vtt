import { Q_SCALE, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { shapeContains } from './shapeContains';

/** The two sides of a wall, looking from its `p1` to its `p2`: what a room's floor lies on is told by them (`WallSegment.floor`). */

export type Side = 'left' | 'right';
export interface Segment { p1: Point; p2: Point }

export const lengthOf = ({ p1, p2 }: Segment): number => Math.hypot(p2.x - p1.x, p2.y - p1.y);
export const along = ({ p1, p2 }: Segment, share: number): Point => ({ x: p1.x + share * (p2.x - p1.x), y: p1.y + share * (p2.y - p1.y) });

/** The point `distance` to the `side` of `segment`, beside the point at `share` of its length. */
export function beside(segment: Segment, share: number, side: Side, distance: number): Point {
  const at = along(segment, share);
  const length = lengthOf(segment);
  if (!(length > 0)) return at;
  const sign = side === 'left' ? 1 : -1;
  return { x: at.x + (sign * (segment.p2.y - segment.p1.y) * distance) / length, y: at.y - (sign * (segment.p2.x - segment.p1.x) * distance) / length };
}

/** The side of `segment` that `point` lies on, as `beside` names them. */
export function sideOf(segment: Segment, point: Point): Side {
  return (point.x - segment.p1.x) * (segment.p2.y - segment.p1.y) - (point.y - segment.p1.y) * (segment.p2.x - segment.p1.x) > 0 ? 'left' : 'right';
}

export function distanceTo(segment: Segment, point: Point): number {
  const [dx, dy] = [segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y];
  const lengthSq = dx * dx + dy * dy;
  const share = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - segment.p1.x) * dx + (point.y - segment.p1.y) * dy) / lengthSq));
  return Math.hypot(point.x - (segment.p1.x + share * dx), point.y - (segment.p1.y + share * dy));
}

/**
 * The edges of `shape`, ring by ring, each turned so that the shape lies to its left: an outline one
 * way round and a hole the other, whichever way the rings are kept.
 */
export function edgesWithShapeOnLeft(shape: QShape): Segment[] {
  const edges: Segment[] = [];
  for (const ring of shape) {
    const ringEdges: Segment[] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      ringEdges.push({ p1: { x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE }, p2: { x: ring[next]! / Q_SCALE, y: ring[next + 1]! / Q_SCALE } });
    }
    const longest = ringEdges.reduce<Segment | null>((best, edge) => (best && lengthOf(best) >= lengthOf(edge) ? best : edge), null);
    if (!longest || !(lengthOf(longest) > 0)) continue;
    // A step off the longest edge's middle, small beside it: on the shape's side or not.
    const step = Math.min(1, lengthOf(longest) / 4);
    const onLeft = shapeContains(shape, beside(longest, 0.5, 'left', step));
    edges.push(...(onLeft ? ringEdges : ringEdges.map(({ p1, p2 }) => ({ p1: p2, p2: p1 }))));
  }
  return edges;
}
