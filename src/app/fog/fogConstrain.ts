/** What Shift does to a point of a fog shape: a rectangle becomes a square, a polygon's edge keeps to eighths of a turn. */

import type { Point } from '../types/visionTypes';

/**
 * The eight directions an edge is held to, as steps along x and y: along an axis one of them is
 * 0, on a diagonal both are as long, so a held edge is exactly level, upright or diagonal.
 */
const EIGHTHS: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * `to` moved onto the nearest of the eight directions from `from`: where the pointer's place
 * falls on that line. A pointer on `from` gives no direction and stays there.
 */
export function heldToEighth(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return { x: from.x, y: from.y };
  const eighth = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const [sx, sy] = EIGHTHS[eighth]!;
  if (sx === 0) return { x: from.x, y: to.y };
  if (sy === 0) return { x: to.x, y: from.y };
  const along = (dx * sx + dy * sy) / 2;
  return { x: from.x + along * sx, y: from.y + along * sy };
}

/** Whether `point` lies from `from` the way `held` does: on the same ray, and not on `from` itself. */
export function keepsDirection(from: Point, held: Point, point: Point): boolean {
  const ax = held.x - from.x;
  const ay = held.y - from.y;
  const bx = point.x - from.x;
  const by = point.y - from.y;
  const dot = ax * bx + ay * by;
  if (!(dot > 0)) return false;
  return Math.abs(ax * by - ay * bx) <= 1e-9 * Math.hypot(ax, ay) * Math.hypot(bx, by);
}

/**
 * The corner opposite `anchor` of the square a rectangle dragged to `opposite` becomes: as long
 * as the rectangle's longer side, towards the pointer.
 */
export function squaredCorner(anchor: Point, opposite: Point): Point {
  const dx = opposite.x - anchor.x;
  const dy = opposite.y - anchor.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: anchor.x + (dx < 0 ? -side : side), y: anchor.y + (dy < 0 ? -side : side) };
}
