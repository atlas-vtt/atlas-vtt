import { annotationBounds } from '../../annotations/annotationBounds';
import type { Annotation, DrawingAnnotation } from '../../annotations/annotationTypes';
import { segmentsMeet } from '../../annotations/lineMath';
import { dashes } from '../../annotations/strokeLook';

/**
 * What a player's drawing costs whoever builds, draws or cuts it, in numbers that are cheap to
 * work out before any of that is done. The GM decides by them alone (`drawCheck.ts` has the
 * limits): no page's word, and nothing the drawing code may or may not bound by itself.
 */

type Point = DrawingAnnotation['points'][number];

/**
 * Whether the line through `points` meets itself: two of its stretches that do not follow each
 * other have a point in common, or one runs back along the one before it. `closed`: its last
 * point is its first, where its last stretch joins its first one. Stretches without a length are
 * passed over.
 *
 * Every pair is tried (boxes first), which is the square of the points: for lines of a few
 * hundred points, which is all it is asked of.
 */
export function crossesItself(points: readonly Point[], closed: boolean): boolean {
  const line: Point[] = [];
  for (const point of points) {
    const last = line[line.length - 1];
    if (last === undefined || last.x !== point.x || last.y !== point.y) line.push(point);
  }
  const count = line.length - 1;
  if (count < 2) return false;
  for (let i = 0; i < count; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    // The stretch after this one, which shares its end: it may only leave, never run back.
    const joined = i + 1 < count ? i + 1 : closed ? 0 : -1;
    if (joined >= 0 && joined !== i) {
      const c = line[joined + 1]!;
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cross === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return true;
    }
    const [minX, maxX, minY, maxY] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
    for (let j = i + 2; j < count; j++) {
      if (closed && i === 0 && j === count - 1) continue;
      const c = line[j]!;
      const d = line[j + 1]!;
      if (Math.max(c.x, d.x) < minX || Math.min(c.x, d.x) > maxX || Math.max(c.y, d.y) < minY || Math.min(c.y, d.y) > maxY) continue;
      if (segmentsMeet(a, b, c, d)) return true;
    }
  }
  return false;
}

/** The corners a line has: the points it was clicked with where it is a curve, else its points (a closed one's first counted once). */
export function cornersOf(drawing: DrawingAnnotation): number {
  return drawing.anchors !== null ? drawing.anchors.length : drawing.points.length - (drawing.closed ? 1 : 0);
}

const dashCounts = new WeakMap<object, number>();

/** How many dashes or dots a drawing's line is drawn as; none for a line that is whole. Counted once for a record. */
export function dashCount(drawing: DrawingAnnotation): number {
  if (drawing.dash === null || !(drawing.width > 0) || drawing.shape === 'stamp') return 0;
  let count = dashCounts.get(drawing.record);
  if (count === undefined) {
    count = dashes(drawing.points, drawing.width, drawing.dash).length;
    dashCounts.set(drawing.record, count);
  }
  return count;
}

/** What a rectangle's and an ellipse's see-through line count for: their outlines cross nothing. */
const BOX_WEIGHT = 4;
const ROUND_WEIGHT = 16;

/**
 * What a drawing's see-through ink counts for; 0 for ink that hides what it covers, and for a
 * drawing without a line. Such ink is one outline around the whole line, worked out by clipping:
 * its cost grows with the points faster than they do where the line lies over itself. A curve
 * counts four for each point it was clicked with (it is smooth between them), and four dashes
 * or dots count one.
 */
export function seeThroughWeight(drawing: DrawingAnnotation): number {
  if (drawing.shape === 'stamp' || !(drawing.opacity < 1) || !(drawing.width > 0)) return 0;
  const line = drawing.shape === 'rectangle' ? BOX_WEIGHT : drawing.shape === 'ellipse' ? ROUND_WEIGHT : drawing.anchors !== null ? drawing.anchors.length * 4 : drawing.points.length;
  return line + Math.ceil(dashCount(drawing) / 4);
}

/**
 * What a sweep of the eraser may cost at most over `own`: the points of every drawing (a text
 * counts four) whose bounds the sweep's bounds touch, times the stretches of the sweep (a dab
 * is one). The cut tries every stretch of the sweep against every stretch of such a drawing.
 */
export function sweepCost(own: readonly Annotation[], sweep: readonly Point[], radius: number): number {
  if (sweep.length === 0) return 0;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of sweep) {
    minX = Math.min(minX, x - radius);
    minY = Math.min(minY, y - radius);
    maxX = Math.max(maxX, x + radius);
    maxY = Math.max(maxY, y + radius);
  }
  let points = 0;
  for (const annotation of own) {
    const box = annotationBounds(annotation);
    if (box.maxX < minX || box.minX > maxX || box.maxY < minY || box.minY > maxY) continue;
    points += annotation.kind === 'text' ? 4 : annotation.points.length + annotation.holes.reduce((sum, ring) => sum + ring.length, 0);
  }
  return points * Math.max(1, sweep.length - 1);
}
