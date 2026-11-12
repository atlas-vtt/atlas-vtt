import { Container } from 'pixi.js';
import type { KeptMeasure, Measurement } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import type { LiveMeasureParts, MeasureParts } from '../measurePartsVisibility';
import { cssColorToHexNumber } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { MeasureInkLayer } from '../utils/measureInk';
import { DrawnMeasure, type MeasureLook } from './DrawnMeasure';
import { MeasurePin } from './MeasurePin';

/** Told which kept measurements have a drawing, so that what shows them to players can follow. */
export interface KeptDrawings {
  /** `measure` is drawn in `parts`, newly or changed. */
  kept(parts: MeasureParts, measure: KeptMeasure): void;
  /** The drawing in `parts` is gone. */
  forgotten(parts: MeasureParts): void;
}

const colorOf = (color: string | null | undefined): number | null => (color ? cssColorToHexNumber(color) : null);

/**
 * The measurements as they are drawn on the map: the live one, with the pin beside its label while
 * it fades, and every kept one of the level shown. All shapes are composed in one pass and every
 * label lies above all of them. A kept measurement is drawn again only when its record is another
 * object, so a pointer move draws the live one alone.
 */
export class MeasureLayer {
  private readonly shapes = new MeasureInkLayer();
  private readonly labels = new Container({ label: 'measure-labels', eventMode: 'none', interactiveChildren: false });
  /** The live measurement's parts, for what shows and hides them. */
  readonly liveParts: LiveMeasureParts;
  private readonly live: DrawnMeasure;
  private readonly pin = new MeasurePin();
  private readonly kept = new Map<string, { readonly measure: KeptMeasure; readonly drawn: DrawnMeasure }>();
  private list: readonly KeptMeasure[] = [];

  constructor(parent: Container, private readonly look: () => MeasureLook, private readonly drawings: KeptDrawings) {
    // Same zIndex, labels added after: the stable sort keeps every label above every shape.
    this.shapes.view.zIndex = MAP_LAYER_Z.measure;
    this.labels.zIndex = MAP_LAYER_Z.measure;
    parent.addChild(this.shapes.view, this.labels);
    this.live = new DrawnMeasure(this.shapes, this.labels);
    this.live.labelLayer.addChild(this.pin.view);
    this.liveParts = { ...this.live.parts, pin: this.pin.view };
  }

  /** Draws the live measurement in `color` ('#rrggbb'; null is the accent). */
  drawLive(measurement: Measurement, color: string | null): void {
    this.live.draw(measurement, colorOf(color), this.look());
  }

  /** Puts the pin beside the live measurement's distance as that stands now: it is about to show. */
  placePin(): void {
    this.pin.place(this.live.distance, this.look().zoom);
  }

  clearLive(): void {
    this.live.clear();
  }

  /** Whether a press at the world point `point` is on the live label's pin, while that shows. */
  pinAt(point: Point): boolean {
    return this.live.labelLayer.visible && this.pin.contains(point);
  }

  /** The kept measurements to show, in order: what left the list goes, what is new or another object is drawn. */
  setKept(list: readonly KeptMeasure[]): void {
    if (list === this.list) return;
    this.list = list;
    const ids = new Set(list.map((measure) => measure.id));
    for (const [id, { drawn }] of this.kept) {
      if (ids.has(id)) continue;
      this.drawings.forgotten(drawn.parts);
      drawn.destroy();
      this.kept.delete(id);
    }
    let look: MeasureLook | null = null;
    for (const measure of list) {
      const known = this.kept.get(measure.id);
      if (known?.measure === measure) continue;
      const drawn = known?.drawn ?? new DrawnMeasure(this.shapes, this.labels);
      look ??= this.look();
      drawn.draw(measure, colorOf(measure.color), look);
      this.kept.set(measure.id, { measure, drawn });
      this.drawings.kept(drawn.parts, measure);
    }
  }

  /** Draws everything again as it is: the zoom, the theme, the grid or the rules changed. */
  redraw(): void {
    const look = this.look();
    this.live.redraw(look);
    if (this.pin.view.visible) this.pin.place(this.live.distance, look.zoom);
    for (const { drawn } of this.kept.values()) drawn.redraw(look);
  }

  destroy(): void {
    for (const { drawn } of this.kept.values()) drawn.destroy();
    this.kept.clear();
    this.pin.destroy();
    this.live.destroy();
    this.shapes.destroy();
    destroyTree(this.labels);
  }
}
