/**
 * The points of the shapes the Draw tool makes. A drawing's `points` are the truth and always the
 * line a pen would have drawn; these make them for a rectangle, an ellipse and a curved path, and
 * read a rectangle's or an ellipse's frame back out of them for the handles.
 */

import type { Point } from '../types/visionTypes';
import { fitsEllipse, fitsRectangle } from './annotationFit';
import { ELLIPSE_STEPS } from './annotationTypes';

/**
 * A rectangle or an ellipse as its handles take it: its centre and its two half axes, world
 * pixels. The rectangle's corners are `centre ± a ± b`, the ellipse is `centre + a·cos t + b·sin t`.
 * The axes need not be square to each other: a stretched map leaves a turned shape oblique.
 */
export interface ShapeFrame {
  readonly centre: Point;
  readonly a: Point;
  readonly b: Point;
}

/** The pieces a curved path has between two of its anchors: anchor `i` is point `i × CURVE_STEPS` of the path. */
export const CURVE_STEPS = 16;

const QUARTER = ELLIPSE_STEPS / 4;
/** The cosines of the four quarter turns, exact, so that an ellipse's axes are among its points to the last bit. */
const QUARTER_COS = [1, 0, -1, 0] as const;

/**
 * The frame of the box dragged from `from` to `to`, its sides turned `turn` degrees (clockwise on
 * screen) from the axes: `from` and `to` stay opposite corners.
 */
