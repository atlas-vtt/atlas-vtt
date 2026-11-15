import type { SharedDrawing, SharedStroke } from '../protocol/index.ts';
import type { Container } from 'pixi.js';
import type { LiveDrawing } from '../../annotations/madeDrawing';
import { LiveStroke } from '../../pixi/annotations/LiveStroke';
import { liveDrawingOf } from './toldAnnotations.ts';

type Point = LiveDrawing['points'][number];

/** How long a drawing that was made is still shown as its stroke, waiting for the drawing itself to be told, in ms. */
export const STROKE_HOLD_MS = 1000;
/** Drawings told this short a time before a stroke was said to be made already hold it: the stroke goes at once. */
export const STROKE_JUST_TOLD_MS = 300;
/** The longest a stroke's end is drawn behind what arrived, in ms. */
const MAX_BEHIND_MS = 250;
/** The longest span a message is taken to cover, in ms. */
const MAX_SPAN_MS = 1000;

/** A pen's stroke as it is played out: every point told, and when each is due to be drawn. */
interface PenPlay {
  /** The fields of the stroke without its points. */
  look: Omit<LiveDrawing, 'points'>;
  /** Every point told so far, by its place in the stroke. */
  readonly points: Point[];
  /** When each point is due, on the clock `update` and `tick` run on. */
  readonly due: number[];
  /** How many points of the stroke lie before `points[0]`, or were lost on the way: a reader that came late holds no earlier ones. */
  base: number;
  /** The points drawn: those whose time has come, and the end on its way to the next. */
  readonly shown: Point[];
  /** How many of `points` have come due. */
  passed: number;
  /** When the last point told is due. */
  endsAt: number;
}

/** A drawing told whole each time, on its way from how it stood to how it was last told. */
interface WholePlay {
  from: readonly LiveDrawing[] | null;
  to: readonly LiveDrawing[];
  /** When `to` arrived, and how long the way to it takes. */
  at: number;
  span: number;
  /** Nothing is on its way: it is drawn as told. */
  settled: boolean;
}

interface Stroke {
  readonly n: number;
  pen: PenPlay | null;
  whole: WholePlay | null;
  /** One for a pen's stroke or a shape; one for each area of cells being filled. */
  readonly views: LiveStroke[];
}

/** A stroke its sender says was made: shown until the drawing itself is told, or until `until`. */
interface Held {
  readonly stroke: Stroke;
  readonly until: number;
}

export interface RemoteStrokesOptions {
  /** The layer the strokes are drawn in: where the drawings they become lie. */
  layer(): Container;
  /** Screen pixels to a world pixel now. */
  zoom(): number;
  /** The senders' nominal send interval, in ms. */
  readonly interval: number;
}

const lerp = (a: number, b: number, share: number): number => a + (b - a) * share;
const alike = (a: readonly Point[], b: readonly Point[]): boolean => a.length === b.length;

/** `to` on its way from `from`: every point a `share` of the way, where the two have the same points to move; else `to`. */
function between(from: readonly LiveDrawing[] | null, to: readonly LiveDrawing[], share: number): readonly LiveDrawing[] {
  if (from === null || share >= 1 || from.length !== to.length) return to;
  return to.map((drawing, index) => {
    const before = from[index]!;
    if (!alike(before.points, drawing.points) || before.type !== drawing.type) return drawing;
    return { ...drawing, points: drawing.points.map((point, at) => ({ x: lerp(before.points[at]!.x, point.x, share), y: lerp(before.points[at]!.y, point.y, share) })) };
  });
}

/**
 * Other people's drawings under way, drawn as their sender's own canvas draws one (`LiveStroke`):
 * one per sender. A message says how a drawing stands; it is not put there at once. A pen's
 * stroke grows point by point over the time its message says the points took, its end moving on
 * every frame, and a shape moves from how it stood to how it was told over one send interval, so
 * both move as their sender's hand did. A sender missing from an update dropped its drawing,
 * which goes at once; one that says the drawing was made keeps it shown until the drawing itself
 * is told (`drawingsTold`), so nothing blinks between the two.
 */
