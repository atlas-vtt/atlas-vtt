/**
 * The points of a line made with the Line mode, as its handles reshape it: its corners, or the
 * anchors its curve runs through. One is dragged, one is added on an edge, one is removed; the
 * line's `points` (and `anchors`) are made again each time.
 */

import type { Point } from '../types/visionTypes';
import { MAX_STROKE_POINTS, type Annotation, type AnnotationPlace, type DrawingAnnotation } from './annotationTypes';
import { segmentDistanceSq } from './lineMath';
import { CURVE_STEPS, curvedPath } from './shapeOutlines';

/** The most points a line shows to be dragged; one with more is reshaped as a whole, like a pen stroke. */
export const MAX_LINE_HANDLES = 64;

const copy = ({ x, y }: Point): Point => ({ x, y });

/** A line's own points: its anchors where it is curved, else its corners, a closed line's first only once. */
function ownPoints(line: DrawingAnnotation): readonly Point[] {
  if (line.anchors) return line.anchors;
  return line.closed ? line.points.slice(0, -1) : line.points;
}

/**
 * The points `annotation` shows to be dragged, in their order; null for anything but a line made
 * with the Line mode, and for one with more than `MAX_LINE_HANDLES`.
 */
export function linePointsOf(annotation: Annotation): readonly Point[] | null {
  if (annotation.kind !== 'drawing' || annotation.shape !== 'line') return null;
  const points = ownPoints(annotation);
  return points.length >= 2 && points.length <= MAX_LINE_HANDLES ? points : null;
}

/** The line through `own` as it is saved: a curve through anchors, or corners with the first again where it is closed. */
function lineOf(line: DrawingAnnotation, own: readonly Point[]): AnnotationPlace | null {
  if (line.anchors) {
    const points = curvedPath(own, line.closed);
    return points.length <= MAX_STROKE_POINTS ? { points, anchors: own.map(copy) } : null;
  }
  const points = own.map(copy);
  if (line.closed) points.push(copy(own[0]!));
  return points.length <= MAX_STROKE_POINTS ? { points } : null;
}

/** The line with its point `index` at `to`. */
export function withPointMoved(line: DrawingAnnotation, index: number, to: Point): AnnotationPlace | null {
  const own = ownPoints(line);
  if (index < 0 || index >= own.length) return null;
  return lineOf(line, own.map((point, at) => (at === index ? copy(to) : point)));
}

/** The line with a point more at `at`, after its point `after`; null where it can hold no more. */
export function withPointAdded(line: DrawingAnnotation, after: number, at: Point): AnnotationPlace | null {
  const own = ownPoints(line);
  if (after < 0 || after >= own.length || own.length >= MAX_LINE_HANDLES) return null;
  return lineOf(line, [...own.slice(0, after + 1), copy(at), ...own.slice(after + 1)]);
}

/** The line without its point `index`; null where it would be none: an open line keeps two points, a closed one three. */
export function withPointRemoved(line: DrawingAnnotation, index: number): AnnotationPlace | null {
  const own = ownPoints(line);
  if (index < 0 || index >= own.length || own.length <= (line.closed ? 3 : 2)) return null;
  return lineOf(line, own.filter((_, at) => at !== index));
}

/**
 * Where a new point would go for a press at `point`: on the line's nearest piece, if that lies
 * within `tolerance`; `after` is the point of the line it follows. Null away from the line.
 */
export function edgeNear(line: DrawingAnnotation, point: Point, tolerance: number): { after: number; at: Point } | null {
  const { points } = line;
  let best = tolerance * tolerance;
  let found: { piece: number; at: Point } | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (segmentDistanceSq(point.x, point.y, a.x, a.y, b.x, b.y) > best) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const at = { x: a.x + t * dx, y: a.y + t * dy };
    best = (point.x - at.x) ** 2 + (point.y - at.y) ** 2;
    found = { piece: i - 1, at };
  }
  if (!found) return null;
  // A curve has `CURVE_STEPS` pieces from each anchor to the next.
  return { after: line.anchors ? Math.floor(found.piece / CURVE_STEPS) : found.piece, at: found.at };
}
