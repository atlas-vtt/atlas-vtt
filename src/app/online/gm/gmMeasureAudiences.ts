import { GM_MARKS, type MarksMessage, type MeasureState } from '../protocol/index.ts';
import type { Measurements } from '../../pixi/measure/measurements';
import type { TokenFootprint, TokenSeen } from '../../vision/measureOrigin';
import { GmMeasures, type KeptBy, type TokenAlias } from './gmMeasures.ts';

type MeasureEntry = MarksMessage['measures'][number];

/** Players told the GM's measurements alike: whom (every player where unset), and which tokens their picture shows. */
export interface MarkAudience {
  /** What tells this audience from the others from one look to the next: a picture's key. */
  readonly key: string;
  readonly players?: readonly string[];
  readonly seen: TokenSeen;
}

/** The GM's measurements as one audience is told them. */
export interface ToldMeasures {
  readonly players?: readonly string[];
  readonly entries: MeasureEntry[];
}

/** Whether a sender is drawing a measurement, which a span then times: by what it tells in full, where it tells any. */
const isDrawing = ({ live, full }: MeasureState): boolean => (full ? full.live : live) !== null;

/** Whether a sender has no measurement at all. */
export const hasNone = (state: MeasureState): boolean => !isDrawing(state) && (state.full ?? state).kept.length === 0 && state.ranges === undefined;

/** A sender's measurements as `marks` and the GM's overlay take them, with the time since the live one's end was last told. */
export const measureEntry = (who: string, state: MeasureState, span: number | null): MeasureEntry => {
  const { color, live, kept, full, ranges } = state;
  return { who, color, live, kept, ...(isDrawing(state) && span !== null && { span }), ...(full && { full }), ...(ranges && { ranges }) };
};

/**
 * The GM's measurements as each audience's picture shows them (`GmMeasures`, one per audience): where a
 * measurement or an aura stands on a token, it is told to the players whose own picture shows that token,
 * and what a measurement started on is taken by what those players saw when it started. An audience met
 * for the first time takes the measurements as they stand then.
 */
export class GmMeasureAudiences {
  private readonly measures = new Map<string, GmMeasures>();
  private records: Measurements = { live: null, kept: [] };
  private footprints: () => readonly TokenFootprint[] = () => [];

  /** Takes the measurements as they are at `now` (ms), for each audience, and forgets the audiences gone. */
  follow(records: Measurements, footprints: () => readonly TokenFootprint[], audiences: readonly MarkAudience[], now: number): void {
    this.records = records;
    this.footprints = footprints;
    const keys = new Set(audiences.map(({ key }) => key));
    for (const key of [...this.measures.keys()]) if (!keys.has(key)) this.measures.delete(key);
    for (const audience of audiences) {
      const measures = this.measures.get(audience.key) ?? new GmMeasures();
      this.measures.set(audience.key, measures);
      measures.follow(records, this.viewOf(audience), now);
    }
  }

  /** What each audience is told now, in `color`; `alias` names the tokens auras lie around, `keptBy` the measurements players kept. */
  told(audiences: readonly MarkAudience[], color: string, now: number, alias?: TokenAlias, keptBy?: KeptBy): ToldMeasures[] {
    return audiences.map((audience) => {
      const measures = this.of(audience, now);
      const state: MeasureState = { color, ...measures.shown(audience.seen, alias, keptBy) };
      const span = measures.takeSpan();
      return { ...(audience.players !== undefined && { players: audience.players }), entries: hasNone(state) ? [] : [measureEntry(GM_MARKS, state, span ?? null)] };
    });
  }

  /** Whether walls stand on the level the GM's canvas shows (`GmMeasures.walled`). */
  get walled(): boolean {
    return this.records.walled === true;
  }

  /** Forgets every measurement and audience: another scene, or another source. */
  reset(): void {
    this.measures.clear();
    this.records = { live: null, kept: [] };
  }

  /** The measurements of `audience`, taken as they stand now where it is new. */
  private of(audience: MarkAudience, now: number): GmMeasures {
    let measures = this.measures.get(audience.key);
    if (measures === undefined) {
      measures = new GmMeasures();
      measures.follow(this.records, this.viewOf(audience), now);
      this.measures.set(audience.key, measures);
    }
    return measures;
  }

  private viewOf(audience: MarkAudience): { footprints(): readonly TokenFootprint[]; seen(): TokenSeen } {
    return { footprints: () => this.footprints(), seen: () => audience.seen };
  }
}
