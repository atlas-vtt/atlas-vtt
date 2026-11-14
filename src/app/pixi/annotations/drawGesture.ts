/**
 * The Draw tool's gesture as a state machine without PIXI: the pointer and keys in, the shape
 * under way out, and at its end what was made. The look it gets and what is written are its
 * owner's (`madeDrawing`).
 *
 * The grammar is the measure tool's. The pen, the eraser and the Cells mode work while the button
 * is down (the last two pass along a path: a sweep, which leaves no shape of its own). A
 * line, a rectangle or an ellipse runs from press to release when the press moves; a press
 * released in place starts one placed click by click: every click is a line's next corner (a
 * click on its last corner, as the second click of a double click is, or Enter ends it; a click
 * on its first corner closes it), and the second click ends a rectangle or an ellipse.
 */

import type { MadeShape } from '../../annotations/madeDrawing';
import { STEADY_SLACK, steadied } from '../../annotations/penStroke';
import { squared, stepped15 } from '../../annotations/shapeOutlines';
import type { Point } from '../../types/visionTypes';

/** How far a press may move, in screen pixels, and still be a click: the measure tool's threshold. */
export const DRAW_DRAG_THRESHOLD = 5;
/** How near to a path's last corner a click ends it, and to its first closes it, in screen pixels. */
export const CORNER_REACH = 8;
/** The corners one path may have: a curved one is sampled sixteen times between two, and must stay a drawing. */
export const MAX_LINE_CORNERS = 1000;

/** The modes that draw by a gesture. */
export type GestureMode = 'pen' | 'line' | 'rectangle' | 'ellipse' | 'cells' | 'eraser';

/** Whether a gesture of `mode` is a sweep: the pointer's path is all it is (the eraser's, the Cells mode's). */
export const sweeps = (mode: GestureMode | null): mode is 'cells' | 'eraser' => mode === 'eraser' || mode === 'cells';

/** Where the pointer is, as the gesture is told of it. */
export interface DrawPointer {
  /** World pixels, as the pointer is: what the pen draws with and the eraser erases with. */
  readonly raw: Point;
  /** World pixels, placed as the tool places a shape's points: on the grid where it snaps. */
  readonly placed: Point;
  /** Screen pixels. */
  readonly screen: Point;
  /** Screen pixels to a world pixel. */
  readonly zoom: number;
  /** Shift: a line in 15° steps, a square, a circle, the pen's straight piece. */
  readonly constrain: boolean;
}

export type DrawGestureResult =
  /** Nothing changed. */
  | { readonly kind: 'none' }
  /** The shape under way changed: read `DrawGesture.shape`. */
  | { readonly kind: 'live' }
  /** A sweep went from `from` to `to` (one place for a dab). */
  | { readonly kind: 'sweep'; readonly from: Point; readonly to: Point }
  /** The gesture is over: `made` is what was drawn, null after a sweep. */
  | { readonly kind: 'finish'; readonly made: MadeShape | null }
  /** The gesture is over and left nothing. */
  | { readonly kind: 'cancel' };

const NONE: DrawGestureResult = { kind: 'none' };
const LIVE: DrawGestureResult = { kind: 'live' };
const CANCEL: DrawGestureResult = { kind: 'cancel' };

const copy = ({ x, y }: Point): Point => ({ x, y });
const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const near = (a: Point, b: Point, zoom: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) * (zoom > 0 ? zoom : 1) <= CORNER_REACH;

export class DrawGesture {
  private current: GestureMode | null = null;
  /** A pen's points so far; a line's corners; a box's first corner. Empty for a sweep. */
  private fixed: Point[] = [];
  /** Where a line or a box ends now, and where a sweep is; null for the pen, whose points are all in `fixed`. */
  private end: Point | null = null;
  /** Where the button went down, in screen pixels; null while it is up. */
  private pressedAt: Point | null = null;
  /** The press under way left its place: a drag. */
  private dragged = false;
  /** The first press was released in place: points are placed click by click. */
  private placing = false;
  /** The pen's point a straight piece runs from while Shift is held, as an index into `fixed`. */
  private straightFrom: number | null = null;