export function boxFrame(from: Point, to: Point, turn = 0): ShapeFrame {
  const centre = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const halfX = (to.x - from.x) / 2;
  const halfY = (to.y - from.y) / 2;
  if (!turn) return { centre, a: { x: halfX, y: 0 }, b: { x: 0, y: halfY } };
  const angle = (turn * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = halfX * cos + halfY * sin;
  const across = halfY * cos - halfX * sin;
  return { centre, a: { x: along * cos, y: along * sin }, b: { x: -across * sin, y: across * cos } };
}

/** A rectangle's points from its frame: four corners and the first again. */
export function rectangleOf({ centre, a, b }: ShapeFrame): Point[] {
  const first = { x: centre.x - a.x - b.x, y: centre.y - a.y - b.y };
  return [
    first,
    { x: centre.x + a.x - b.x, y: centre.y + a.y - b.y },
    { x: centre.x + a.x + b.x, y: centre.y + a.y + b.y },
    { x: centre.x - a.x + b.x, y: centre.y - a.y + b.y },
    { x: first.x, y: first.y },
  ];
}

/**
 * An ellipse's points from its frame: `ELLIPSE_STEPS` points of `centre + a·cos t + b·sin t` at
 * even steps of `t`, and the first again. The first point less the centre is `a`, the one a
 * quarter of the way round less the centre is `b`.
 */
export function ellipseOf({ centre, a, b }: ShapeFrame): Point[] {
  const points: Point[] = [];
  for (let step = 0; step < ELLIPSE_STEPS; step++) {
    const quarter = step / QUARTER;
    const exact = Number.isInteger(quarter);
    const t = (2 * Math.PI * step) / ELLIPSE_STEPS;
    const cos = exact ? QUARTER_COS[quarter]! : Math.cos(t);
    const sin = exact ? QUARTER_COS[(quarter + 3) % 4]! : Math.sin(t);
    points.push({ x: centre.x + a.x * cos + b.x * sin, y: centre.y + a.y * cos + b.y * sin });
  }
  points.push({ x: points[0]!.x, y: points[0]!.y });
  return points;
}

/**
 * The rectangle dragged from corner `from` to corner `to`: `from`, the corner beside it along the
 * box's first side, `to`, the fourth corner, and `from` again. `turn` (degrees) turns its sides
 * from the axes; the two dragged corners stay where they are.
 */
export function rectanglePoints(from: Point, to: Point, turn = 0): Point[] {
  if (!turn) {
    // Its corners are the dragged coordinates themselves, with no rounding of a centre between.
    return [{ x: from.x, y: from.y }, { x: to.x, y: from.y }, { x: to.x, y: to.y }, { x: from.x, y: to.y }, { x: from.x, y: from.y }];
  }
  return rectangleOf(boxFrame(from, to, turn));
}

/** The ellipse in the box dragged from `from` to `to`. */
export function ellipsePoints(from: Point, to: Point): Point[] {
  return ellipseOf(boxFrame(from, to));
}

/**
 * The frame `points` have as a rectangle or as an ellipse, or null when they are none: what the
 * reader asks before it takes a drawing's `type` at its word (`annotationFit.ts` holds the rule).
 */
export function frameOf(points: readonly Point[], type: 'rectangle' | 'ellipse'): ShapeFrame | null {
  if (type === 'rectangle') {
    if (!fitsRectangle(points)) return null;
    const [first, second, third, fourth] = points as readonly [Point, Point, Point, Point, Point];
    return {
      centre: { x: (first.x + third.x) / 2, y: (first.y + third.y) / 2 },
      a: { x: (second.x - first.x) / 2, y: (second.y - first.y) / 2 },
      b: { x: (fourth.x - first.x) / 2, y: (fourth.y - first.y) / 2 },
    };
  }
  if (!fitsEllipse(points)) return null;
  const first = points[0]!;
  const opposite = points[ELLIPSE_STEPS / 2]!;
  const quarter = points[QUARTER]!;
  const centre = { x: (first.x + opposite.x) / 2, y: (first.y + opposite.y) / 2 };
  return { centre, a: { x: first.x - centre.x, y: first.y - centre.y }, b: { x: quarter.x - centre.x, y: quarter.y - centre.y } };
}

/**
 * The curve through `anchors`, sampled: `CURVE_STEPS` pieces from each anchor to the next, the
 * anchors themselves among its points, and on a closed path the first anchor again at its end. A
 * closed path needs three anchors; with fewer it is open.
 *
 * A uniform Catmull-Rom spline: each point is a fixed mix of four anchors, so the curve of moved,
 * turned or stretched anchors is the moved, turned or stretched curve. A realigned map stretches
 * `points` and `anchors` alike, and the anchors must still give the points afterwards; a spline
 * that measures the distances between its anchors would not.
 */
export function curvedPath(anchors: readonly Point[], closed: boolean): Point[] {
  const count = anchors.length;
  if (count < 2) return anchors.map(({ x, y }) => ({ x, y }));
  const loop = closed && count >= 3;
  /** The anchor at `index`; past an open path's ends, the end mirrored in its neighbour, so the path leaves straight. */
  const anchor = (index: number): Point => {
    if (loop) return anchors[((index % count) + count) % count]!;
    if (index < 0) return { x: 2 * anchors[0]!.x - anchors[1]!.x, y: 2 * anchors[0]!.y - anchors[1]!.y };
    if (index >= count) return { x: 2 * anchors[count - 1]!.x - anchors[count - 2]!.x, y: 2 * anchors[count - 1]!.y - anchors[count - 2]!.y };
    return anchors[index]!;
  };
  const points: Point[] = [];
  const spans = loop ? count : count - 1;
  for (let span = 0; span < spans; span++) {
    const before = anchor(span - 1);
    const from = anchor(span);
    const to = anchor(span + 1);
    const after = anchor(span + 2);
    points.push({ x: from.x, y: from.y });
    for (let step = 1; step < CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      points.push({
        x: 0.5 * (2 * from.x + (to.x - before.x) * t + (2 * before.x - 5 * from.x + 4 * to.x - after.x) * t2 + (3 * from.x - before.x - 3 * to.x + after.x) * t3),
        y: 0.5 * (2 * from.y + (to.y - before.y) * t + (2 * before.y - 5 * from.y + 4 * to.y - after.y) * t2 + (3 * from.y - before.y - 3 * to.y + after.y) * t3),
      });
    }
  }
  const end = loop ? anchors[0]! : anchors[count - 1]!;
  points.push({ x: end.x, y: end.y });
  return points;
}

/**
 * `to` moved so that the box from `from` is a square (and the ellipse in it a circle): as long
 * as the longer side of the dragged box, towards the quarter the pointer is in.
 */
export function squared(from: Point, to: Point): Point {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const side = Math.max(Math.abs(x), Math.abs(y));
  return { x: from.x + (x < 0 ? -side : side), y: from.y + (y < 0 ? -side : side) };
}

const STEP_15 = Math.PI / 12;

/**
 * `to` moved onto the nearest direction from `from` that is a whole number of 15° steps: the
 * point of that direction nearest to the pointer, so the line's end stays under it. Level and
 * upright lines are level and upright to the last bit.
 */
export function stepped15(from: Point, to: Point): Point {
  const x = to.x - from.x;
  const y = to.y - from.y;
  if (x === 0 && y === 0) return { x: to.x, y: to.y };
  const step = Math.round(Math.atan2(y, x) / STEP_15);
  const quarter = step / 6;
  const exact = Number.isInteger(quarter);
  const index = ((quarter % 4) + 4) % 4;
  const cos = exact ? QUARTER_COS[index]! : Math.cos(step * STEP_15);
  const sin = exact ? QUARTER_COS[(index + 3) % 4]! : Math.sin(step * STEP_15);
  const along = x * cos + y * sin;
  return { x: from.x + along * cos, y: from.y + along * sin };
}
