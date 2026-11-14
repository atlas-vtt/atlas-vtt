/**
 * What a marquee or a lasso takes: every line it touches. A line is touched when a part of it lies
 * in the area, whether the area holds all of it or its edge only crosses it. A fill's inside is
 * not asked: a marquee drawn within a filled room takes what is in the room, not the room.
 */

import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import { segmentsMeet, windingNumber } from './lineMath';

/** A marquee's box, or a lasso's corners (its last joins its first). */
export type SelectArea = Box | readonly Point[];

export function isLasso(area: SelectArea): area is readonly Point[] {
  return Array.isArray(area);
}

/** The box around `area`; an empty one (nothing touches it) for a lasso with fewer than three corners. */
export function areaBounds(area: SelectArea): Box {
  if (!isLasso(area)) return area;
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  if (area.length < 3) return box;
  for (const { x, y } of area) {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  }
  return box;
}

/** Whether the segment a–b has a point in `box` (Liang-Barsky: the stretch of it inside all four sides is not empty). */
function segmentInBox(a: Point, b: Point, box: Box): boolean {
  let from = 0;
  let to = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Each side as `p·t ≤ q`.
  const sides = [-dx, a.x - box.minX, dx, box.maxX - a.x, -dy, a.y - box.minY, dy, box.maxY - a.y];
  for (let i = 0; i < 8; i += 2) {
    const p = sides[i]!;
    const q = sides[i + 1]!;
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) from = Math.max(from, q / p);
    else to = Math.min(to, q / p);
    if (from > to) return false;
  }
  return true;
}

function lineInBox(line: readonly Point[], box: Box): boolean {
  const first = line[0];
  if (!first) return false;
  if (line.length === 1) return first.x >= box.minX && first.x <= box.maxX && first.y >= box.minY && first.y <= box.maxY;
  for (let i = 1; i < line.length; i++) {
    if (segmentInBox(line[i - 1]!, line[i]!, box)) return true;
  }
  return false;
}

function lineInLasso(line: readonly Point[], lasso: readonly Point[], bounds: Box): boolean {
  const first = line[0];
  if (!first || lasso.length < 3) return false;
  // A line no edge of the lasso crosses lies in it whole or not at all, so its first point answers for it.
  if (windingNumber(first, lasso) !== 0) return true;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (Math.max(a.x, b.x) < bounds.minX || Math.min(a.x, b.x) > bounds.maxX || Math.max(a.y, b.y) < bounds.minY || Math.min(a.y, b.y) > bounds.maxY) continue;
    for (let j = 0, k = lasso.length - 1; j < lasso.length; k = j++) {
      if (segmentsMeet(a, b, lasso[k]!, lasso[j]!)) return true;
    }
  }
  return false;
}

/** Whether `area` touches one of `lines`; `bounds` is the area's own box (`areaBounds`). */
export function areaTouches(area: SelectArea, bounds: Box, lines: readonly (readonly Point[])[]): boolean {
  for (const line of lines) {
    if (isLasso(area) ? lineInLasso(line, area, bounds) : lineInBox(line, area)) return true;
  }
  return false;
}
