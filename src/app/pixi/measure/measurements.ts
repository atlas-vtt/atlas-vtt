import type { SceneSource } from '../../host/sceneSource';
import type { KeptMeasure, Measurement } from '../../measure/measureTypes';
import type { RangeOrigin } from '../../measure/rangeOutline';
import type { RangeRing } from '../../measure/rangeRings';
import type { Point } from '../../types/visionTypes';

/** The measurement being made, or showing after its release. */
export interface LiveMeasure extends Measurement {
  /**
   * Where the pointer pressed to begin it, unsnapped: with its start, what it started on
   * (`measureOriginOf`). The same object for as long as it is the same measurement, so another one
   * that starts at the same point is told from it.
   */
  readonly pressed: Point;
  /** The GM measures for themselves: players are shown nothing of it. */
  readonly hidden?: true;
  /** '#rrggbb': the colour it is drawn in, where the tool names one; unset, the accent. */
  readonly color?: string;
}

/** The rings of Ranges as they stand: around a token (`tokenIds` names it, `at` is its place and size) or a point (no `tokenIds`). */
export interface ShownRangeRings {
  readonly tokenIds: readonly string[];
  readonly at: RangeOrigin;
  readonly rings: readonly RangeRing[];
}

/** The range check as it stands: between two tokens (`tokenIds`), each by its place and size, and what it reads. */
export interface ShownRangeCheck {
  readonly tokenIds: readonly [string, string];
  readonly from: RangeOrigin;
  readonly to: RangeOrigin;
  readonly text: string;
}

/** The measure tool's range marks as they stand (`RangeMarks`): no measurements, never kept, seen by the rule measurements are. */
export interface RangeMarksShown {
  readonly rings: ShownRangeRings | null;
  readonly check: ShownRangeCheck | null;
  /** Tokens stand anywhere on the map (its Snap is off): rings are round, never cells. */
  readonly loose: boolean;
  /** The GM measures for themselves (the Players switch is off): players are shown nothing of them. */
  readonly hidden: boolean;
}

/**
 * The measurements on the map as data, for whoever passes them on (online play): the live one, and
 * those kept on the level shown that players may see, in the order they were kept. One the GM keeps
 * to themselves (`KeptMeasure.hidden`) is never among them. An aura is, with the points it was last
 * edited at: where it lies is its token's to say (`isAura`, `placeAura`).
 */
export interface Measurements {
  readonly live: LiveMeasure | null;
  readonly kept: readonly KeptMeasure[];
  /**
   * Whether walls stand on the level shown: an area on it stops at them, unless it is a kept one
   * that says otherwise (`KeptMeasure.walls`), and is then another shape than its two points say.
   * Unset: none.
   */
  readonly walled?: boolean;
  /** The range check and the rings of Ranges while either shows; unset or null: neither. */
  readonly ranges?: RangeMarksShown | null;
}

export const NO_MEASUREMENTS: Measurements = Object.freeze({ live: null, kept: Object.freeze([]), walled: false });

/** The measurements on a map as whoever passes them on reads and follows them, and as their owner sets them. */
export class MeasurementsSource implements SceneSource<Measurements> {
  private current: Measurements = NO_MEASUREMENTS;
  private readonly listeners = new Set<(next: Measurements, previous: Measurements) => void>();

  readonly get = (): Measurements => this.current;

  readonly subscribe = (listener: (next: Measurements, previous: Measurements) => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Records what of the measurements is another, and tells whoever follows them. */
  set(changes: Partial<Measurements>): void {
    const previous = this.current;
    this.current = { ...previous, ...changes };
    for (const listener of [...this.listeners]) listener(this.current, previous);
  }

  /** Nobody follows them any more. */
  release(): void {
    this.listeners.clear();
  }
}
