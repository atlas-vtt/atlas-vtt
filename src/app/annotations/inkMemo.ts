/**
 * The ink of see-through drawings, kept while only their place changes. Their even outline is
 * clipped, which costs milliseconds, and a drawing that is dragged or turned is written anew with
 * every step: its ink is then the ink it had, moved and turned the same way, and nothing is
 * clipped again.
 *
 * Kept by the drawing's id, for the drawings worked out last. What is handed back is always
 * checked against the drawing asked for, point by point, so two views that show drawings of one
 * id never see each other's.
 */

import type { Point } from '../types/visionTypes';
import type { DrawingAnnotation } from './annotationTypes';
import type { DrawingInk } from './drawingInk';
import type { FilledPart } from './quantized';

/** The drawings whose ink is kept. */
const MOST_KEPT = 256;
/** How far a moved point may lie from where the motion puts it, world pixels: the rounding of the numbers that moved it. */
const SAME_PLACE = 1e-6;

interface Kept {
  readonly drawing: DrawingAnnotation;
  readonly tolerance: number;
  readonly ink: DrawingInk;
}

/** A move and a turn: the point `from` goes to `to`, and everything turns about it. */
interface Motion {
  readonly cos: number;
  readonly sin: number;
  readonly from: Point;
  readonly to: Point;
}

const kept = new Map<string, Kept>();

const moved = (motion: Motion, point: Point): Point => {
  const x = point.x - motion.from.x;
  const y = point.y - motion.from.y;
  return { x: motion.to.x + motion.cos * x - motion.sin * y, y: motion.to.y + motion.sin * x + motion.cos * y };
};

function follows(motion: Motion, from: readonly Point[], to: readonly Point[]): boolean {
  if (from.length !== to.length) return false;
  for (let i = 0; i < from.length; i++) {
    const at = moved(motion, from[i]!);
    if (Math.abs(at.x - to[i]!.x) > SAME_PLACE || Math.abs(at.y - to[i]!.y) > SAME_PLACE) return false;
  }
  return true;
}

/** The move and turn that takes the points of `from` to those of `to`, holes with them; null where there is none, as after a scaling or a change of a corner. */
function motionBetween(from: DrawingAnnotation, to: DrawingAnnotation): Motion | null {
  const first = from.points[0]!;
  if (from.points.length !== to.points.length || from.holes.length !== to.holes.length) return null;
  let far = first;
  let reach = 0;
  for (const point of from.points) {
    const distance = (point.x - first.x) ** 2 + (point.y - first.y) ** 2;
    if (distance > reach) [far, reach] = [point, distance];
  }
  let [cos, sin] = [1, 0];
  if (reach > 0) {
    const other = to.points[from.points.indexOf(far)]!;
    const [fx, fy, tx, ty] = [far.x - first.x, far.y - first.y, other.x - to.points[0]!.x, other.y - to.points[0]!.y];
    cos = (fx * tx + fy * ty) / reach;
    sin = (fx * ty - fy * tx) / reach;
    // A scaling is no motion: the line's width does not scale the same way its curve's rounding does.
    if (Math.abs(cos * cos + sin * sin - 1) > 1e-9) return null;
  }
  const motion: Motion = { cos, sin, from: first, to: to.points[0]! };
  if (!follows(motion, from.points, to.points)) return null;
  return from.holes.every((hole, index) => follows(motion, hole, to.holes[index]!)) ? motion : null;
}

/** Whether two drawings are drawn alike but for their place and how see-through they are. */
function alike(a: DrawingAnnotation, b: DrawingAnnotation): boolean {
  return a.shape === b.shape && a.closed === b.closed && a.width === b.width && a.dash === b.dash && a.ends === b.ends
    && a.fill === b.fill && (a.anchors === null) === (b.anchors === null);
}

function movedInk(ink: DrawingInk, motion: Motion): DrawingInk {
  if (motion.cos === 1 && motion.sin === 0 && motion.from.x === motion.to.x && motion.from.y === motion.to.y) return ink;
  const line = (points: readonly Point[]): Point[] => points.map((point) => moved(motion, point));
  const parts = (areas: readonly FilledPart[]): FilledPart[] => areas.map(({ outline, holes }) => ({ outline: line(outline), holes: holes.map(line) }));
  return {
    fill: ink.fill && { parts: parts(ink.fill.parts), alpha: ink.fill.alpha },
    lines: ink.lines.map(line),
    heads: ink.heads.map(line),
    even: ink.even && parts(ink.even),
    width: ink.width,
    alpha: ink.alpha,
  };
}

/**
 * The ink of `drawing` at `tolerance` where it is known: the ink kept for its id, moved and
 * turned as the drawing was since. Null where none is kept or the drawing changed in another way.
 */
export function keptInk(drawing: DrawingAnnotation, tolerance: number): DrawingInk | null {
  const known = kept.get(drawing.id);
  if (!known || known.tolerance !== tolerance) return null;
  if (known.drawing === drawing) return known.ink;
  if (!alike(known.drawing, drawing) || known.drawing.opacity !== drawing.opacity) return null;
  const motion = motionBetween(known.drawing, drawing);
  if (!motion) return null;
  const ink = movedInk(known.ink, motion);
  keepInk(drawing, tolerance, ink);
  return ink;
}

/** Keeps `ink` as the ink of `drawing` at `tolerance`. */
export function keepInk(drawing: DrawingAnnotation, tolerance: number, ink: DrawingInk): void {
  kept.delete(drawing.id);
  kept.set(drawing.id, { drawing, tolerance, ink });
  if (kept.size > MOST_KEPT) {
    for (const oldest of kept.keys()) {
      kept.delete(oldest);
      break;
    }
  }
}
