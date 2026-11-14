/**
 * Moving, turning, scaling and stretching annotations as their handles do it: a gesture is one
 * map of the plane (`Transform`), and `placedBy` says where it leaves each annotation.
 *
 * A rectangle and an ellipse keep their type through all of it: their frame is mapped and their
 * points are made from it again. Every other line is mapped point by point, with the anchors and
 * holes that lie with its points. A line keeps its width; a text and a stamp keep their shape,
 * take the turn and grow by the mean of the two factors.
 */

import type { Point } from '../types/visionTypes';
import { alongFrame, framePoint, type Frame, type FramePlace } from './annotationFrame';
import { anchorsAndHolesMoved } from './annotationList';
import type { Annotation, AnnotationPlace } from './annotationTypes';
import { ellipseOf, frameOf, rectangleOf } from './shapeOutlines';

/** The plane mapped as `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`. */
export interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
  /** Degrees it turns what it maps, clockwise on screen. */
  readonly turn: number;
}

/** The least a side may be scaled to: a handle dragged past its opposite side leaves a sliver, never a mirrored shape. */
export const MIN_FACTOR = 0.02;
/** A side shorter than this (world pixels) has nothing to scale: a level line has no height. */
const NO_EXTENT = 1e-6;
/** The step a turn snaps to. */
export const TURN_STEP = 15;

/** A sine or cosine without the rounding error a quarter turn leaves, so a shape turned 90° lands on whole pixels. */
function exact(value: number): number {
  const whole = Math.round(value);
  return Math.abs(value - whole) < 1e-12 ? whole : value;
}

function trig(degrees: number): { cos: number; sin: number } {
  const angle = (degrees * Math.PI) / 180;
  return { cos: exact(Math.cos(angle)), sin: exact(Math.sin(angle)) };
}

export function mapPoint(transform: Transform, { x, y }: Point): Point {
  return { x: transform.a * x + transform.c * y + transform.tx, y: transform.b * x + transform.d * y + transform.ty };
}

/** A difference of two points as the transform maps it: without its shift. */
function mapVector(transform: Transform, { x, y }: Point): Point {
  return { x: transform.a * x + transform.c * y, y: transform.b * x + transform.d * y };
}

/** Everything moved by (dx, dy). */
export function moveBy(dx: number, dy: number): Transform {
  return { a: 1, b: 0, c: 0, d: 1, tx: dx, ty: dy, turn: 0 };
}

/** Everything turned `degrees` about `centre`. */
export function turnAbout(centre: Point, degrees: number): Transform {
  const { cos, sin } = trig(degrees);
  return { a: cos, b: sin, c: -sin, d: cos, tx: centre.x - cos * centre.x + sin * centre.y, ty: centre.y - sin * centre.x - cos * centre.y, turn: degrees };
}

/** Everything scaled by `sx` and `sy` along axes turned `rotation` degrees, the point `anchor` staying where it is. */
export function scaleAbout(anchor: Point, rotation: number, sx: number, sy: number): Transform {
  const { cos, sin } = trig(rotation);
  const a = sx * cos * cos + sy * sin * sin;
  const d = sx * sin * sin + sy * cos * cos;
  const mixed = (sx - sy) * cos * sin;
  return { a, b: mixed, c: mixed, d, tx: anchor.x - a * anchor.x - mixed * anchor.y, ty: anchor.y - mixed * anchor.x - d * anchor.y, turn: 0 };
}

/** How much the transform grows what keeps its shape: the mean of its two factors. */
export function growthOf(transform: Transform): number {
  return Math.sqrt(Math.abs(transform.a * transform.d - transform.b * transform.c));
}

/** How far the pointer turned about `centre` from `from` to `to`, degrees in (-180, 180]; in whole steps of `TURN_STEP` where `stepped`. */
export function turnBetween(centre: Point, from: Point, to: Point, stepped: boolean): number {
  const start = Math.atan2(from.y - centre.y, from.x - centre.x);
  const now = Math.atan2(to.y - centre.y, to.x - centre.x);
  let degrees = (((now - start) * 180) / Math.PI) % 360;
  if (stepped) degrees = Math.round(degrees / TURN_STEP) * TURN_STEP;
  if (degrees > 180) degrees -= 360;
  else if (degrees <= -180) degrees += 360;
  return degrees || 0;
}

