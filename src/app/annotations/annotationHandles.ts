/**
 * The handles of selected annotations, as geometry: which ones a selection has, where each stands
 * at a zoom, and which one a point takes. One frame for one annotation or for several: corners
 * scale, sides stretch, a handle above the frame turns. A line made with the Line mode shows its
 * points in place of the sides. Sizes are screen pixels, so the handles keep their size at every zoom.
 */

import type { Point } from '../types/visionTypes';
import type { TextMeasure } from './annotationBounds';
import { frameCorners, framePoint, inFrame, selectionFrame, type Frame, type FramePlace } from './annotationFrame';
import { mapFrame, mapPoint, type Transform } from './annotationTransform';
import type { Annotation, DrawingAnnotation } from './annotationTypes';
import { edgeNear, linePointsOf } from './linePoints';

/** The handles' look and reach, in screen pixels. */
export const HANDLE_LOOK = {
  /** From what is framed to the frame's line. */
  gap: 5,
  /** Half the side of a corner's or side's square, and the radius of a point's dot. */
  grip: 4.5,
  /** The turn handle's disc. */
  turnRadius: 10,
  /** From the frame's top side to the turn handle's middle. */
  stem: 26,
  /** How far from its middle a handle still takes a press: 24 pixels across. */
  reach: 12,
  /** How far from a line a press still lands on its edge. */
  edge: 6,
  /** A side shorter than this has no handle of its own: the corners at its ends are all there is room for. */
  sideRoom: 44,
} as const;

/** One thing of a selection the pointer can take. */
export type HandleRef =
  | ({ readonly kind: 'corner' | 'side' } & FramePlace)
  | { readonly kind: 'turn' }
  /** A point of the line: the `index`-th it shows. */
  | { readonly kind: 'point'; readonly index: number }
  /** A piece of the line, where a click adds a point at `at`, after its point `after`. */
  | { readonly kind: 'edge'; readonly after: number; readonly at: Point }
  /** The inside of the frame, which moves what is framed. */
  | { readonly kind: 'body' };

/** The handles a selection has. */
export interface HandleSet {
  readonly frame: Frame;
  /** How far the ink of what is framed stands out from the frame, world pixels: half a single line's width. */
  readonly ink: number;
  readonly corners: boolean;
  readonly sides: boolean;
  readonly turn: boolean;
  /** The corners keep the frame's proportion whatever the keys: one text, one stamp. */
  readonly proportional: boolean;
  /** The one line whose points show, with those points; null for any other selection. */
  readonly line: DrawingAnnotation | null;
  readonly points: readonly Point[];
}

const NO_POINTS: readonly Point[] = [];
const CORNERS: readonly FramePlace[] = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
const SIDES: readonly FramePlace[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

/**
 * The handles of `annotations` selected together (those that may be moved: none of them locked);
 * null for none. `measure` sizes a text as it is drawn.
 */
export function handlesOf(annotations: readonly Annotation[], measure?: TextMeasure): HandleSet | null {
  const frame = selectionFrame(annotations, measure);
  const [only, ...more] = annotations;
  if (!frame || !only) return null;
  if (more.length > 0) return { frame, ink: 0, corners: true, sides: true, turn: true, proportional: false, line: null, points: NO_POINTS };
  if (only.kind === 'text' || only.shape === 'stamp') return { frame, ink: 0, corners: true, sides: false, turn: true, proportional: true, line: null, points: NO_POINTS };
  const ink = only.width / 2;
  const points = linePointsOf(only);
  if (!points) return { frame, ink, corners: true, sides: true, turn: true, proportional: false, line: null, points: NO_POINTS };
  // Two points are all a straight line is: dragging one turns and scales it.
  const whole = points.length > 2;
  return { frame, ink, corners: whole, sides: false, turn: whole, proportional: false, line: only, points };
}

/** `handles` as a gesture's transform shows them while it lasts: the frame turned or scaled with what it holds. */
export function mapHandles(handles: HandleSet, transform: Transform): HandleSet {
  return { ...handles, frame: mapFrame(handles.frame, transform), points: handles.points.map((point) => mapPoint(transform, point)) };
}

/** How far the frame's line stands out from the frame at `zoom`, world pixels. */
export function frameGrow(handles: HandleSet, zoom: number): number {
  return handles.ink + HANDLE_LOOK.gap / zoom;
}

/** The corners of the frame's line at `zoom`, around it. */
export function frameOutline(handles: HandleSet, zoom: number): Point[] {
  return frameCorners(handles.frame, frameGrow(handles, zoom));
}

/** Where the turn handle stands at `zoom`: above the middle of the frame's top side. */
export function turnSpot(handles: HandleSet, zoom: number): Point {
  return framePoint(handles.frame, { x: 0, y: -1 }, frameGrow(handles, zoom) + HANDLE_LOOK.stem / zoom);
}

/** A handle and where it stands, world pixels. */
export interface HandleSpot {
  readonly ref: HandleRef;
  readonly at: Point;
}

/** Every handle of `handles` that stands at a point, at `zoom`: the line's points first, which are taken before what they lie on. */
export function handleSpots(handles: HandleSet, zoom: number): HandleSpot[] {
  const spots: HandleSpot[] = handles.points.map((at, index) => ({ ref: { kind: 'point', index }, at }));
  const grow = frameGrow(handles, zoom);
  if (handles.turn) spots.push({ ref: { kind: 'turn' }, at: turnSpot(handles, zoom) });
  if (handles.corners) {
    for (const place of CORNERS) spots.push({ ref: { kind: 'corner', ...place }, at: framePoint(handles.frame, place, grow) });
  }
  if (handles.sides) {
    const width = 2 * (handles.frame.halfWidth + grow) * zoom;
    const height = 2 * (handles.frame.halfHeight + grow) * zoom;
    for (const place of SIDES) {
      // A handle in the middle of a side needs the side to be long enough to hold it between its corners.
      if ((place.x === 0 ? width : height) >= HANDLE_LOOK.sideRoom) spots.push({ ref: { kind: 'side', ...place }, at: framePoint(handles.frame, place, grow) });
    }
  }
  return spots;
}

/**
 * What of `handles` the world `point` takes at `zoom`: the nearest handle within reach, a line's
 * point before any other; else the line's edge under it; else the frame's inside. Null outside all of it.
 */
export function handleAt(handles: HandleSet, point: Point, zoom: number): HandleRef | null {
  const reach = HANDLE_LOOK.reach / zoom;
  const nearest = (spots: readonly HandleSpot[]): HandleRef | null => {
    let found: HandleRef | null = null;
    let best = reach;
    for (const { ref, at } of spots) {
      const distance = Math.hypot(point.x - at.x, point.y - at.y);
      if (distance > best) continue;
      best = distance;
      found = ref;
    }
    return found;
  };
  const spots = handleSpots(handles, zoom);
  const grip = nearest(spots.filter(({ ref }) => ref.kind === 'point')) ?? nearest(spots.filter(({ ref }) => ref.kind !== 'point'));
  if (grip) return grip;
  if (handles.line) {
    const edge = edgeNear(handles.line, point, handles.ink + HANDLE_LOOK.edge / zoom);
    if (edge) return { kind: 'edge', ...edge };
  }
  return inFrame(handles.frame, point, frameGrow(handles, zoom)) ? { kind: 'body' } : null;
}

/** Whether `ref` is a handle proper: something that stands on the frame or the line, not their inside or edge. */
export function isGrip(ref: HandleRef | null): ref is Exclude<HandleRef, { kind: 'body' | 'edge' }> {
  return ref !== null && ref.kind !== 'body' && ref.kind !== 'edge';
}
