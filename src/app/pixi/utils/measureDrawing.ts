/**
 * Drawing shared by the measure tool, the token drag ruler and other people's measurements: the
 * coloured path, its point markers and the measured areas, in the ink of the selection highlight
 * (`MeasureInk`); the distance goes on a `MeasureLabel`.
 */

import type { Point } from '../../grid/hexGeometry';
import type { Measurement } from '../../measure/measureTypes';
import { MEASURE_DOT, type LabelTarget } from './measureLabelLayout';
import type { InkTrace, MeasureInk } from './measureInk';

/** A polyline through world `points`: one stroke, so its joints are as clean as its segments. */
export function drawMeasurePath(ink: MeasureInk, color: number, points: readonly Point[]): void {
  const screen = points.map((point) => ink.screen(point));
  const [first, ...rest] = screen;
  if (!first || rest.length === 0) return;
  ink.stroke((g) => {
    g.moveTo(first.x, first.y);
    for (const point of rest) g.lineTo(point.x, point.y);
  }, color);
}

/** The path ending `gap` before its last point; a last segment shorter than that is left out. */
export function shortenPathEnd(points: readonly Point[], gap: number): Point[] {
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  if (!end || !before) return [...points];
  const length = Math.hypot(end.x - before.x, end.y - before.y);
  if (length <= gap) return points.slice(0, -1);
  const t = (length - gap) / length;
  return [...points.slice(0, -1), { x: before.x + (end.x - before.x) * t, y: before.y + (end.y - before.y) * t }];
}

/** A dot where a measurement turns or ends: a node of its line; where it starts (`origin`), a ring. */
export function drawMeasurePoint(ink: MeasureInk, color: number, point: Point, origin = false): void {
  ink.dot(point, origin ? MEASURE_DOT + 1 : MEASURE_DOT, color, origin);
}

/** A circular area around `center` of `radius` world units: an even wash inside one outline. */
export function drawMeasureCircle(ink: MeasureInk, color: number, center: Point, radius: number): void {
  const { x, y } = ink.screen(center);
  const r = ink.screen({ x: radius, y: 0 }).x;
  // Canvas 2D (the renderer without WebGL) throws on a negative arc radius, which stops the map from rendering.
  if (!(r > 0)) return;
  const trace: InkTrace = (g) => { g.circle(x, y, r); };
  ink.fill(trace, color);
  ink.stroke(trace, color);
}

/** The cone from `start` towards `end` in screen pixels: as long as the distance between them and `coneAngle` degrees wide. */
function coneTrace(start: Point, end: Point, coneAngle: number): InkTrace | null {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (!(distance > 0)) return null;
  const halfAngle = coneAngle * Math.PI / 360;
  const baseAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const leftAngle = baseAngle - halfAngle;
  const rightAngle = baseAngle + halfAngle;
  // The arc runs on from the apex itself: a line to its first point as well would leave a segment of
  // no length there, and the joint around it would lose its rounding.
  return (g) => {
    g.moveTo(start.x, start.y);
    g.arc(start.x, start.y, distance, leftAngle, rightAngle, false);
    g.closePath();
  };
}

/** A cone from `start` towards `end` (world points), `coneAngle` degrees wide: one outline around an even wash. */
export function drawMeasureCone(ink: MeasureInk, color: number, start: Point, end: Point, coneAngle: number): void {
  const trace = coneTrace(ink.screen(start), ink.screen(end), coneAngle);
  if (!trace) return;
  ink.fill(trace, color);
  ink.stroke(trace, color);
}

/**
 * The outline of an area whose body is drawn elsewhere: every ring of world points closed, in one
 * stroke and without a wash.
 */
export function drawMeasureOutline(ink: MeasureInk, color: number, rings: readonly (readonly Point[])[]): void {
  const closed = rings.filter((ring) => ring.length > 2).map((ring) => ring.flatMap((point) => {
    const { x, y } = ink.screen(point);
    return [x, y];
  }));
  if (closed.length === 0) return;
  ink.stroke((g) => {
    for (const ring of closed) g.poly(ring, true);
  }, color);
}

/**
 * Draws `measurement` in `color` onto `ink` (begun at the zoom it is shown at): a ruler's path with a
 * dot at every corner and at its end, a circle around its start, or a cone `coneAngle` degrees wide;
 * then the dot at its start. A square or a line, whose areas are not drawn yet, shows the drag it was made with.
 */
export function drawMeasurement(ink: MeasureInk, color: number, measurement: Measurement, coneAngle: number): void {
  const { shape, points } = measurement;
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return;
  switch (shape) {
    case 'circle':
      drawMeasureCircle(ink, color, start, Math.hypot(end.x - start.x, end.y - start.y));
      break;
    case 'cone':
      drawMeasureCone(ink, color, start, end, coneAngle);
      break;
    case 'ruler':
    case 'square':
    case 'line':
      drawMeasurePath(ink, color, points);
      for (const point of points.slice(1)) drawMeasurePoint(ink, color, point);
      break;
  }
  drawMeasurePoint(ink, color, start, true);
}

/**
 * Where a measurement's distance goes: beside a ruler of one leg, beyond the end of one with corners
 * (whose legs carry their own beside them) and beside a line's drag, above a circle's centre, over
 * the middle of a cone's axis and of a square.
 */
export function measureLabelTarget({ shape, points }: Measurement): LabelTarget {
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return { beside: [] };
  switch (shape) {
    case 'circle':
      return { beside: [start] };
    case 'cone':
      return { over: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
    case 'square':
      return { over: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
    case 'ruler':
    case 'line':
      return points.length > 2 ? { beyond: { from: points[points.length - 2]!, to: end } } : { beside: points };
  }
}