export class RemoteStrokes {
  private readonly strokes = new Map<string, Stroke>();
  private held: Held[] = [];
  private toldAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: RemoteStrokesOptions) {}

  /** Every drawing under way as it is now (`now` in ms, the clock `tick` runs on). */
  update(told: readonly SharedStroke[], now: number): void {
    const present = new Set(told.map((stroke) => stroke.who));
    for (const [who, stroke] of this.strokes) {
      if (!present.has(who)) this.remove(who, stroke);
    }
    for (const entry of told) {
      const known = this.strokes.get(entry.who);
      if (entry.kept === true) {
        if (known?.n === entry.n) this.hold(entry.who, known, now);
        else if (known) this.remove(entry.who, known);
        continue;
      }
      let stroke = known;
      if (stroke === undefined || stroke.n !== entry.n) {
        if (stroke) this.remove(entry.who, stroke);
        stroke = { n: entry.n, pen: null, whole: null, views: [] };
        this.strokes.set(entry.who, stroke);
      }
      if (entry.from !== undefined) this.growPen(stroke, entry.drawings[0], entry.from, entry.span, now);
      else this.moveWhole(stroke, entry.drawings, now);
    }
  }

  /** The scene's drawings were told anew at `now`: a stroke that waited for the drawing it became goes. */
  drawingsTold(now: number): void {
    this.toldAt = now;
    this.release(() => true);
  }

  /** Whether a stroke is shown or still on its way. */
  get busy(): boolean {
    if (this.held.length > 0) return true;
    for (const stroke of this.strokes.values()) {
      if ((stroke.pen !== null && stroke.pen.passed < stroke.pen.points.length) || stroke.whole?.settled === false) return true;
    }
    return false;
  }

  /** Draws every stroke as it is at `now`. */
  tick(now: number): void {
    this.release(({ until }) => now >= until);
    for (const stroke of this.strokes.values()) {
      if (stroke.pen) this.drawPen(stroke, stroke.pen, now);
      else if (stroke.whole && !stroke.whole.settled) this.drawWhole(stroke, stroke.whole, now);
    }
  }

  clear(): void {
    for (const [who, stroke] of this.strokes) this.remove(who, stroke);
    this.release(() => true);
  }

  destroy(): void {
    this.clear();
  }

  private growPen(stroke: Stroke, told: SharedDrawing | undefined, from: number, span: number | undefined, now: number): void {
    if (told === undefined) return;
    const { points, ...look } = liveDrawingOf(told);
    let play = stroke.pen;
    if (play === null) {
      play = stroke.pen = { look, points: [], due: [], base: from, shown: [], passed: 0, endsAt: now };
      stroke.whole = null;
    }
    play.look = look;
    // What a message tells again is left out; a stroke that lost a message goes straight on to what came.
    const has = play.base + play.points.length;
    if (from > has) play.base += from - has;
    const fresh = points.slice(Math.max(0, has - from));
    if (fresh.length === 0) return;
    const begin = Math.min(Math.max(now, play.endsAt), now + MAX_BEHIND_MS);
    const covers = Math.min(span ?? this.options.interval, MAX_SPAN_MS);
    // A stroke's first point shows as it arrives; every later one follows the one before it.
    const lead = play.points.length === 0 ? 0 : 1;
    fresh.forEach((point, index) => {
      play.points.push(point);
      play.due.push(begin + (covers * (index + lead)) / fresh.length);
    });
    play.endsAt = play.due[play.due.length - 1]!;
  }

  private moveWhole(stroke: Stroke, told: readonly SharedDrawing[], now: number): void {
    const to = told.map(liveDrawingOf);
    const before = stroke.whole;
    // From where it is drawn now, which may be on its way still.
    const from = before === null ? null : between(before.from, before.to, this.share(before, now));
    stroke.pen = null;
    stroke.whole = { from, to, at: now, span: this.options.interval, settled: false };
  }

  private share(play: WholePlay, now: number): number {
    return play.span > 0 ? Math.min(1, Math.max(0, (now - play.at) / play.span)) : 1;
  }

  private drawPen(stroke: Stroke, play: PenPlay, now: number): void {
    const { points, due, shown } = play;
    const before = play.passed;
    while (play.passed < points.length && due[play.passed]! <= now) play.passed += 1;
    const next = points[play.passed];
    const last = points[play.passed - 1];
    // Nothing is new and nothing is on its way: the stroke stands as it was drawn.
    if (play.passed === before && next === undefined && shown.length === play.passed) return;
    shown.length = Math.min(shown.length, before);
    for (let index = shown.length; index < play.passed; index++) shown.push(points[index]!);
    if (next !== undefined && last !== undefined) {
      const since = due[play.passed - 1]!;
      const length = due[play.passed]! - since;
      const share = length > 0 ? Math.min(1, Math.max(0, (now - since) / length)) : 1;
      shown.push({ x: lerp(last.x, next.x, share), y: lerp(last.y, next.y, share) });
    }
    if (shown.length > 0) this.view(stroke, 0).show(this.options.layer(), { ...play.look, points: shown }, this.options.zoom());
  }

  private drawWhole(stroke: Stroke, play: WholePlay, now: number): void {
    const share = this.share(play, now);
    const drawings = between(play.from, play.to, share);
    play.settled = share >= 1 || drawings === play.to;
    drawings.forEach((drawing, index) => this.view(stroke, index).show(this.options.layer(), drawing, this.options.zoom()));
    for (const spare of stroke.views.splice(drawings.length)) spare.destroy();
  }

  /** Shows all of a stroke that was made, until the drawing it became is told; one whose drawing was told a moment ago goes at once. */
  private hold(who: string, stroke: Stroke, now: number): void {
    if (now - this.toldAt < STROKE_JUST_TOLD_MS) {
      this.remove(who, stroke);
      return;
    }
    if (stroke.pen) {
      stroke.pen.due.fill(now);
      this.drawPen(stroke, stroke.pen, now);
    } else if (stroke.whole) {
      stroke.whole.span = 0;
      this.drawWhole(stroke, stroke.whole, now);
    }
    this.strokes.delete(who);
    this.held.push({ stroke, until: now + STROKE_HOLD_MS });
  }

  /** Takes the held strokes `gone` says are over off the map. */
  private release(gone: (held: Held) => boolean): void {
    if (this.held.length === 0) return;
    const kept: Held[] = [];
    for (const held of this.held) {
      if (gone(held)) this.discard(held.stroke);
      else kept.push(held);
    }
    this.held = kept;
  }

  private view(stroke: Stroke, index: number): LiveStroke {
    let view = stroke.views[index];
    if (!view) stroke.views[index] = view = new LiveStroke();
    return view;
  }

  private remove(who: string, stroke: Stroke): void {
    this.strokes.delete(who);
    this.discard(stroke);
  }

  private discard(stroke: Stroke): void {
    for (const view of stroke.views) view.destroy();
    stroke.views.length = 0;
  }
}
