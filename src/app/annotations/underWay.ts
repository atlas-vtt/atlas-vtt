/**
 * The drawing a gesture of the Draw tool is making, for whoever shows it somewhere else than on
 * the canvas it is made on. Pure: the tool tells it, a reader asks and listens.
 */

import type { LiveDrawing } from './madeDrawing';

export interface DrawingUnderWay {
  /** Counts the gestures of its view: another number is another drawing. */
  readonly serial: number;
  /**
   * What is drawn now, as it will be made: one drawing, or the areas of the cells being filled.
   * A pen's points are the gesture's own list, which grows at its end. Empty once it is made.
   */
  readonly drawings: readonly LiveDrawing[];
  /** A pen's stroke: its one drawing only grows at its end. */
  readonly pen: boolean;
  /** The gesture is over and left its drawing on the map. */
  readonly made: boolean;
}

/** What a reader of the drawing under way takes of it. */
export interface UnderWaySource {
  /** The drawing under way, or the one just made; null while there is none, and once one was dropped. */
  get(): DrawingUnderWay | null;
  /** Calls `listener` whenever the answer of `get` is another, or a pen's stroke has grown; returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** Holds the drawing under way of one view. */
export class UnderWay implements UnderWaySource {
  private state: DrawingUnderWay | null = null;
  private serial = 0;
  private readonly listeners = new Set<() => void>();

  get(): DrawingUnderWay | null {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /** A gesture begins: what it shows is another drawing than the one before. */
  begin(): void {
    this.serial += 1;
  }

  /** The gesture shows `drawings` now. */
  show(drawings: readonly LiveDrawing[], pen: boolean): void {
    this.state = { serial: this.serial, drawings, pen, made: false };
    this.tell();
  }

  /** The gesture is over and its drawing is on the map. */
  made(): void {
    this.state = { serial: this.serial, drawings: [], pen: false, made: true };
    this.tell();
  }

  /** The gesture shows nothing now, or was dropped. */
  drop(): void {
    if (this.state === null) return;
    this.state = null;
    this.tell();
  }

  private tell(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
