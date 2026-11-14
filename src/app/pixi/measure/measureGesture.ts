/**
 * The measure tool's gesture as a state machine without PIXI: points and keys in, the measurement
 * being made out, and at its end whether it was finished or dropped. What happens to a finished
 * measurement (kept, or left to fade) is its owner's.
 *
 * A press that moves before it is released is a drag: the measurement runs from press to release.
 * A press released in place starts a measurement placed click by click: every click places a point
 * (a ruler's corner; an area's end, which finishes it), and a click on the last point, as the second
 * click of a double click is, or Enter finishes it.
 */

import { MAX_RULER_POINTS, type Measurement, type MeasureShapeKind } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';

/** How far a press may move, in screen pixels, and still be a click: the light markers' threshold (`LIGHT_DRAG_THRESHOLD`). */
export const MEASURE_DRAG_THRESHOLD = 5;

export type GestureResult =
  /** Nothing changed. */
  | { readonly kind: 'none' }
  /** The measurement being made changed: read `MeasureGesture.measurement`. */
  | { readonly kind: 'live' }
  /** The measurement was finished, and the gesture is over. */
  | { readonly kind: 'finish'; readonly measurement: Measurement }
  /** The gesture is over and left nothing. */
  | { readonly kind: 'cancel' };

const NONE: GestureResult = { kind: 'none' };
const LIVE: GestureResult = { kind: 'live' };
const CANCEL: GestureResult = { kind: 'cancel' };

/** Snapped points lie whole cells apart, so half a pixel tells two of them apart. */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

/** The points without those that repeat the one before. */
function withoutRepeats(points: readonly Point[]): Point[] {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]!));
}

export class MeasureGesture {
  private shape: MeasureShapeKind = 'ruler';
  /** The start and every corner placed after it; empty while nothing is measured. */
  private fixed: Point[] = [];
  /** Where the measurement ends now: under the pointer. */
  private end: Point | null = null;
  /** Where the button went down, in screen pixels; null while it is up. */
  private pressedAt: Point | null = null;
  /** The press under way left its place: a drag. */
  private dragged = false;
  /** The first press was released in place: points are placed click by click. */
  private placing = false;

  /** Whether a measurement is being made. */
  get active(): boolean {
    return this.end !== null;
  }

  /** The measurement as it is now: its fixed points and the pointer's; null while none is being made. */
  get measurement(): Measurement | null {
    return this.end ? { shape: this.shape, points: [...this.fixed, this.end] } : null;
  }

  /** The primary button went down at `point` (world, placed as the tool places points) and `screen` with nothing being measured: a measurement of `shape` starts there. */
  begin(shape: MeasureShapeKind, point: Point, screen: Point): GestureResult {
    if (this.active) return NONE;
    this.shape = shape;
    this.fixed = [point];
    this.placing = false;
    return this.press(point, screen);
  }

  /**
   * The button went down again while a measurement is being made: the next click of one placed click
   * by click. A press whose release never came (a pointer the browser took away) gives way to it.
   */
  press(point: Point, screen: Point): GestureResult {
    if (this.fixed.length === 0) return NONE;
    this.pressedAt = screen;
    this.dragged = false;
    this.end = point;
    return LIVE;
  }

  /** The pointer moved, the button down or not. */
  move(point: Point, screen: Point): GestureResult {
    const end = this.end;
    if (!end) return NONE;
    if (this.pressedAt && Math.hypot(screen.x - this.pressedAt.x, screen.y - this.pressedAt.y) > MEASURE_DRAG_THRESHOLD) this.dragged = true;
    if (end.x === point.x && end.y === point.y) return NONE;
    this.end = point;
    return LIVE;
  }

  /** The button came up at `point`. */
  release(point: Point): GestureResult {
    if (!this.pressedAt || !this.active) return NONE;
    this.pressedAt = null;
    if (this.placing) return this.place(point);
    if (this.dragged) return this.finishWith([...this.fixed, point]);
    this.placing = true;
    this.end = point;
    return LIVE;
  }

  /** Space: the place under the pointer becomes a corner of the ruler. */
  corner(): GestureResult {
    const end = this.end;
    const last = this.fixed[this.fixed.length - 1];
    if (!end || !last || this.shape !== 'ruler' || samePoint(end, last) || this.fixed.length >= MAX_RULER_POINTS - 1) return NONE;
    this.fixed.push(end);
    return LIVE;
  }

  /** Backspace: the last corner is taken back. The start stays. */
  back(): GestureResult {
    if (!this.active || this.fixed.length < 2) return NONE;
    this.fixed.pop();
    return LIVE;
  }

  /** Enter: a measurement placed click by click ends where the pointer is. */
  finish(): GestureResult {
    const end = this.end;
    if (!end || !this.placing) return NONE;
    return this.finishWith([...this.fixed, end]);
  }

  /** Escape, or whatever else ends the tool's work: nothing is left. */
  cancel(): GestureResult {
    if (!this.active) return NONE;
    this.reset();
    return CANCEL;
  }

  /** A click while placing: on the last point it finishes; else it ends an area, or is a ruler's next corner. */
  private place(point: Point): GestureResult {
    const last = this.fixed[this.fixed.length - 1]!;
    if (samePoint(point, last)) return this.finishWith(this.fixed);
    if (this.shape !== 'ruler') return this.finishWith([last, point]);
    this.fixed.push(point);
    this.end = point;
    return this.fixed.length >= MAX_RULER_POINTS ? this.finishWith(this.fixed) : LIVE;
  }

  /** Ends the gesture with `points`: a measurement if they have a length, else nothing. */
  private finishWith(points: readonly Point[]): GestureResult {
    const shape = this.shape;
    this.reset();
    const path = withoutRepeats(points);
    if (path.length < 2) return CANCEL;
    return { kind: 'finish', measurement: { shape, points: shape === 'ruler' ? path : [path[0]!, path[path.length - 1]!] } };
  }

  private reset(): void {
    this.fixed = [];
    this.end = null;
    this.pressedAt = null;
    this.dragged = false;
    this.placing = false;
  }
}
