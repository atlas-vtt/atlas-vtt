import type { Measurement } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import type { LiveMeasureParts } from '../measurePartsVisibility';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from './DrawnMeasure';
import { MeasurePin } from './MeasurePin';
import { MEASURE_MOTION, MeasurePresence, type Presence } from './measurePresence';

/** The live measurement as it stands on the map, for a kept one to take its place. */
export interface LiveShowing {
  readonly measurement: Measurement;
  readonly presence: Presence;
}

/**
 * The measurement being made, as it is drawn: it marks the tokens in an area for as long as it
 * shows, its first drawing fades in, and once released it may dissolve (`dissolve`) with the pin
 * beside its label, which pops in, keeping it.
 */
export class LiveDrawing {
  /** What shows and hides it, the pin among them. */
  readonly parts: LiveMeasureParts;
  readonly drawn: DrawnMeasure;
  private readonly pin = new MeasurePin();
  private readonly presence: MeasurePresence;
  /** Whether it is drawn: its first drawing fades in. */
  private shown = false;

  constructor(surfaces: MeasureSurfaces) {
    this.drawn = new DrawnMeasure(surfaces, true);
    this.presence = new MeasurePresence((presence) => this.drawn.present(presence));
    this.drawn.labelLayer.addChild(this.pin.view);
    this.parts = { ...this.drawn.parts, pin: this.pin.view };
  }

  /** The measurement drawn and how far it is on the map; null while none is. */
  get showing(): LiveShowing | null {
    const measurement = this.shown ? this.drawn.measurement : null;
    return measurement && { measurement, presence: this.presence.presence };
  }

  draw(measurement: Measurement, color: number | null, look: MeasureLook): void {
    this.drawn.draw(measurement, color, look);
    if (this.shown) return;
    this.shown = true;
    this.presence.enter(MEASURE_MOTION.live.from, MEASURE_MOTION.live.ms);
  }

  /** Puts the pin beside its distance as that stands now at `zoom`, and pops it in. */
  showPin(zoom: number): void {
    this.pin.place(this.drawn.distance, zoom);
    this.pin.popIn();
  }

  /** Puts a pin that shows beside its distance again, drawn anew at `zoom`. */
  replacePin(zoom: number): void {
    if (this.pin.view.visible) this.pin.place(this.drawn.distance, zoom);
  }

  /** Dissolves over `ms`; whoever clears it does so when that is done. */
  dissolve(ms: number): void {
    this.presence.exit(() => undefined, ms);
  }

  clear(): void {
    this.presence.settle();
    this.shown = false;
    this.drawn.clear();
  }

  /** The pointer is over the pin, or left it. */
  hoverPin(hovered: boolean): void {
    this.pin.setHovered(hovered);
  }

  /** Whether a press at the world point `point` is on the pin, while that shows. */
  pinAt(point: Point): boolean {
    return this.drawn.labelLayer.visible && this.pin.contains(point);
  }

  destroy(): void {
    this.presence.stop();
    this.pin.destroy();
    this.drawn.destroy();
  }
}
