import { Container } from 'pixi.js';
import { keptAudience } from '../../measure/auraArea';
import { isAura } from '../../measure/keptMeasures';
import type { KeptMeasure, Measurement } from '../../measure/measureTypes';
import type { MeasureAudience } from '../../vision/measureOrigin';
import type { Point } from '../../types/visionTypes';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import type { LiveMeasureParts, MeasureParts } from '../measurePartsVisibility';
import { destroyTree } from '../utils/destroyTree';
import { MeasureInkLayer } from '../utils/measureInk';
import { AuraPlaces } from './AuraPlaces';
import type { DrawnMeasure, MeasureLook, MeasureSurfaces } from './DrawnMeasure';
import type { AreaEffects } from './effects/AreaEffects';
import { colorOf, KeptDrawing } from './KeptDrawing';
import { LiveDrawing } from './LiveDrawing';
import { TokenOffsets } from './TokenOffsets';
import type { ShownPlaces } from '../../lighting/shownPlaces';

/** Told which kept measurements have a drawing, so that what shows them to players can follow. */
export interface KeptDrawings {
  /** A kept measurement is drawn in `parts`, newly or changed; `audience` says who sees it. */
  kept(parts: MeasureParts, audience: MeasureAudience): void;
  /** The drawing in `parts` is gone. */
  forgotten(parts: MeasureParts): void;
  /** The measurement in `parts`, live or kept, was drawn anew: its rings on tokens and what its label says of them show to whoever may see them. */
  marked(parts: MeasureParts): void;
  /** A kept measurement is drawn elsewhere than before on its way (`MeasureLayer.shownWay`): what stands with it (its handles) follows. */
  shownElsewhere?(): void;
}

/** Where a kept measurement is drawn while it moves: the points it is drawn at (null: its own) and how far it is shifted with its token. */
export interface ShownWay {
  readonly points: readonly Point[] | null;
  readonly shift: Point;
}

/** The label of the layer the tokens are drawn in (`TokenRenderer`). */
const TOKEN_LAYER = 'tokenContainer';
const NO_IDS: ReadonlySet<string> = new Set<string>();


const sameMeasurement = (a: Measurement, b: Measurement): boolean =>
  a.shape === b.shape && a.points.length === b.points.length && a.points.every((point, index) => point.x === b.points[index]?.x && point.y === b.points[index]?.y);

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

/** Where a measure layer's parts go, beyond the container it is given. */
export interface MeasureLayerOptions {
  /** Plays the looks of the kept areas' bodies; without it they keep their wash. */
  readonly effects?: AreaEffects;
  /** Puts the bodies' layer into the map, under its tokens and its lighting; unset, right under the token layer of the container (`placeUnderTokens`). */
  readonly layBodies?: (bodies: Container) => void;
  /**
   * False where the canvas itself is what players look at: no area then has an outline above the
   * lighting, which would draw the rooms an area is cut by. Unset, the outlines are drawn into
   * `gmMarks`, and whoever shows that layer shows them to the GM alone.
   */
  readonly gmOutlines?: false;
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
  private readonly live: LiveDrawing;
  private readonly kept = new Map<string, KeptDrawing>();
  /** Kept measurements that left the list and are on their way off the map: shown and hidden as they were until they are gone. */
  private readonly leaving = new Set<KeptDrawing>();
  /** How far gliding tokens are drawn from their places: what goes with a token is drawn with it (`followShown`). */
  private readonly offsets = new TokenOffsets();
  /** The live measurement is being kept by its pin (`keepPinned`). */
  private pinning = false;
  private list: readonly KeptMeasure[] = [];
  /** Where the auras among them lie; `auras` says whether there is one. */
  readonly places = new AuraPlaces();
  private auras = false;
  /** The kept areas that mark the tokens in them: the ones pointed at. */
  private pointed: ReadonlySet<string> = NO_IDS;

