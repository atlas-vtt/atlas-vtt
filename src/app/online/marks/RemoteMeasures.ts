import { Container } from 'pixi.js';
import { areaMapOf, type AreaMap } from '../../measure/areaOnMap';
import { MAP_LAYER_Z } from '../../pixi/mapLayerOrder';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from '../../pixi/measure/DrawnMeasure';
import { MEASURE_MOTION, MeasurePresence } from '../../pixi/measure/measurePresence';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { MeasureInkLayer } from '../../pixi/utils/measureInk';
import { toldMeasures, type ToldMeasure } from './measureWords.ts';
import { PointerTrack } from './PointerTrack.ts';
import type { LayBodies, RemoteMeasure, RemoteMeasurePorts } from './remoteMeasurePorts.ts';
import { RemoteKept } from './RemoteKept.ts';
import { RemoteRanges } from './RemoteRanges.ts';
import { colourNumber, colourOf, endOf, fixedOf, sameLook, sameMeasurement, samePoint, samePoints, type Live, type Sender } from './toldMeasures.ts';

export type { LayBodies, MeasureRules, RemoteMeasure, RemoteMeasurePorts } from './remoteMeasurePorts.ts';

const NO_WALLS: AreaMap['walls'] = [];
const NO_TOKENS = {};

/**
 * Other people's measurements, each drawn as Atlas draws its own (`DrawnMeasure`) in its own
 * colour, else its sender's: a ruler with its corners, its length and each leg's; an area by its
 * body, which lies in a layer of its own under the map's tokens and lighting (`layBodies`) and so
 * is lit like the floor and hidden where a viewer does not see the map, and its size above
 * everything. An area stops at the walls the rules name unless its sender said that walls do not
 * stop it; where the rules name none it is drawn whole. Nothing of a measurement tells of tokens
 * here: no rings, no count, no height.
 *
 * A kept area told with a look has that in its body's place, played by the host's `effects`; an
 * aura lies around the token its sender names, where the host draws that token (`token`), and
 * follows it when the host says tokens moved (`tokensMoved`). Neither costs anything while no
 * measurement told has one.
 *
 * Nothing but the body shows where an area is cut by walls: its outline above the lighting is the
 * GM's (`gmOutlines`). A players' page asks for none.
 *
 * The end of a measurement being drawn moves through a `PointerTrack`, timed by the span its
 * messages tell, so it glides between two messages, and its label says the distance to the end as
 * drawn; a ruler's corners before its end stand as told.
 *
 * A sender's range marks (the GM's rings of Ranges and range check) are drawn beside its
 * measurements (`RemoteRanges`), whether or not it tells any measurement.
 *
 * Measurements come and go as Atlas's own do (`MeasurePresence`): a kept one grows in from where it
 * starts and fades out when its sender deletes it, one being drawn fades in and fades out when it
 * ends, and one kept from it takes its place as it stands. An edit of a kept measurement (moved,
 * resized) shows its way there (`MeasureMorph`). Clearing, or bodies laid into another map, take
 * everything away at once.
 */