/**
 * The scaling a handle at `grip` of `frame` does once the pointer has moved by `drag` since it
 * took the handle: the side or corner opposite the handle stays where it is. A corner scales both
 * axes, by one factor where `proportional`; a side stretches its own. A side of the frame without
 * a length is left as it is.
 */
export function scaleByHandle(frame: Frame, grip: FramePlace, drag: Point, proportional: boolean): Transform {
  const anchor = framePoint(frame, { x: -grip.x, y: -grip.y });
  const moved = alongFrame(frame, drag);
  const width = 2 * frame.halfWidth;
  const height = 2 * frame.halfHeight;
  let sx = grip.x !== 0 && width > NO_EXTENT ? (width + grip.x * moved.x) / width : 1;
  let sy = grip.y !== 0 && height > NO_EXTENT ? (height + grip.y * moved.y) / height : 1;
  if (proportional && grip.x !== 0 && grip.y !== 0) {
    // The pointer's place on the diagonal from the opposite corner to the handle.
    const diagonal = { x: grip.x * width, y: grip.y * height };
    const lengthSq = diagonal.x * diagonal.x + diagonal.y * diagonal.y;
    sx = sy = lengthSq > NO_EXTENT ? ((diagonal.x + moved.x) * diagonal.x + (diagonal.y + moved.y) * diagonal.y) / lengthSq : 1;
  }
  return scaleAbout(anchor, frame.rotation, Math.max(MIN_FACTOR, sx), Math.max(MIN_FACTOR, sy));
}

/** `frame` as `transform` leaves it, for a transform that turns it or scales it along its own axes. */
export function mapFrame(frame: Frame, transform: Transform): Frame {
  const centre = mapPoint(transform, frame.centre);
  const { cos, sin } = trig(frame.rotation);
  const along = mapVector(transform, { x: cos, y: sin });
  const across = mapVector(transform, { x: -sin, y: cos });
  return {
    centre,
    halfWidth: frame.halfWidth * Math.hypot(along.x, along.y),
    halfHeight: frame.halfHeight * Math.hypot(across.x, across.y),
    rotation: frame.rotation + transform.turn,
  };
}

/** `degrees` within [0, 360). */
const fullTurn = (degrees: number): number => (((degrees % 360) + 360) % 360) || 0;

/**
 * Where `transform` leaves `annotation`: the fields of its geometry that are another (`placeAnnotations`).
 * A rectangle or an ellipse stays one; a text or a stamp is moved, turned and grown as a whole.
 */
export function placedBy(annotation: Annotation, transform: Transform): AnnotationPlace {
  const map = (point: Point): Point => mapPoint(transform, point);
  const growth = growthOf(transform);
  if (annotation.kind === 'text') {
    return {
      ...map(annotation),
      ...(transform.turn !== 0 && { rotation: fullTurn(annotation.rotation + transform.turn) }),
      ...(Math.abs(growth - 1) > 1e-12 && { scale: annotation.scale * growth }),
    };
  }
  if (annotation.shape === 'stamp') {
    return {
      points: annotation.points.map(map),
      ...(transform.turn !== 0 && { rotation: fullTurn(annotation.rotation + transform.turn) }),
      ...(Math.abs(growth - 1) > 1e-12 && { width: annotation.width * growth }),
    };
  }
  const lying = anchorsAndHolesMoved(annotation.record, map);
  const shape = annotation.shape === 'rectangle' || annotation.shape === 'ellipse' ? frameOf(annotation.points, annotation.shape) : null;
  if (!shape) return { points: annotation.points.map(map), ...lying };
  const frame = { centre: map(shape.centre), a: mapVector(transform, shape.a), b: mapVector(transform, shape.b) };
  return { points: annotation.shape === 'rectangle' ? rectangleOf(frame) : ellipseOf(frame), ...lying };
}

/** Where `transform` leaves each of `annotations`, by id. */
export function placesBy(annotations: readonly Annotation[], transform: Transform): Record<string, AnnotationPlace> {
  const places: Record<string, AnnotationPlace> = {};
  for (const annotation of annotations) places[annotation.id] = placedBy(annotation, transform);
  return places;
}
