/**
 * Whether a drawing's hints still say what its points are. `points` is the truth; `type` and
 * `anchors` only tell the handles how to reshape it, and go stale where something that does not
 * know them changed the points (an eraser's cut, an older Atlas). The reader asks here and reads a
 * drawing whose hint does not fit as a free shape.
 */

import type { Point } from '../types/visionTypes';
import { ELLIPSE_STEPS } from './annotationTypes';

/**
 * How far a point may lie from where its hint puts it, world pixels on either axis. Wide enough
 * for points that were rounded when they were written, and far below what a cut or a move leaves.
 */
export const FIT_TOLERANCE = 0.05;

const near = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) <= FIT_TOLERANCE && Math.abs(a.y - b.y) <= FIT_TOLERANCE;

/** Whether a line ends where it began, with an inside between: at least three corners and the first again. */
export function isClosedPath(points: readonly Point[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  return points.length >= 4 && first !== undefined && last !== undefined && first.x === last.x && first.y === last.y;
}

/** A rectangle's points: four corners of a parallelogram (a stretched map leaves it oblique) and the first again. */
export function fitsRectangle(points: readonly Point[]): boolean {
  if (points.length !== 5 || !isClosedPath(points)) return false;
  const [a, b, c, d] = points as readonly [Point, Point, Point, Point, Point];
  return near({ x: a.x + c.x, y: a.y + c.y }, { x: b.x + d.x, y: b.y + d.y });
}

/**
 * An ellipse's points: `ELLIPSE_STEPS` points of `c + a·cos t + b·sin t` at even steps of `t` and
 * the first again, where `a` and `b` are the first point and the one a quarter turn on, from the centre.
 */
export function fitsEllipse(points: readonly Point[]): boolean {
  if (points.length !== ELLIPSE_STEPS + 1 || !isClosedPath(points)) return false;
  const first = points[0]!;
  const opposite = points[ELLIPSE_STEPS / 2]!;
  const quarter = points[ELLIPSE_STEPS / 4]!;
  const centre = { x: (first.x + opposite.x) / 2, y: (first.y + opposite.y) / 2 };
  const a = { x: first.x - centre.x, y: first.y - centre.y };
  const b = { x: quarter.x - centre.x, y: quarter.y - centre.y };
  for (let step = 0; step < ELLIPSE_STEPS; step++) {
    const t = (2 * Math.PI * step) / ELLIPSE_STEPS;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    if (!near(points[step]!, { x: centre.x + a.x * cos + b.x * sin, y: centre.y + a.y * cos + b.y * sin })) return false;
  }
  return true;
}

/**
 * A curved path's anchors: at least two, each one of `points` and in their order, the first at the
 * path's start and, on an open path, the last at its end. Anchors a move left behind, or of which
 * a cut took some away, are none.
 */
export function fitsAnchors(points: readonly Point[], anchors: readonly Point[]): boolean {
  if (anchors.length < 2 || anchors.length > points.length) return false;
  if (!near(points[0]!, anchors[0]!)) return false;
  if (!isClosedPath(points) && !near(points[points.length - 1]!, anchors[anchors.length - 1]!)) return false;
  let at = 0;
  for (const anchor of anchors) {
    while (at < points.length && !near(points[at]!, anchor)) at++;
    if (at === points.length) return false;
  }
  return true;
}