  /** Whether a gesture is under way. */
  get active(): boolean {
    return this.current !== null;
  }

  /** The mode of the gesture under way. */
  get mode(): GestureMode | null {
    return this.current;
  }

  /**
   * The shape as it is now; null while none is drawn, and for a sweep. A pen's `points` are
   * the gesture's own list, which only grows at its end: whoever draws it may keep what it drew
   * of the points before the last.
   */
  get shape(): MadeShape | null {
    const { current: mode, fixed, end } = this;
    if (mode === null || sweeps(mode)) return null;
    if (mode === 'pen') return { mode, points: fixed, closed: false };
    if (!end) return null;
    if (mode === 'line' && this.closes(end)) return { mode, points: [...fixed], closed: true };
    return { mode, points: [...fixed, end], closed: false };
  }

  /** The primary button went down with nothing under way: a gesture of `mode` starts there. */
  begin(mode: GestureMode, at: DrawPointer): DrawGestureResult {
    if (this.active) return NONE;
    this.reset();
    this.current = mode;
    this.pressedAt = at.screen;
    if (mode === 'pen') {
      this.fixed = [copy(at.raw)];
      return LIVE;
    }
    if (sweeps(mode)) {
      this.end = copy(at.raw);
      return { kind: 'sweep', from: this.end, to: this.end };
    }
    this.fixed = [copy(at.placed)];
    this.end = this.fixed[0]!;
    return LIVE;
  }

  /** The button went down again while a shape waits for its next click. A press whose release never came gives way to it. */
  press(at: DrawPointer): DrawGestureResult {
    if (!this.placing) return NONE;
    this.pressedAt = at.screen;
    this.dragged = false;
    this.aim(at);
    return LIVE;
  }

  /** The pointer moved, the button down or not. */
  move(at: DrawPointer): DrawGestureResult {
    const mode = this.current;
    if (mode === null) return NONE;
    if (mode === 'pen') return this.pressedAt ? this.ink(at) : NONE;
    if (sweeps(mode)) {
      const from = this.end;
      if (!this.pressedAt || !from || same(from, at.raw)) return NONE;
      this.end = copy(at.raw);
      return { kind: 'sweep', from, to: this.end };
    }
    if (this.pressedAt && Math.hypot(at.screen.x - this.pressedAt.x, at.screen.y - this.pressedAt.y) > DRAW_DRAG_THRESHOLD) this.dragged = true;
    return this.aim(at) ? LIVE : NONE;
  }

  /** The button came up. */
  release(at: DrawPointer): DrawGestureResult {
    const mode = this.current;
    if (!this.pressedAt || mode === null) return NONE;
    this.pressedAt = null;
    if (sweeps(mode)) return this.over(null);
    if (mode === 'pen') {
      // The steadied line trails the pointer: the stroke ends where the pointer is.
      if (at.constrain) this.ink(at);
      else if (!same(this.fixed[this.fixed.length - 1]!, at.raw)) this.fixed.push(copy(at.raw));
      return this.over({ mode, points: this.fixed, closed: false });
    }
    this.aim(at);
    if (this.placing) return this.place(at.zoom);
    if (this.dragged) return this.finishShape();
    this.placing = true;
    return LIVE;
  }

  /** Space: the place under the pointer becomes a corner of the line; on its first corner, the line closes. */
  corner(): DrawGestureResult {
    const end = this.end;
    if (this.current !== 'line' || !end || same(end, this.fixed[this.fixed.length - 1]!)) return NONE;
    if (this.closes(end)) return this.finishLine(this.fixed, true);
    if (this.fixed.length >= MAX_LINE_CORNERS - 1) return NONE;
    this.fixed.push(end);
    return LIVE;
  }

  /** Backspace: the line's last corner is taken back. Its start stays. */
  back(): DrawGestureResult {
    if (this.current !== 'line' || this.fixed.length < 2) return NONE;
    this.fixed.pop();
    return LIVE;
  }

  /** Enter: a shape placed click by click ends where the pointer is. */
  finish(): DrawGestureResult {
    return this.placing ? this.finishShape() : NONE;
  }

