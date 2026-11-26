/**
 * The pen's line: steadied while it is drawn, thinned when it is let go, and drawn as a curve that
 * only rounds its corners. Each step stays within a stated distance of the line before it, so the
 * stroke that is saved is the one that was seen under the pointer.
 */

import type { Point } from '../types/visionTypes';
import { isClosedPath } from './annotationFit';
import { segmentDistanceSq } from './lineMath';

/** How far the steadied line may trail the pointer, screen pixels: divide by the zoom for `steadied`'s `slack`. */
export const STEADY_SLACK = 3;
/** How far a thinned stroke may lie from the drawn one, screen pixels at the zoom it was drawn at. */
export const THIN_TOLERANCE = 0.5;
/**
 * How far the curve may lie from the line through its points, screen pixels at the zoom drawn.
 * The live curve, the thinning and the saved curve together stay under one pixel (0.2 + 0.5 + 0.2).
 */
export const CURVE_TOLERANCE = 0.2;

/** The share of the way to the pointer the steadied point goes with each move. */
const STEADY_SHARE = 0.5;
/**
 * A corner's curve is sampled in straight pieces that turn no more than this, radians (15°): two
 * at least, since one would be the corner cut off flat, and no more than `MAX_CORNER_PIECES`.
 */
const CORNER_PIECE_TURN = Math.PI / 12;
const MIN_CORNER_PIECES = 2;
const MAX_CORNER_PIECES = 8;
/** Two points this close are one, world pixels. */
const SAME_POINT = 1e-9;

/**
 * The next point of a stroke under way: `raw` is where the pointer is, `previous` the point this
 * gave for the move before (null for the stroke's first).
 *
 * An exponential average with its lag capped. Each move goes half of the way to the pointer, which
 * averages the jitter of a hand or a tablet out of a slow line (white jitter comes out at about
 * 0.58 of its size), and the result is then pulled to within `slack` of the pointer, so a fast
 * line never trails by more. It needs nothing but the point before, no clock and no speed, so the
 * same moves always give the same line, and at rest it arrives at the pointer, where a pulled
 * string would stop short of it. The stroke's last point is the pointer itself: add `raw` on release.
 */
export function steadied(previous: Point | null, raw: Point, slack: number): Point {
  if (!previous || !(slack > 0)) return { x: raw.x, y: raw.y };
  const x = previous.x + (raw.x - previous.x) * STEADY_SHARE;
  const y = previous.y + (raw.y - previous.y) * STEADY_SHARE;
  const lag = Math.hypot(raw.x - x, raw.y - y);
  if (lag <= slack) return { x, y };
  const pull = slack / lag;
  return { x: raw.x + (x - raw.x) * pull, y: raw.y + (y - raw.y) * pull };
}

/**
 * `points` without the ones the line does not need (Ramer-Douglas-Peucker): the first and the
 * last stay, every point left out lies within `tolerance` of the line through the ones kept, and
 * so does every piece of the line between them. Worked through a stack of its own, so a long
 * stroke is no deep recursion.
 */
