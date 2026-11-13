/**
 * The rules of editing a fog area by its corners: which corner or edge the pointer is on, the
 * outline a moved, added or removed corner leaves, and which outlines an area may have. An area
 * is one outline that does not cross itself and encloses ground.
 */

import type { Point } from '../types/visionTypes';
import { hasArea } from '../vision/polygonArea';

type Outline = readonly Point[];

/** A rectangle along the axes, as a rectangle area holds it. */
export interface AreaRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const isPlace = (point: Point): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);

/** The corner of `outline` at `point`: the nearest within `reach`, the first of two as near. Null where none is. */
export function cornerAt(outline: Outline, point: Point, reach: number): number | null {
  let found: number | null = null;
  let best = reach;
  outline.forEach((corner, index) => {
    const away = Math.hypot(point.x - corner.x, point.y - corner.y);
    if (away < best || (found === null && away === best)) {
      best = away;
      found = index;
    }
  });
  return found;
}

/**
 * The edge of `outline` that `point` lies on, within `reach`: the corner the edge starts at, and
 * the place on the edge nearest the pointer, where a corner added there would lie. Null away
 * from every edge.
 */
export function edgeAt(outline: Outline, point: Point, reach: number): { index: number; point: Point } | null {
  let found: { index: number; point: Point } | null = null;
  let best = reach;
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!;
    const b = outline[(index + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    if (!(length > 0)) continue;
    const along = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
    const on = { x: a.x + dx * along, y: a.y + dy * along };
    const away = Math.hypot(point.x - on.x, point.y - on.y);
    if (away < best || (found === null && away === best)) {
      best = away;
      found = { index, point: on };
    }
  }
  return found;
}

/** Which side of the line from `a` to `b` the point `c` lies on: positive, negative, or 0 on it. */
function side(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/** Whether the edges from `a` to `b` and from `c` to `d` cross each other between their ends. */
function edgesCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** Whether two edges of the closed `outline` cross. Edges that only touch, as neighbours do at their corner, do not. */
export function outlineCrossesItself(outline: Outline): boolean {
  const count = outline.length;
  for (let i = 0; i < count; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % count]!;
    for (let j = i + 2; j < count; j++) {
      // The last edge ends on the first one's corner.
      if (i === 0 && j === count - 1) continue;
      if (edgesCross(a, b, outline[j]!, outline[(j + 1) % count]!)) return true;
    }
  }
  return false;
}

/** Whether `outline` can be an area's: three corners or more, each a place, enclosing ground, no edge crossing another. */
export function isAreaOutline(outline: Outline): boolean {
  return outline.length >= 3 && outline.every(isPlace) && hasArea(outline) && !outlineCrossesItself(outline);
}

/** `outline` with its corner `index` at `to`. */
export function withCornerAt(outline: Outline, index: number, to: Point): Point[] {
  return outline.map((corner, i) => (i === index ? { x: to.x, y: to.y } : { x: corner.x, y: corner.y }));
}

/** `outline` with a corner at `point` on the edge that starts at corner `index`: the new corner is `index + 1`. */
export function withCornerAdded(outline: Outline, index: number, point: Point): Point[] {
  const corners = outline.map((corner) => ({ x: corner.x, y: corner.y }));
  corners.splice(index + 1, 0, { x: point.x, y: point.y });
  return corners;
}

/** `outline` without its corner `index`; null where that leaves no area's outline: fewer than three corners, or edges that cross. */
export function withoutCorner(outline: Outline, index: number): Point[] | null {
  if (outline.length <= 3 || index < 0 || index >= outline.length) return null;
  const corners = outline.filter((_, i) => i !== index).map((corner) => ({ x: corner.x, y: corner.y }));
  return isAreaOutline(corners) ? corners : null;
}

/** `outline` moved by `dx` and `dy`. */
export function movedOutline(outline: Outline, dx: number, dy: number): Point[] {
  return outline.map((corner) => ({ x: corner.x + dx, y: corner.y + dy }));
}

/**
 * The rectangle a rectangle's dragged corner leaves: from `anchor`, the corner opposite the one
 * dragged, to `to`, so the two edges that meet at the dragged corner follow it. Null where it
 * has no width or no height.
 */
export function rectangleBetween(anchor: Point, to: Point): AreaRectangle | null {
  if (!isPlace(anchor) || !isPlace(to)) return null;
  const width = Math.abs(to.x - anchor.x);
  const height = Math.abs(to.y - anchor.y);
  if (!(width > 0) || !(height > 0)) return null;
  return { x: Math.min(anchor.x, to.x), y: Math.min(anchor.y, to.y), width, height };
}
