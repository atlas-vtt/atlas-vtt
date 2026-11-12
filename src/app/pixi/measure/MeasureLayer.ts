import { Container } from 'pixi.js';
import { keptAudience, type PlacedAura } from '../../measure/auraArea';
import { isAura } from '../../measure/keptMeasures';
import type { KeptMeasure, Measurement } from '../../measure/measureTypes';
import type { MeasureAudience } from '../../vision/measureOrigin';
import type { Point } from '../../types/visionTypes';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import type { LiveMeasureParts, MeasureParts } from '../measurePartsVisibility';
import { cssColorToHexNumber } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { MeasureInkLayer } from '../utils/measureInk';
import { AuraPlaces } from './AuraPlaces';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from './DrawnMeasure';
import type { AreaEffects } from './effects/AreaEffects';
import { MeasurePin } from './MeasurePin';

/** Told which kept measurements have a drawing, so that what shows them to players can follow. */
export interface KeptDrawings {
  /** A kept measurement is drawn in `parts`, newly or changed; `audience` says who sees it. */
  kept(parts: MeasureParts, audience: MeasureAudience): void;
  /** The drawing in `parts` is gone. */
  forgotten(parts: MeasureParts): void;
  /** The measurement in `parts`, live or kept, was drawn anew: its rings on tokens and what its label says of them show to whoever may see them. */
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
 * and every label above all of them. A kept area with an effect is drawn with it, in its wash's
 * place (`AreaBody`). A kept measurement is drawn again only when its record is
 * another object, so a pointer move draws the live one alone; an aura also when its token stands
 * elsewhere (`AuraPlaces`), so a token that moves draws its own auras and nothing else.
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
  private readonly kept = new Map<string, { readonly measure: KeptMeasure; readonly aura: PlacedAura | null; readonly drawn: DrawnMeasure }>();
  private list: readonly KeptMeasure[] = [];
  /** Where the auras among them lie; `auras` says whether there is one. */
  readonly places = new AuraPlaces();
  private auras = false;
  /** The kept areas that mark the tokens in them: the ones pointed at. */
  private pointed: ReadonlySet<string> = NO_IDS;

  /** `effects` plays the looks of the kept areas' bodies; without it they keep their wash. */
  constructor(parent: Container, private readonly look: () => MeasureLook, private readonly drawings: KeptDrawings, private readonly effects?: AreaEffects) {
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
    this.auras = list.some(isAura);
    const ids = new Set(list.map((measure) => measure.id));
    this.places.keep(ids);
    for (const [id, { drawn }] of this.kept) {
      if (!ids.has(id)) this.forget(id, drawn);
    }
    this.sync();
  }

  /** The tokens of the level shown stand elsewhere: the auras among the kept measurements follow theirs. True when one moved. */
  aurasMoved(): boolean {
    return this.auras && this.sync();
  }

  /**
   * Draws the kept measurements that are new, another object or, an aura, placed elsewhere. An
   * aura whose token is not on the map shown has no drawing. True when an aura was placed anew.
   */
  private sync(): boolean {
    let look: MeasureLook | null = null;
    let moved = false;
    for (const measure of this.list) {
      const known = this.kept.get(measure.id);
      const follows = isAura(measure);
      const aura = follows ? this.places.place(measure, (look ??= this.look())) : null;
      if (known?.measure === measure && known.aura === aura) continue;
      if (follows && !aura) {
        // Without its token it has no drawing: nothing changes while it had none.
        if (known) this.forget(measure.id, known.drawn);
        moved ||= known !== undefined;
        continue;
      }
      moved ||= follows;
      const drawn = known?.drawn ?? new DrawnMeasure(this.surfaces);
      look ??= this.look();
      drawn.setMarked(this.pointed.has(measure.id), look);
      drawn.draw(measure, colorOf(measure.color), look, measure.walls !== false, aura, measure.effect ? { effect: measure.effect, seed: measure.id } : null);
      this.kept.set(measure.id, { measure, aura, drawn });
      this.drawings.kept(drawn.parts, keptAudience(measure));
    }
    return moved;
  }

  private forget(id: string, drawn: DrawnMeasure): void {
    this.drawings.forgotten(drawn.parts);
    drawn.destroy();
    this.kept.delete(id);
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
      // Also an area the walls left without a token: its rings are gone, and its label counts none.
      if (drawn.redrawArea(look)) this.drawings.marked(parts);
    }
  }

  /** Draws everything again as it is: the zoom, the theme, the grid or the rules changed. True when that placed an aura anew. */
  redraw(): boolean {
    // Another grid or other rules place an aura anew.
    const moved = this.auras && this.sync();
    const look = this.look();
    for (const [drawn, parts] of this.all()) {
      drawn.redraw(look);
      // Rings drawn anew show to whoever may see them, and the players' label is written again: a ruler's too, which rings nothing.
      this.drawings.marked(parts);
    }
    if (this.pin.view.visible) this.pin.place(this.live.distance, look.zoom);
    return moved;
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
    return { bodies: this.bodies, shapes: this.shapes, outlines: this.outlines, labels: this.labels, ...(this.effects && { effects: this.effects }) };
  }

  /** Every drawing with the parts it is shown and hidden by: the live one's are `liveParts`. */
  private all(): [DrawnMeasure, MeasureParts][] {
    return [[this.live, this.liveParts], ...[...this.kept.values()].map(({ drawn }): [DrawnMeasure, MeasureParts] => [drawn, drawn.parts])];
  }
}
