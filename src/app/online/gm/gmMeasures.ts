import { MAX_MARK_KEPT, type FullMeasures, type MeasureState } from '../protocol/index.ts';
import { isAura } from '../../measure/keptMeasures';
import type { Measurement } from '../../measure/measureTypes';
import type { Measurements } from '../../pixi/measure/measurements';
import { measureOriginOf, measureShownToPlayers, playersSeeMeasure, type MeasureOrigin, type TokenFootprint, type TokenSeen } from '../../vision/measureOrigin';
import { legacyMeasures, measureInFull, SpanMeter } from '../marks/index.ts';

/** What the GM's measurements are judged by: where tokens stand and which ones the players see now. */
export interface PlayersView {
  footprints(): readonly TokenFootprint[];
  seen(): TokenSeen;
}

/** The GM's measurements players may see: in full, and in the words every reader knows. */
export interface ShownMeasures extends Pick<MeasureState, 'live' | 'kept'> {
  readonly full: FullMeasures;
}

type Point = Measurement['points'][number];

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/**
 * The GM's measurements as the players' picture shows them, by Atlas's own rule (`playersSeeMeasure`):
 * never one the GM measures for themselves, and one that started on tokens only while the players
 * see them. A live measurement's origin (the tokens under its press and its start, and whether the
 * players saw all of them) is taken here when it starts, by what these players see; a kept one
 * carries the origin it was kept with, and one kept from the live measurement is held to that one's
 * origin too.
 *
 * They go out in full (`measureInFull`): a ruler with its corners, every area by its origin and its
 * end, a line with its width, and whether walls stop an area: one being made always stops at them,
 * a kept one unless its switch is off. An aura is told to nobody: players get none. Beside that
 * they go out in the words an older page knows (`legacyMeasures`), which say less: a ruler leg by
 * leg, no square and no line, and a circle or a cone that stops at walls only while no wall stands
 * on its level.
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
      return !isAura(measure) && playersSeeMeasure(measure, seen) && (!from || measureShownToPlayers(from, seen));
    });
    const told: FullMeasures = { live: shownLive && measureInFull(shownLive), kept: shownKept.flatMap((measure) => measureInFull(measure) ?? []) };
    // The older words are made from every measurement shown, so a page that reads them is told what it always was.
    return { ...legacyMeasures(told, this.walled, MAX_MARK_KEPT), full: { live: told.live, kept: told.kept.slice(-MAX_MARK_KEPT) } };
  }

  /** Whether walls stand on the level the GM's canvas shows, where an area that stops at them is another shape than its two points say. */
  get walled(): boolean {
    return this.records.walled === true;
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
