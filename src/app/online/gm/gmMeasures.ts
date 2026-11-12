import { MAX_COORDINATE, MAX_MARK_KEPT, type MarkPoint, type SharedMeasure } from '../protocol/index.ts';
import type { Measurement } from '../../measure/measureTypes';
import type { Measurements } from '../../pixi/measure/measurements';
import { measureOriginOf, measureShownToPlayers, playersSeeMeasure, type MeasureOrigin, type TokenFootprint, type TokenSeen } from '../../vision/measureOrigin';
import { SpanMeter } from '../marks/index.ts';

/** What the GM's measurements are judged by: where tokens stand and which ones the players see now. */
export interface PlayersView {
  footprints(): readonly TokenFootprint[];
  seen(): TokenSeen;
}

/** The GM's measurements players may see. */
export interface ShownMeasures {
  readonly live: SharedMeasure | null;
  readonly kept: readonly SharedMeasure[];
}

type Point = Measurement['points'][number];

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const onMap = ({ x, y }: Point): boolean => [x, y].every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE);
const mark = ({ x, y }: Point): MarkPoint => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];

/**
 * A measurement in the protocol's words, which knows a line, a circle and a cone between two points:
 * a ruler is told leg by leg, each leg a line. None for one off every map, and none for a square or
 * a line with a width, which the protocol cannot say yet.
 */
function legsOf({ shape, points }: Measurement): SharedMeasure[] {
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end || points.length < 2 || !points.every(onMap)) return [];
  switch (shape) {
    case 'ruler':
      return points.slice(1).map((point, index) => ({ shape: 'line', a: mark(points[index]!), b: mark(point) }));
    case 'circle':
    case 'cone':
      return [{ shape, a: mark(start), b: mark(end) }];
    case 'square':
    case 'line':
      return [];
  }
}

/** The same with a ruler's corners left out: one line from its start to its end. */
function straight(measurement: Measurement): SharedMeasure[] {
  const { shape, points } = measurement;
  return legsOf(shape === 'ruler' && points.length > 2 ? { shape, points: [points[0]!, points[points.length - 1]!] } : measurement);
}

/**
 * The GM's measurements as the players' picture shows them, by Atlas's own rule (`playersSeeMeasure`):
 * never one the GM measures for themselves, and one that started on tokens only while the players
 * see them. A live measurement's origin (the tokens under its press and its start, and whether the
 * players saw all of them) is taken here when it starts, by what these players see; a kept one
 * carries the origin it was kept with, and one kept from the live measurement is held to that one's
 * origin too.
 *
 * A ruler with corners goes out as its legs: those before the last among the kept measurements,
 * the last as the live one, or all of them kept. Where that is more than a message may hold, every
 * ruler goes out as one line from its start to its end.
 */
export class GmMeasures {
  private live: { readonly pressed: Point; readonly origin: MeasureOrigin } | null = null;
  /** Where the last live measurement started, and its origin, which a measurement kept from it is held to. */
  private last: { readonly start: Point; readonly end: Point; readonly origin: MeasureOrigin } | null = null;
  /** For every kept measurement met, by id: the origin of the live one it was kept from, or null. */
  private readonly keptFrom = new Map<string, MeasureOrigin | null>();
  private records: Measurements = { live: null, kept: [] };
  /** The time between the ends of the live measurement that players are told. */
  private readonly meter = new SpanMeter();

  /** Takes the measurements as they are at `now` (ms). */
  follow(records: Measurements, view: PlayersView, now: number): void {
    this.records = records;
    const { live } = records;
    const start = live?.points[0];
    const end = live?.points[live.points.length - 1];
    if (!live || !start || !end) {
      this.live = null;
      this.meter.reset();
    } else {
      const fresh = this.live === null || this.live.pressed !== live.pressed;
      if (fresh) this.meter.reset();
      if (fresh || this.last === null || !samePoint(this.last.end, end)) this.meter.moved(now);
      const current = fresh || this.live === null ? { pressed: live.pressed, origin: measureOriginOf([live.pressed, start], view.footprints(), view.seen()) } : this.live;
      this.live = current;
      this.last = { start, end, origin: current.origin };
    }
    for (const { id, points } of records.kept) {
      if (this.keptFrom.has(id)) continue;
      const first = points[0];
      const last = this.last;
      this.keptFrom.set(id, last !== null && first !== undefined && samePoint(last.start, first) ? last.origin : null);
    }
  }

  /** What the players see of the measurements now, by `seen`. */
  shown(seen: TokenSeen): ShownMeasures {
    const { live, kept } = this.records;
    const shownLive = live !== null && this.live !== null && playersSeeMeasure({ hidden: live.hidden, origin: this.live.origin }, seen) ? live : null;
    const shownKept = kept.filter((measure) => {
      const from = this.keptFrom.get(measure.id);
      return playersSeeMeasure(measure, seen) && (!from || measureShownToPlayers(from, seen));
    });
    const told = (legs: (measurement: Measurement) => SharedMeasure[]): ShownMeasures => {
      const liveLegs = shownLive ? legs(shownLive) : [];
      return { live: liveLegs[liveLegs.length - 1] ?? null, kept: [...shownKept.flatMap(legs), ...liveLegs.slice(0, -1)] };
    };
    const byLegs = told(legsOf);
    const { live: last, kept: rest } = byLegs.kept.length <= MAX_MARK_KEPT ? byLegs : told(straight);
    return { live: last, kept: rest.slice(-MAX_MARK_KEPT) };
  }

  /** The time from the live measurement's end as it was last taken to its end now, in whole ms; none for the first of a measurement. */
  takeSpan(): number | undefined {
    return this.meter.take();
  }

  /** Forgets every origin: another scene. */
  reset(): void {
    this.live = null;
    this.last = null;
    this.keptFrom.clear();
    this.records = { live: null, kept: [] };
    this.meter.reset();
  }
}
