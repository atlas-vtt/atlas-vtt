/**
 * The frame a selection's handles stand on: a box about what is selected, turned as it is where
 * one thing with a turn of its own is selected (a text, a stamp, a rectangle, an ellipse), and
 * level around everything else. It is the geometry of what is framed, without its ink: a level
 * line's frame has no height.
 */

import type { Point } from '../types/visionTypes';
import { stampBox, textBox, type TextMeasure, type TurnedBox } from './annotationBounds';
import type { Annotation } from './annotationTypes';
import { frameOf } from './shapeOutlines';

export interface Frame {
  readonly centre: Point;
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** Degrees its sides are turned from the axes, clockwise on screen. */
  readonly rotation: number;
}

/** A place on a frame, in units of its half sides from its centre: (-1, -1) is its first corner, (0, -1) the middle of its top side. */
export interface FramePlace {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

/** How far two half axes may be off square to each other (as the cosine of their angle) and still be a turned box. */
const SQUARE = 1e-6;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

function ofBox(box: TurnedBox, rotation: number): Frame {
  return { centre: { x: box.x, y: box.y }, halfWidth: box.halfWidth, halfHeight: box.halfHeight, rotation };
}

/** The level frame around `points`. */
export function frameAround(points: Iterable<Point>): Frame | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!(minX <= maxX) || !(minY <= maxY)) return null;
  return { centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, halfWidth: (maxX - minX) / 2, halfHeight: (maxY - minY) / 2, rotation: 0 };
}

/** The turned frame of a rectangle or an ellipse whose axes are square to each other; null for one a stretched map left oblique. */
function shapeFrame(points: readonly Point[], type: 'rectangle' | 'ellipse'): Frame | null {
  const shape = frameOf(points, type);
  if (!shape) return null;
  const { centre, a, b } = shape;
  const halfWidth = Math.hypot(a.x, a.y);
  const halfHeight = Math.hypot(b.x, b.y);
  if (halfWidth === 0 || halfHeight === 0 || Math.abs(a.x * b.x + a.y * b.y) > SQUARE * halfWidth * halfHeight) return null;
  // The same box whichever way its first axis points: the turn is told within a half turn, so its top stays up.
  let rotation = (Math.atan2(a.y, a.x) * 180) / Math.PI;
  if (rotation > 90) rotation -= 180;
  else if (rotation <= -90) rotation += 180;
  return { centre, halfWidth, halfHeight, rotation: rotation || 0 };
}

/** The frame of one annotation. `measure` sizes a text as it is drawn. */
export function frameOfAnnotation(annotation: Annotation, measure?: TextMeasure): Frame {
  if (annotation.kind === 'text') return ofBox(textBox(annotation, measure), annotation.rotation);
  if (annotation.shape === 'stamp') return ofBox(stampBox(annotation), annotation.rotation);
  const turned = annotation.shape === 'rectangle' || annotation.shape === 'ellipse' ? shapeFrame(annotation.points, annotation.shape) : null;
  // A read drawing has a point at least.
  return turned ?? frameAround(annotation.points) ?? { centre: { x: 0, y: 0 }, halfWidth: 0, halfHeight: 0, rotation: 0 };
}

/** The point of `frame` at `place`, with the frame grown by `grow` on every side. */
export function framePoint(frame: Frame, place: { readonly x: number; readonly y: number }, grow = 0): Point {
  const angle = radians(frame.rotation);
  const cos = frame.rotation ? Math.cos(angle) : 1;
  const sin = frame.rotation ? Math.sin(angle) : 0;
  const x = place.x * (frame.halfWidth + Math.abs(place.x) * grow);
  const y = place.y * (frame.halfHeight + Math.abs(place.y) * grow);
  return { x: frame.centre.x + x * cos - y * sin, y: frame.centre.y + x * sin + y * cos };
}

/** The four corners of `frame` grown by `grow`, around it from its first. */
export function frameCorners(frame: Frame, grow = 0): [Point, Point, Point, Point] {
  return [framePoint(frame, { x: -1, y: -1 }, grow), framePoint(frame, { x: 1, y: -1 }, grow), framePoint(frame, { x: 1, y: 1 }, grow), framePoint(frame, { x: -1, y: 1 }, grow)];
}

/** `vector` (a difference of two points) as the frame's own axes see it. */
export function alongFrame(frame: Frame, vector: Point): Point {
  if (!frame.rotation) return vector;
  const angle = radians(frame.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos + vector.y * sin, y: vector.y * cos - vector.x * sin };
}

/** Whether `point` lies in `frame` grown by `grow`. */
export function inFrame(frame: Frame, point: Point, grow = 0): boolean {
  const local = alongFrame(frame, { x: point.x - frame.centre.x, y: point.y - frame.centre.y });
  return Math.abs(local.x) <= frame.halfWidth + grow && Math.abs(local.y) <= frame.halfHeight + grow;
}

/**
 * The frame around `annotations`: the one annotation's own, or the level box around the frames of
 * several; null for none.
 */
export function selectionFrame(annotations: readonly Annotation[], measure?: TextMeasure): Frame | null {
  const [first, ...more] = annotations;
  if (!first) return null;
  if (more.length === 0) return frameOfAnnotation(first, measure);
  return frameAround(annotations.flatMap((annotation) => frameCorners(frameOfAnnotation(annotation, measure))));
}
