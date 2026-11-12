import type { SceneSource } from '../../host/sceneSource';
import type { KeptMeasure, Measurement } from '../../measure/measureTypes';
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
}

/**
 * The measurements on the map as data, for whoever passes them on (online play): the live one, and
 * those kept on the level shown that players may see, in the order they were kept. One the GM keeps
 * to themselves (`KeptMeasure.hidden`) is never among them.
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
