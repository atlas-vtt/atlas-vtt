import { MAX_STROKE_COUNT, MAX_STROKE_DRAWINGS, MAX_STROKE_NUMBERS, type SharedDrawing, type StrokeState } from '../protocol/index.ts';
import type { DrawingUnderWay } from '../../annotations/underWay';
import type { FogCoverage } from '../../fog/fogCoverage';
import { SpanMeter } from '../marks/index.ts';
import { sharedLiveDrawing } from './mapLayerInputs.ts';

/** How long after a drawing was made players are still told that it was: their page shows the stroke until the drawing itself arrives. */
export const STROKE_KEPT_MS = 1000;
/** The most points of a pen's stroke one message tells. */
const MAX_PEN_POINTS = MAX_STROKE_NUMBERS / 2;

const numbersOf = (drawing: SharedDrawing): number => drawing.points.length + (drawing.holes ?? []).reduce((sum, ring) => sum + ring.length, 0);

/**
 * The GM's drawing under way as players are told it while it grows (`MarksMessage.strokes`), by
 * the rule a finished drawing is told by (`sharedLiveDrawing`): never one the GM keeps to
 * themselves, never one on the map, never one committed fog covers whole.
 *
 * A line, a rectangle, an ellipse and the cells being filled are told whole each time. A pen's
 * stroke only grows, so each message tells the points it has come to since the message before the
 * last: a message that never arrived leaves no gap. A drawing with more to it than a message may
 * carry is not told while it grows; players see it once it is made.
 */
export class GmStrokes {
  /** The drawing followed, by the number its view gave it; null while there is none. */
  private serial: number | null = null;
  /** The number players know the drawing followed by. */
  private n = 0;
  /** Whether players were told anything of the drawing followed. */
  private told = false;
  /** How many points of the pen's stroke the last message told of, and the one before it. */
  private last = 0;
  private beforeLast = 0;
  /** When the drawing followed was made; null while it is not. */
  private madeAt: number | null = null;
  /** When the drawing under way last changed. */
  private movedAt: number | null = null;
  private readonly meter = new SpanMeter();

  /** The drawing under way changed at `now` (ms): a pen's stroke has a new end. */
  moved(now: number): void {
    this.movedAt = now;
  }

  /** What the message sent at `now` tells of `drawing`; undefined for nothing. */
  take(drawing: DrawingUnderWay | null, fog: FogCoverage | null, now: number): StrokeState | undefined {
    if (drawing === null) {
      this.reset();
      return undefined;
    }
    if (drawing.serial !== this.serial) {
      this.reset();
      this.serial = drawing.serial;
      this.n = (this.n + 1) % (MAX_STROKE_COUNT + 1);
    }
    if (drawing.made) {
      this.madeAt ??= now;
      return this.told && now - this.madeAt < STROKE_KEPT_MS ? { n: this.n, drawings: [], kept: true } : undefined;
    }
    const state = drawing.pen ? this.pen(drawing, fog, now) : this.whole(drawing, fog);
    if (state === undefined) {
      // Players are shown nothing of it now: what comes of it later starts anew.
      this.forgetTold();
      return undefined;
    }
    this.told = true;
    return state;
  }

  /** Another scene: nothing is followed. */
  reset(): void {
    this.serial = null;
    this.madeAt = null;
    this.forgetTold();
  }

  private forgetTold(): void {
    this.told = false;
    this.last = this.beforeLast = 0;
    this.meter.reset();
  }

  private whole({ drawings }: DrawingUnderWay, fog: FogCoverage | null): StrokeState | undefined {
    if (drawings.length === 0 || drawings.length > MAX_STROKE_DRAWINGS) return undefined;
    const shared: SharedDrawing[] = [];
    for (const drawing of drawings) {
      const told = sharedLiveDrawing(drawing, fog);
      if (told === null) return undefined;
      shared.push(told);
    }
    return shared.reduce((sum, drawing) => sum + numbersOf(drawing), 0) > MAX_STROKE_NUMBERS ? undefined : { n: this.n, drawings: shared };
  }

  private pen({ drawings }: DrawingUnderWay, fog: FogCoverage | null, now: number): StrokeState | undefined {
    const stroke = drawings[0];
    if (stroke === undefined || stroke.points.length === 0) return undefined;
    const count = stroke.points.length;
    // The last point again where nothing is new: a drawing is told with a point at least.
    const from = Math.max(Math.min(this.beforeLast, count - 1), count - MAX_PEN_POINTS, 0);
    const told = sharedLiveDrawing({ ...stroke, points: stroke.points.slice(from) }, fog);
    if (told === null) return undefined;
    // The time from the stroke's end as the last message told it to its end now.
    if (count > this.last) this.meter.moved(this.movedAt ?? now);
    const span = count > this.last ? this.meter.take() : undefined;
    this.beforeLast = Math.min(this.last, count);
    this.last = count;
    return { n: this.n, drawings: [told], from, ...(span !== undefined && { span }) };
  }
}
