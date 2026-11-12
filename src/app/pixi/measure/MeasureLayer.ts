import { Container } from 'pixi.js';
import type { KeptMeasure, Measurement } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import type { LiveMeasureParts, MeasureParts } from '../measurePartsVisibility';
import { cssColorToHexNumber } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { MeasureInkLayer } from '../utils/measureInk';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from './DrawnMeasure';
import { MeasurePin } from './MeasurePin';

/** Told which kept measurements have a drawing, so that what shows them to players can follow. */
export interface KeptDrawings {
  /** `measure` is drawn in `parts`, newly or changed. */
  kept(parts: MeasureParts, measure: KeptMeasure): void;
  /** The drawing in `parts` is gone. */
  forgotten(parts: MeasureParts): void;
  /** The marks on the tokens of the measurement in `parts`, live or kept, were drawn anew. */
  marked(parts: MeasureParts): void;
}

/** The label of the layer the tokens are drawn in (`TokenRenderer`). */
const TOKEN_LAYER = 'tokenContainer';
const NO_IDS: ReadonlySet<string> = new Set<string>();

const colorOf = (color: string | null | undefined): number | null => (color ? cssColorToHexNumber(color) : null);

/**
 * Puts `layer` among `parent`'s children right under the tokens, and so above the map, the liquids
 * and the grid, which are put in beneath whatever is there. Layers of one zIndex lie in the order
 * of the children, so this is where the lighting lights the layer like the floor and tokens cover
 * it. Without a token layer (a view that draws none) it goes on top of what is there.
 */
export function placeUnderTokens(parent: Container, layer: Container): void {
  const tokens = parent.children.findIndex((child) => child.label === TOKEN_LAYER);
  if (tokens >= 0) parent.addChildAt(layer, tokens);
  else parent.addChild(layer);
}

/**
 * The measurements as they are drawn on the map: the live one, with the pin beside its label while
 * it fades, and every kept one of the level shown. The bodies of areas lie under the tokens and the
 * lighting (`MAP_LAYER_Z.measureBodies`); everything else stands above the lighting: the rulers and
 * the rings on tokens, composed in one pass, the areas' outlines for the GM in a second (`gmMarks`),
 * and every label above all of them. A kept measurement is drawn again only when its record is
 * another object, so a pointer move draws the live one alone.
 */
export class MeasureLayer {
  private readonly bodies = new Container({ label: 'measure-bodies', zIndex: MAP_LAYER_Z.measureBodies, eventMode: 'none', interactiveChildren: false });
  private readonly shapes = new MeasureInkLayer();
  private readonly outlines = new MeasureInkLayer('measure-outlines');
  private readonly labels = new Container({ label: 'measure-labels', eventMode: 'none', interactiveChildren: false });
  /** The live measurement's parts, for what shows and hides them. */
  readonly liveParts: LiveMeasureParts;
  private readonly live: DrawnMeasure;
  private readonly pin = new MeasurePin();
  private readonly kept = new Map<string, { readonly measure: KeptMeasure; readonly drawn: DrawnMeasure }>();
  private list: readonly KeptMeasure[] = [];
  /** The kept areas that mark the tokens in them: the ones pointed at. */
  private pointed: ReadonlySet<string> = NO_IDS;

  constructor(parent: Container, private readonly look: () => MeasureLook, private readonly drawings: KeptDrawings) {
    placeUnderTokens(parent, this.bodies);
    // Same zIndex, added in this order: the stable sort keeps the outlines above the rulers and every label above every shape.
    this.shapes.view.zIndex = MAP_LAYER_Z.measure;
    this.outlines.view.zIndex = MAP_LAYER_Z.measure;
    this.labels.zIndex = MAP_LAYER_Z.measure;
    parent.addChild(this.shapes.view, this.outlines.view, this.labels);
    // An area being made marks the tokens in it for as long as it shows.
    this.live = new DrawnMeasure(this.surfaces, true);
    this.live.labelLayer.addChild(this.pin.view);
    this.liveParts = { ...this.live.parts, pin: this.pin.view };
  }

  /** The areas' outlines, which only the GM's view of the canvas shows. */
  get gmMarks(): Container {
    return this.outlines.view;
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
      const drawn = known?.drawn ?? new DrawnMeasure(this.surfaces);
      look ??= this.look();
      drawn.setMarked(this.pointed.has(measure.id), look);
      drawn.draw(measure, colorOf(measure.color), look, measure.walls !== false);
      this.kept.set(measure.id, { measure, drawn });
      this.drawings.kept(drawn.parts, measure);
    }
  }

  /** The kept measurements pointed at (a handle under the pointer, an open popover): those that are areas mark the tokens in them. */
  setPointed(ids: ReadonlySet<string>): void {
    const before = this.pointed;
    this.pointed = ids;
    let look: MeasureLook | null = null;
    for (const [id, { drawn }] of this.kept) {
      if (before.has(id) === ids.has(id)) continue;
      look ??= this.look();
      if (drawn.setMarked(ids.has(id), look)) this.drawings.marked(drawn.parts);
    }
  }

  /** The ids of the tokens in the kept area `id` as it lies on the map now; none for a ruler, and for a measurement that is gone. */
  tokensIn(id: string): readonly string[] {
    return this.kept.get(id)?.drawn.tokens(this.look()) ?? [];
  }

  /** The tokens of the level shown are others, or stand elsewhere: the areas that mark theirs count them again. */
  tokensChanged(): void {
    let look: MeasureLook | null = null;
    for (const [drawn, parts] of this.all()) {
      look ??= this.look();
      if (drawn.tokensChanged(look)) this.drawings.marked(parts);
    }
  }

  /** The walls of the level shown are others: the areas are cut again. A ruler stops at none and is left alone. */
  wallsChanged(): void {
    const look = this.look();
    for (const [drawn, parts] of this.all()) {
      if (drawn.redrawArea(look) && parts.marks.rings.length > 0) this.drawings.marked(parts);
    }
  }

  /** Draws everything again as it is: the zoom, the theme, the grid or the rules changed. */
  redraw(): void {
    const look = this.look();
    for (const [drawn, parts] of this.all()) {
      drawn.redraw(look);
      // Rings drawn anew show to whoever may see them, and the players' label is written again.
      if (parts.marks.rings.length > 0) this.drawings.marked(parts);
    }
    if (this.pin.view.visible) this.pin.place(this.live.distance, look.zoom);
  }

  destroy(): void {
    for (const { drawn } of this.kept.values()) drawn.destroy();
    this.kept.clear();
    this.pin.destroy();
    this.live.destroy();
    this.shapes.destroy();
    this.outlines.destroy();
    destroyTree(this.bodies);
    destroyTree(this.labels);
  }

  private get surfaces(): MeasureSurfaces {
    return { bodies: this.bodies, shapes: this.shapes, outlines: this.outlines, labels: this.labels };
  }

  /** Every drawing with the parts it is shown and hidden by: the live one's are `liveParts`. */
  private all(): [DrawnMeasure, MeasureParts][] {
    return [[this.live, this.liveParts], ...[...this.kept.values()].map(({ drawn }): [DrawnMeasure, MeasureParts] => [drawn, drawn.parts])];
  }
}