export class RemoteMeasures {
  /** Above the lighting: the rulers, the GM's outlines where they are drawn, and every label above them. */
  readonly container = new Container({ label: 'remote-measures', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  /** Every sender's rulers, composed in one pass. */
  private readonly shapes = new MeasureInkLayer('remote-measure-shapes');
  private readonly outlines: MeasureInkLayer | null;
  private readonly labels = new Container({ label: 'remote-measure-labels', eventMode: 'none', interactiveChildren: false });
  /** The bodies of areas: a layer of the map it was last laid into, or of none (`laid`). */
  private bodies = newBodies();
  private laid = false;
  private readonly senders = new Map<string, Sender>();
  private moving = false;
  /** Whether an aura is among the kept measurements. */
  private auras = false;
  /** The kept measurements' drawings, and those fading away. */
  private readonly keptDrawings: RemoteKept;
  /** The senders' range marks. */
  private readonly ranges: RemoteRanges;

  constructor(private readonly ports: RemoteMeasurePorts) {
    this.outlines = ports.gmOutlines === true ? new MeasureInkLayer('remote-measure-outlines') : null;
    this.container.addChild(this.shapes.view, ...(this.outlines ? [this.outlines.view] : []), this.labels);
    this.ranges = new RemoteRanges(this.shapes, this.labels);
    this.keptDrawings = new RemoteKept({ surfaces: () => this.surfaces(), look: () => this.look(), ...(ports.token && { token: (id: string) => ports.token?.(id) ?? null }) });
  }

  /**
   * Lays the bodies of areas into a map: `lay` puts their layer where it lies under the map's
   * tokens and its lighting. Null takes it out of the map it lay in; areas then show their size
   * alone. What is drawn goes with the layer it was drawn in: the next `update` draws it again.
   */
  layBodies(lay: LayBodies | null): void {
    this.clear();
    destroyTree(this.bodies);
    this.bodies = newBodies();
    this.laid = lay !== null;
    lay?.(this.bodies);
  }

  /** Every sender's measurements as they are now (`now` in ms, the clock `tick` runs on); a sender missing from them has none. */
  update(measures: readonly RemoteMeasure[], now: number): void {
    this.mend();
    const present = new Set(measures.map((entry) => entry.who));
    for (const [who, sender] of this.senders) if (!present.has(who)) this.remove(who, sender, true);
    const look = this.look();
    this.ranges.update(measures, look);
    for (const entry of measures) {
      const known = this.senders.get(entry.who);
      const told = toldMeasures(entry);
      if ((told.live === null && told.kept.length === 0) || look === null) {
        if (known !== undefined) this.remove(entry.who, known, look !== null);
        continue;
      }
      const sender = known ?? this.add(entry.who);
      const colour = colourNumber(entry.color);
      const recoloured = colour !== sender.colour;
      sender.colour = colour;
      // The measurement being drawn ends, perhaps kept: the kept one takes its drawing's place.
      const ending = told.live === null ? sender.live?.told ?? null : null;
      const handed = this.keptDrawings.draw(sender, told.kept, recoloured, look, ending);
      this.follow(sender, told.live, entry.span, now, recoloured, look, handed);
    }
    const senders = [...this.senders.values()];
    this.moving = senders.some((sender) => sender.live?.track.busy(now) === true);
    this.auras = senders.some((sender) => sender.kept.some((kept) => kept.follower !== null));
  }

  /**
   * The tokens the host draws stand elsewhere, or are others: every aura follows its own, drawn
   * again only where its token stands on other cells. Nothing is asked while no aura is told.
   */
  tokensMoved(): void {
    if (!this.auras) return;
    this.mend();
    const look = this.look();
    if (look === null) return;
    for (const sender of this.senders.values()) {
      sender.kept.forEach((kept, index) => {
        if (kept.follower) this.keptDrawings.drawOne(sender, kept, index, look, false);
      });
    }
  }

  /** Whether an end being dragged still has somewhere to go. */
  get busy(): boolean {
    return this.moving;
  }

  /** Draws every end being dragged where it is at `now`. */
  tick(now: number): void {
    this.mend();
    // Asked for once, and only when an end moved.
    let look: MeasureLook | null | undefined;
    this.moving = false;
    for (const sender of this.senders.values()) {
      const live = sender.live;
      if (live === null) continue;
      const end = live.track.at(now);
      this.moving ||= live.track.busy(now);
      if (end === null || samePoint(end, live.end)) continue;
      if (look === undefined) look = this.look();
      if (look === null) continue;
      live.end = { x: end.x, y: end.y };
      this.drawLive(live, sender.colour, look);
    }
  }

  /** The zoom or the rules changed: everything is drawn again as it stands, lines and labels at their size on screen. */
  rescale(): void {
    this.mend();
    const look = this.look();
    if (look === null) return;
    for (const sender of this.senders.values()) {
      sender.kept.forEach((kept, index) => {
        // Another grid or other rules lay an aura anew.
        if (kept.follower) this.keptDrawings.drawOne(sender, kept, index, look, true);
        else kept.drawn.redraw(look);
      });
      sender.live?.drawn.redraw(look);
    }
    this.ranges.rescale(look);
  }

  clear(): void {
    for (const [who, sender] of this.senders) this.remove(who, sender);
    this.keptDrawings.clear();
    this.ranges.clear();
    this.moving = false;
    this.auras = false;
  }

  destroy(): void {
    this.clear();
    this.shapes.destroy();
    this.outlines?.destroy();
    destroyTree(this.container);
    destroyTree(this.bodies);
  }

  /**
   * The map the bodies lay in was destroyed, and their layer with it: what was drawn there is let
   * go of before anything draws into it, and areas have no body until they are laid into a map again.
   */
  private mend(): void {
    if (this.bodies.destroyed) this.layBodies(null);
  }

  /** What every measurement is drawn by now; null while the rules are not known. */
  private look(): MeasureLook | null {
    const rules = this.ports.rules();
    if (rules === null) return null;
    const { grid, measurement } = rules;
    return {
      zoom: this.ports.zoom(),
      grid,
      settings: measurement,
      // Every sender names a colour.
      accent: 0,
      map: rules.areas ?? areaMapOf(grid, measurement, true, NO_WALLS),
      tokens: () => NO_TOKENS,
      ringScale: 1,
    };
  }

  private surfaces(): MeasureSurfaces {
    // A body in no map is seen by nobody: its look is not played.
    const effects = this.laid ? this.ports.effects : undefined;
    return { bodies: this.bodies, shapes: this.shapes, labels: this.labels, ...(this.outlines && { outlines: this.outlines }), ...(effects && { effects }) };
  }

  private add(who: string): Sender {
    const sender: Sender = { who, kept: [], live: null, colour: 0 };
    this.senders.set(who, sender);
    return sender;
  }

  /** A sender's drawings go: faded out (`fade`), or at once. */
  private remove(who: string, sender: Sender, fade = false): void {
    this.senders.delete(who);
    for (const kept of sender.kept) this.keptDrawings.drop(kept.drawn, kept.presence, fade, kept.morph);
    if (sender.live) this.keptDrawings.drop(sender.live.drawn, sender.live.presence, fade);
  }

  /**
   * The measurement being drawn after a message: the same one with its end moved on or its corners
   * others, or a new one (another start or shape), which stands where it begins and does not glide
   * from the last.
   */
  private follow(sender: Sender, told: ToldMeasure | null, span: number | undefined, now: number, recoloured: boolean, look: MeasureLook, handed = false): void {
    const live = sender.live;
    if (told === null) {
      // Ended: it fades out, unless a kept measurement took its place.
      if (live) this.keptDrawings.drop(live.drawn, live.presence, !handed);
      sender.live = null;
      return;
    }
    const end = endOf(told);
    if (live === null || !sameMeasurement(live.told, told)) {
      const track = new PointerTrack({ interval: this.ports.interval });
      track.push([end], undefined, now);
      const drawn = live?.drawn ?? new DrawnMeasure(this.surfaces());
      sender.live = { told, track, end, drawn, presence: live?.presence ?? new MeasurePresence((presence) => drawn.present(presence)) };
      this.drawLive(sender.live, sender.colour, look);
      if (live === null) sender.live.presence.enter(MEASURE_MOTION.live.from, MEASURE_MOTION.live.ms);
      return;
    }
    // An end that stands is no new sample, unless its message says that time passed for its sender.
    if (!samePoint(endOf(live.told), end) || (span ?? 0) > 0) live.track.push([end], span, now);
    // Nothing to draw anew while only the end moved on: `tick` draws that.
    const stands = !recoloured && sameLook(live.told, told) && samePoints(fixedOf(live.told), fixedOf(told));
    live.told = told;
    if (!stands) this.drawLive(live, sender.colour, look);
  }

  /** Draws the measurement being drawn as told, with its end where that is drawn now, in its own colour or its sender's. */
  private drawLive({ told, end, drawn }: Live, colour: number, look: MeasureLook): void {
    drawn.draw({ shape: told.shape, points: [...fixedOf(told), end], ...(told.width !== undefined && { width: told.width }) }, colourOf(told, colour), look, told.walls !== false);
  }
}

function newBodies(): Container {
  return new Container({ label: 'remote-measure-bodies', zIndex: MAP_LAYER_Z.measureBodies, eventMode: 'none', interactiveChildren: false });
}
