import { MAX_COORDINATE, MAX_MARK_KEPT, type MarkPoint, type SharedMeasure } from '../protocol/index.ts';
import type { Measurements } from '../../pixi/MeasureRenderer';
import type { MeasureRecord } from '../../pixi/utils/measureDrawing';
import { measureOriginOf, measureShownToPlayers, type MeasureOrigin, type TokenFootprint, type TokenSeen } from '../../vision/measureOrigin';
import { SpanMeter, type Press } from '../marks/index.ts';

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

const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => a.x === b.x && a.y === b.y;
const coordinate = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;

/** A record as players get it (a sphere is drawn as a circle), or null for one off every map. */
function shared({ shape, start, end }: MeasureRecord): SharedMeasure | null {
  if (![start.x, start.y, end.x, end.y].every(coordinate)) return null;
  const point = ({ x, y }: { x: number; y: number }): MarkPoint => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  return { shape: shape === 'sphere' ? 'circle' : shape, a: point(start), b: point(end) };
}

/**
 * The GM's measurements as the players' picture shows them, by Atlas's own rule: each one's origin
 * (the tokens under its start, and whether the players saw all of them) is taken when it starts, from
 * the press and its start; it shows while `measureShownToPlayers` says so. Records carry no origin, so
 * a live measurement is a new one when a new press began it or its start moved; a kept one takes the
 * origin of the live one it was kept from.
 */
export class GmMeasures {
  private live: { readonly start: MeasureRecord['start']; readonly press: number | null; readonly origin: MeasureOrigin } | null = null;
  /** The last live measurement and its origin, which a measurement kept from it takes. */
  private last: { readonly record: MeasureRecord; readonly origin: MeasureOrigin } | null = null;
  private readonly kept = new WeakMap<MeasureRecord, MeasureOrigin>();
  private records: Measurements = { live: null, kept: [] };
  /** The time between the ends of the live measurement that players are told. */
  private readonly meter = new SpanMeter();

  /** Takes the measurements as they are at `now` (ms); `press` is the last press on the map, which began the live one if it is new. */
  follow(records: Measurements, press: Press | null, view: PlayersView, now: number): void {
    this.records = records;
    const { live } = records;
    if (live === null) {
      // The next live measurement is a new one, wherever it starts.
      if (this.live !== null) this.live = { ...this.live, start: { x: Number.NaN, y: Number.NaN } };
      this.meter.reset();
    } else {
      const current = this.live;
      const fresh = current === null || (press !== null && press.serial !== current.press) || !samePoint(live.start, current.start);
      if (fresh) this.meter.reset();
      if (fresh || this.last === null || !samePoint(this.last.record.end, live.end)) this.meter.moved(now);
      const pressed = press !== null && press.serial !== current?.press ? [{ x: press.at[0], y: press.at[1] }] : [];
      const next = fresh ? { start: live.start, press: press?.serial ?? null, origin: measureOriginOf([...pressed, live.start], view.footprints(), view.seen()) } : current;
      this.live = next;
      this.last = { record: live, origin: next.origin };
    }
    for (const record of records.kept) {
      if (this.kept.has(record)) continue;
      const last = this.last;
      const from = last !== null && samePoint(last.record.start, record.start) && samePoint(last.record.end, record.end) ? last.origin : origin(record, view);
      this.kept.set(record, from);
    }
  }

  /** What the players see of the measurements now, by `seen`. */
  shown(seen: TokenSeen): ShownMeasures {
    const visible = (from: MeasureOrigin | undefined): boolean => from !== undefined && measureShownToPlayers(from, seen);
    const { live, kept } = this.records;
    const shownLive = live !== null && visible(this.live?.origin) ? shared(live) : null;
    const shownKept = kept.filter((record) => visible(this.kept.get(record))).map(shared).filter((record) => record !== null);
    return { live: shownLive, kept: shownKept.slice(-MAX_MARK_KEPT) };
  }

  /** The time from the live measurement's end as it was last taken to its end now, in whole ms; none for the first of a measurement. */
  takeSpan(): number | undefined {
    return this.meter.take();
  }

  /** Forgets every origin: another scene. */
  reset(): void {
    this.live = null;
    this.last = null;
    this.records = { live: null, kept: [] };
    this.meter.reset();
  }
}

/** The origin of a measurement seen for the first time, from its start alone. */
function origin(record: MeasureRecord, view: PlayersView): MeasureOrigin {
  return measureOriginOf([record.start], view.footprints(), view.seen());
}