  constructor(parent: Container, private readonly look: () => MeasureLook, private readonly drawings: KeptDrawings, private readonly options: MeasureLayerOptions = {}) {
    if (options.layBodies) options.layBodies(this.bodies);
    else placeUnderTokens(parent, this.bodies);
    // Same zIndex, added in this order: the stable sort keeps the outlines above the rulers and every label above every shape.
    this.shapes.view.zIndex = MAP_LAYER_Z.measure;
    this.outlines.view.zIndex = MAP_LAYER_Z.measure;
    this.labels.zIndex = MAP_LAYER_Z.measure;
    parent.addChild(this.shapes.view, ...(options.gmOutlines === false ? [] : [this.outlines.view]), this.labels);
    // An area being made marks the tokens in it for as long as it shows.
    this.live = new LiveDrawing(this.surfaces);
    this.liveParts = this.live.parts;
  }

  /** The areas' outlines, which only the GM's view of the canvas shows; empty, and in no map, where the layer draws none. */
  get gmMarks(): Container {
    return this.outlines.view;
  }

  /** Draws the live measurement in `color` ('#rrggbb'; null is the accent). */
  drawLive(measurement: Measurement, color: string | null): void {
    this.live.draw(measurement, colorOf(color), this.look());
  }

  /** Puts the pin beside the live measurement's distance as that stands now, and pops it in: it is about to show. */
  placePin(): void {
    this.live.showPin(this.look().zoom);
  }

  /** The live measurement dissolves over `ms`; whoever clears it does so when that is done. */
  dissolveLive(ms: number): void {
    this.live.dissolve(ms);
  }

  clearLive(): void {
    this.live.clear();
  }

  /** Whether a press at the world point `point` is on the live label's pin, while that shows. */
  pinAt(point: Point): boolean {
    return this.live.pinAt(point);
  }

  /** The pointer is over the live label's pin, or left it: the pin lifts or settles. */
  hoverPin(hovered: boolean): void {
    this.live.hoverPin(hovered);
  }

  /** Keeps the live measurement by its pin (`keep`): the kept one takes its place and glows once, so it is seen to stay. */
  keepPinned(keep: () => boolean): boolean {
    this.pinning = true;
    try {
      return keep();
    } finally {
      this.pinning = false;
    }
  }

  /**
   * The kept measurements to show, in order: what left the list goes, what is new or another object
   * is drawn. With `animate` (the same level of the same scene, nothing loading) what comes grows in
   * and what goes fades out; otherwise both happen at once. `travelled`: an undo or redo wrote the
   * list, and a measurement it moved, resized or turned shows its way there.
   */
  setKept(list: readonly KeptMeasure[], animate = false, travelled = false): void {
    if (list === this.list) return;
    this.list = list;
    this.auras = list.some(isAura);
    const ids = new Set(list.map((measure) => measure.id));
    this.places.keep(ids);
    for (const [id, kept] of this.kept) {
      if (!ids.has(id)) this.forget(id, kept, animate);
    }
    this.sync(animate, travelled);
  }

  /**
   * Draws whatever goes with a token (an aura, a grouped measurement) where that token is drawn:
   * a token glides to the place the store gives it (`places`), and what goes with it, drawn at that
   * place, is shifted back to where the token is on its way, so the two move as one.
   */
  followShown(places: ShownPlaces, storedAt: (tokenId: string) => Point | undefined): void {
    this.offsets.follow(places, storedAt, () => this.shiftAll());
    this.shiftAll();
  }

  /** The tokens of the level shown stand elsewhere: the auras among the kept measurements follow theirs. True when one moved. */
  aurasMoved(animate = false): boolean {
    return this.auras && this.sync(animate);
  }