  /** Escape: nothing is left. */
  cancel(): DrawGestureResult {
    if (!this.active) return NONE;
    this.reset();
    return CANCEL;
  }

  /** The tool's work ends by something else than its own keys: a shape under way is dropped, a sweep ends where it is. */
  stop(): DrawGestureResult {
    return sweeps(this.current) ? this.over(null) : this.cancel();
  }

  /** Whether a line that ends at `end` ends on its first corner, with an inside between: not one that only came back to where it began. */
  private closes(end: Point): boolean {
    const { fixed } = this;
    return fixed.length >= 3 && same(end, fixed[0]!) && !same(fixed[fixed.length - 1]!, fixed[0]!);
  }

  /** Puts a line's or a box's end where the pointer says. True when it moved. */
  private aim(at: DrawPointer): boolean {
    const first = this.fixed[0];
    const last = this.fixed[this.fixed.length - 1];
    if (!first || !last) return false;
    let end = at.placed;
    if (this.current === 'line') {
      if (at.constrain) end = stepped15(last, end);
      // Near its first corner the line is about to close: it ends on it.
      if (this.fixed.length >= 3 && near(end, first, at.zoom)) end = first;
    } else if (at.constrain) {
      end = squared(first, end);
    }
    const before = this.end;
    if (before && same(before, end)) return false;
    this.end = end === first ? first : copy(end);
    return true;
  }

  /** The pen's next point: steadied, or with Shift the end of a straight piece from where Shift went down. */
  private ink(at: DrawPointer): DrawGestureResult {
    const points = this.fixed;
    if (at.constrain) {
      this.straightFrom ??= points.length - 1;
      points.length = this.straightFrom + 1;
      const from = points[this.straightFrom]!;
      const to = stepped15(from, at.raw);
      if (!same(to, from)) points.push(to);
      return LIVE;
    }
    this.straightFrom = null;
    const last = points[points.length - 1]!;
    const next = steadied(last, at.raw, STEADY_SLACK / (at.zoom > 0 ? at.zoom : 1));
    if (same(next, last)) return NONE;
    points.push(next);
    return LIVE;
  }

  /** A click while placing: it ends a box; on a line's last corner it ends the line, on its first it closes it, elsewhere it is the next corner. */
  private place(zoom: number): DrawGestureResult {
    const end = this.end;
    const last = this.fixed[this.fixed.length - 1];
    if (!end || !last) return NONE;
    if (this.current !== 'line') return this.finishShape();
    if (this.closes(end)) return this.finishLine(this.fixed, true);
    if (near(end, last, zoom)) return this.finishLine(this.fixed, false);
    this.fixed.push(end);
    return this.fixed.length >= MAX_LINE_CORNERS ? this.finishLine(this.fixed, false) : LIVE;
  }

  /** Ends a line or a box where it ends now. */
  private finishShape(): DrawGestureResult {
    const mode = this.current;
    const end = this.end;
    const first = this.fixed[0];
    if (!end || !first || mode === null || mode === 'pen' || sweeps(mode)) return NONE;
    if (mode === 'line') return this.closes(end) ? this.finishLine(this.fixed, true) : this.finishLine([...this.fixed, end], false);
    return same(first, end) ? this.cancel() : this.over({ mode, points: [first, end], closed: false });
  }

  /** Ends the gesture with a line through `corners`: one of two corners at least, closed only around an inside. */
  private finishLine(corners: readonly Point[], closed: boolean): DrawGestureResult {
    const points = corners.filter((point, index) => index === 0 || !same(point, corners[index - 1]!));
    if (points.length < 2) return this.cancel();
    return this.over({ mode: 'line', points, closed: closed && points.length >= 3 });
  }

  private over(made: MadeShape | null): DrawGestureResult {
    this.reset();
    return { kind: 'finish', made };
  }

  private reset(): void {
    this.current = null;
    this.fixed = [];
    this.end = null;
    this.pressedAt = null;
    this.dragged = false;
    this.placing = false;
    this.straightFrom = null;
  }
}