export function thinned(points: readonly Point[], tolerance: number): Point[] {
  const count = points.length;
  if (count <= 2) return points.map(({ x, y }) => ({ x, y }));
  const limit = tolerance > 0 ? tolerance * tolerance : 0;
  const kept = new Uint8Array(count);
  kept[0] = 1;
  kept[count - 1] = 1;
  const spans: number[] = [0, count - 1];
  while (spans.length > 0) {
    const last = spans.pop()!;
    const first = spans.pop()!;
    const a = points[first]!;
    const b = points[last]!;
    const middle = (first + last) / 2;
    let farthest = -1;
    let most = limit;
    for (let i = first + 1; i < last; i++) {
      const distance = segmentDistanceSq(points[i]!.x, points[i]!.y, a.x, a.y, b.x, b.y);
      // Of points equally far the one nearest the middle: an even zigzag is then halved at each step, not peeled a point at a time.
      if (distance > most || (distance === most && farthest >= 0 && Math.abs(i - middle) < Math.abs(farthest - middle))) {
        most = distance;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    kept[farthest] = 1;
    spans.push(first, farthest, farthest, last);
  }
  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    if (kept[i]) result.push({ x: points[i]!.x, y: points[i]!.y });
  }
  return result;
}

function add(curve: Point[], x: number, y: number): void {
  const last = curve[curve.length - 1];
  if (last && Math.abs(last.x - x) <= SAME_POINT && Math.abs(last.y - y) <= SAME_POINT) return;
  curve.push({ x, y });
}

/**
 * The corner at `at` between `before` and `after`, rounded: a quadratic curve from a point on one
 * leg to one as far along the other, bent towards the corner. It leaves each leg no farther from
 * the corner than half the leg, so the curves of neighbouring corners never overlap, and no
 * farther than keeps its middle within `tolerance` of the corner (a corner that hardly turns may
 * be rounded over a long way, a sharp one only close by).
 */
function roundCorner(curve: Point[], before: Point, at: Point, after: Point, tolerance: number): void {
  const inLength = Math.hypot(before.x - at.x, before.y - at.y);
  const outLength = Math.hypot(after.x - at.x, after.y - at.y);
  if (!(inLength > 0) || !(outLength > 0)) {
    add(curve, at.x, at.y);
    return;
  }
  const inX = (before.x - at.x) / inLength;
  const inY = (before.y - at.y) / inLength;
  const outX = (after.x - at.x) / outLength;
  const outY = (after.y - at.y) / outLength;
  // The cosine of half the angle between the legs: 0 on a straight line, 1 where the line turns back.
  const sharpness = Math.min(1, Math.hypot(inX + outX, inY + outY) / 2);
  // A hair under a whole number of pieces is that number: a right angle is six pieces, not seven.
  const pieces = Math.max(MIN_CORNER_PIECES, Math.min(MAX_CORNER_PIECES, Math.ceil((2 * Math.asin(sharpness)) / CORNER_PIECE_TURN - 1e-9)));
  // The curve's middle lies `reach × sharpness / 2` from the corner, its farthest point from the
  // line; the straight pieces it is sampled in lie up to a share of 1 / pieces² of that farther.
  const farthest = (sharpness / 2) * (1 + 1 / (pieces * pieces));
  const reach = Math.min(inLength / 2, outLength / 2, farthest > 0 ? tolerance / farthest : Infinity);
  const fromX = at.x + inX * reach;
  const fromY = at.y + inY * reach;
  const toX = at.x + outX * reach;
  const toY = at.y + outY * reach;
  add(curve, fromX, fromY);
  for (let piece = 1; piece < pieces; piece++) {
    const t = piece / pieces;
    const s = 1 - t;
    add(curve, s * s * fromX + 2 * s * t * at.x + t * t * toX, s * s * fromY + 2 * s * t * at.y + t * t * toY);
  }
  add(curve, toX, toY);
}

/**
 * The curve a pen stroke or a sampled path is drawn as: the line through `points` with every
 * corner rounded, as a line of its own with more points. It starts and ends where `points` does
 * (a line that ends where it began is rounded there too and stays closed), lies within
 * `tolerance` of the line through `points`, and that line within `tolerance` of it. Where the
 * points turn gently, as a thinned stroke's do, the corners' curves meet and the whole is smooth.
 */
export function strokeCurve(points: readonly Point[], tolerance: number): Point[] {
  const count = points.length;
  if (count < 3 || !(tolerance > 0)) return points.map(({ x, y }) => ({ x, y }));
  const curve: Point[] = [];
  if (isClosedPath(points)) {
    const corners = count - 1;
    for (let i = 0; i < corners; i++) roundCorner(curve, points[(i + corners - 1) % corners]!, points[i]!, points[i + 1]!, tolerance);
    const first = curve[0]!;
    const last = curve[curve.length - 1]!;
    if (Math.abs(last.x - first.x) <= SAME_POINT && Math.abs(last.y - first.y) <= SAME_POINT) curve.pop();
    curve.push({ x: first.x, y: first.y });
    return curve;
  }
  add(curve, points[0]!.x, points[0]!.y);
  for (let i = 1; i < count - 1; i++) roundCorner(curve, points[i - 1]!, points[i]!, points[i + 1]!, tolerance);
  add(curve, points[count - 1]!.x, points[count - 1]!.y);
  return curve;
}