  /**
   * Draws the kept measurements that are new, another object or, an aura, placed elsewhere. An
   * aura whose token is not on the map shown has no drawing. True when an aura was placed anew.
   */
  private sync(animate = false, travelled = false): boolean {
    let look: MeasureLook | null = null;
    let moved = false;
    for (const measure of this.list) {
      const known = this.kept.get(measure.id);
      const follows = isAura(measure);
      const aura = follows ? this.places.place(measure, (look ??= this.look())) : null;
      if (known?.measure === measure && known.aura === aura) continue;
      if (follows && !aura) {
        // Without its token it has no drawing: nothing changes while it had none.
        if (known) this.forget(measure.id, known, animate);
        moved ||= known !== undefined;
        continue;
      }
      moved ||= follows;
      const kept = known ?? new KeptDrawing(this.surfaces, () => this.look(), (drawn) => {
        this.drawings.marked(drawn.parts);
        this.drawings.shownElsewhere?.();
      });
      look ??= this.look();
      kept.drawn.setMarked(this.pointed.has(measure.id), look);
      kept.draw(measure, aura, look, travelled);
      this.kept.set(measure.id, kept);
      this.drawings.kept(kept.drawn.parts, keptAudience(measure));
      if (!known) this.arrive(measure, kept, animate);
      this.shiftOne(kept);
    }
    return moved;
  }

  private shiftAll(): void {
    for (const kept of this.kept.values()) this.shiftOne(kept);
  }

  /** Draws a kept measurement as far from where it lies as its token is drawn from where the store has it. */
  private shiftOne(kept: KeptDrawing): void {
    if (kept.drawn.shift(this.offsets.of(kept.token))) this.drawings.shownElsewhere?.();
  }

  /** Where the kept measurement `id` is drawn while it moves (a morph, its token's glide); null while it is drawn where it lies, and for one that is gone. */
  shownWay(id: string): ShownWay | null {
    const kept = this.kept.get(id);
    if (!kept) return null;
    const points = kept.wayPoints;
    const shift = kept.drawn.shifted;
    return points === null && shift.x === 0 && shift.y === 0 ? null : { points, shift };
  }

  /**
   * A kept measurement drawn for the first time comes in. The live one just kept is already there:
   * it takes the live one's place as it stands, so keeping it never flickers, and one rescued while
   * it dissolved comes back from where it had got to. One kept by its pin glows.
   */
  private arrive(measure: KeptMeasure, kept: KeptDrawing, animate: boolean): void {
    const live = this.live.showing;
    if (live && sameMeasurement(live.measurement, measure)) {
      const from = live.presence;
      if (from.alpha < 1 || from.grow !== 1) kept.presence.enter(from);
      if (this.pinning) kept.drawn.glow();
      return;
    }
    if (animate) kept.presence.enter();
  }

  /** A kept measurement's drawing goes: at once, or (`animate`) once it has faded out, shown to whoever saw it until then. */
  private forget(id: string, kept: KeptDrawing, animate: boolean): void {
    this.kept.delete(id);
    if (!animate) {
      this.drop(kept);
      return;
    }
    this.leaving.add(kept);
    kept.leave(() => this.drop(kept));
  }

  private drop(kept: KeptDrawing): void {
    this.leaving.delete(kept);
    this.drawings.forgotten(kept.drawn.parts);
    kept.destroy();
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
    this.live.replacePin(look.zoom);
    return moved;
  }

  destroy(): void {
    for (const kept of [...this.kept.values(), ...this.leaving]) kept.destroy();
    this.offsets.stop();
    this.kept.clear();
    this.leaving.clear();
    this.live.destroy();
    this.shapes.destroy();
    this.outlines.destroy();
    destroyTree(this.bodies);
    destroyTree(this.labels);
  }

  private get surfaces(): MeasureSurfaces {
    const { effects, gmOutlines } = this.options;
    return { bodies: this.bodies, shapes: this.shapes, labels: this.labels, ...(gmOutlines !== false && { outlines: this.outlines }), ...(effects && { effects }) };
  }

  /** Every drawing with the parts it is shown and hidden by: the live one's are `liveParts`. */
  private all(): [DrawnMeasure, MeasureParts][] {
    return [[this.live.drawn, this.liveParts], ...[...this.kept.values()].map(({ drawn }): [DrawnMeasure, MeasureParts] => [drawn, drawn.parts])];
  }
}
