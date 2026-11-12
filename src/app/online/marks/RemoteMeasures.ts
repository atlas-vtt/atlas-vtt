import type { MeasureState } from '../protocol/index.ts';
import { Container } from 'pixi.js';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { DifficultCells } from '../../grid/movementCost';
import { areaMapOf, type AreaMap } from '../../measure/areaOnMap';
import type { Measurement } from '../../measure/measureTypes';
import { MAP_LAYER_Z } from '../../pixi/mapLayerOrder';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from '../../pixi/measure/DrawnMeasure';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { MeasureInkLayer } from '../../pixi/utils/measureInk';
import { toldMeasures, type ToldMeasure } from './measureWords.ts';
import { PointerTrack } from './PointerTrack.ts';

/** One sender's measurements as they arrive. */
export type RemoteMeasure = { readonly who: string } & MeasureState;

/** What a measurement is measured by: the scene's grid and how its distances read. */
export interface MeasureRules {
  readonly grid: GridGeometry;
  readonly measurement: MeasurementSettings;
  /** Where the scene's difficult terrain lies, which drags pay for by the measurement's rule; null or unset where it has none. */
  readonly difficult?: DifficultCells | null;
  /**
   * What of the map shapes an area measured on it (`areaMapOf`): whether its cells are counted, and
   * the walls areas stop at. Unset, cells are counted and no wall stops an area: it is drawn whole.
   */
  readonly areas?: AreaMap | null;
}

/** Puts a layer into a map, where it lies under the map's tokens and its lighting. */
export type LayBodies = (layer: Container) => void;

export interface RemoteMeasurePorts {
  /** The zoom the map shows at: lines and labels keep their size on screen. */
  zoom(): number;
  /** What the measurements are measured and shaped by; null while that is not known, and nothing is drawn. */
  rules(): MeasureRules | null;
  /** The senders' nominal send interval, in ms. */
  readonly interval: number;
  /**
   * Draws the outline of every area above the lighting too, with the dot where it starts: for a GM,
   * who must read an area in a dark room. Never where players look: the outline of an area cut by
   * walls draws the rooms it is cut by.
   */
  readonly gmOutlines?: boolean;
}

type Point = Measurement['points'][number];

/** A kept measurement and its drawing. */
interface Kept {
  told: ToldMeasure;
  readonly drawn: DrawnMeasure;
}

/** A measurement being drawn: as its sender last told it, and its end as it is drawn, a moment behind. */
interface Live {
  told: ToldMeasure;
  readonly track: PointerTrack;
  end: Point;
  readonly drawn: DrawnMeasure;
}

interface Sender {
  readonly kept: Kept[];
  live: Live | null;
  colour: number;
}

const NO_WALLS: AreaMap['walls'] = [];
const NO_TOKENS = {};

const colourNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const samePoints = (a: readonly Point[], b: readonly Point[]): boolean => a.length === b.length && a.every((point, index) => samePoint(point, b[index]!));
const sameLook = (a: ToldMeasure, b: ToldMeasure): boolean => a.shape === b.shape && a.width === b.width && a.walls === b.walls;
const sameTold = (a: ToldMeasure, b: ToldMeasure): boolean => sameLook(a, b) && samePoints(a.points, b.points);
const endOf = ({ points }: ToldMeasure): Point => points[points.length - 1] ?? { x: 0, y: 0 };
const fixedOf = ({ points }: ToldMeasure): readonly Point[] => points.slice(0, -1);
/** Whether `next` is `live` told again, its end moved on or its corners others: the same shape from the same start. */
const sameMeasurement = (live: ToldMeasure, next: ToldMeasure): boolean => live.shape === next.shape && live.points[0] !== undefined && next.points[0] !== undefined && samePoint(live.points[0], next.points[0]);

/**
 * Other people's measurements, each drawn as Atlas draws its own (`DrawnMeasure`) in the sender's
 * colour: a ruler with its corners, its length and each leg's; an area by its body, which lies in
 * a layer of its own under the map's tokens and lighting (`layBodies`) and so is lit like the floor
 * and hidden where a viewer does not see the map, and its size above everything. An area stops at
 * the walls the rules name unless its sender said that walls do not stop it; where the rules name
 * none it is drawn whole. Nothing of a measurement tells of tokens here: no rings, no count, no
 * height.
 *
 * Nothing but the body shows where an area is cut by walls: its outline above the lighting is the
 * GM's (`gmOutlines`). A players' page asks for none.
 *
 * The end of a measurement being drawn moves through a `PointerTrack`, timed by the span its
 * messages tell, so it glides between two messages, and its label says the distance to the end as
 * drawn; a ruler's corners before its end stand as told, and kept measurements stand as they arrive.
 */
export class RemoteMeasures {
  /** Above the lighting: the rulers, the GM's outlines where they are drawn, and every label above them. */
  readonly container = new Container({ label: 'remote-measures', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  /** Every sender's rulers, composed in one pass. */
  private readonly shapes = new MeasureInkLayer('remote-measure-shapes');
  private readonly outlines: MeasureInkLayer | null;
  private readonly labels = new Container({ label: 'remote-measure-labels', eventMode: 'none', interactiveChildren: false });
  /** The bodies of areas: a layer of the map it was last laid into, or of none. */
  private bodies = newBodies();
  private readonly senders = new Map<string, Sender>();
  private moving = false;

  constructor(private readonly ports: RemoteMeasurePorts) {
    this.outlines = ports.gmOutlines === true ? new MeasureInkLayer('remote-measure-outlines') : null;
    this.container.addChild(this.shapes.view, ...(this.outlines ? [this.outlines.view] : []), this.labels);
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
    lay?.(this.bodies);
  }

  /** Every sender's measurements as they are now (`now` in ms, the clock `tick` runs on); a sender missing from them has none. */
  update(measures: readonly RemoteMeasure[], now: number): void {
    this.mend();
    const present = new Set(measures.map((entry) => entry.who));
    for (const [who, sender] of this.senders) if (!present.has(who)) this.remove(who, sender);
    const look = this.look();
    for (const entry of measures) {
      const known = this.senders.get(entry.who);
      const told = toldMeasures(entry);
      if ((told.live === null && told.kept.length === 0) || look === null) {
        if (known !== undefined) this.remove(entry.who, known);
        continue;
      }
      const sender = known ?? this.add(entry.who);
      const colour = colourNumber(entry.color);
      const recoloured = colour !== sender.colour;
      sender.colour = colour;
      this.drawKept(sender, told.kept, recoloured, look);
      this.follow(sender, told.live, entry.span, now, recoloured, look);
    }
    this.moving = [...this.senders.values()].some((sender) => sender.live?.track.busy(now) === true);
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
    for (const { kept, live } of this.senders.values()) {
      for (const { drawn } of kept) drawn.redraw(look);
      live?.drawn.redraw(look);
    }
  }

  clear(): void {
    for (const [who, sender] of this.senders) this.remove(who, sender);
    this.moving = false;
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
    return { bodies: this.bodies, shapes: this.shapes, labels: this.labels, ...(this.outlines && { outlines: this.outlines }) };
  }

  private add(who: string): Sender {
    const sender: Sender = { kept: [], live: null, colour: 0 };
    this.senders.set(who, sender);
    return sender;
  }

  private remove(who: string, sender: Sender): void {
    this.senders.delete(who);
    for (const { drawn } of sender.kept) drawn.destroy();
    sender.live?.drawn.destroy();
  }

  /** The kept measurements of a sender, in order: one that is another, or in another colour, is drawn anew, and those there are no more of go. */
  private drawKept(sender: Sender, told: readonly ToldMeasure[], recoloured: boolean, look: MeasureLook): void {
    for (const kept of sender.kept.splice(told.length)) kept.drawn.destroy();
    told.forEach((measure, index) => {
      const known = sender.kept[index];
      if (known !== undefined && !recoloured && sameTold(known.told, measure)) return;
      const kept = known ?? { told: measure, drawn: new DrawnMeasure(this.surfaces()) };
      kept.told = measure;
      sender.kept[index] = kept;
      kept.drawn.draw(measure, sender.colour, look, measure.walls !== false);
    });
  }

  /**
   * The measurement being drawn after a message: the same one with its end moved on or its corners
   * others, or a new one (another start or shape), which stands where it begins and does not glide
   * from the last.
   */
  private follow(sender: Sender, told: ToldMeasure | null, span: number | undefined, now: number, recoloured: boolean, look: MeasureLook): void {
    const live = sender.live;
    if (told === null) {
      live?.drawn.destroy();
      sender.live = null;
      return;
    }
    const end = endOf(told);
    if (live === null || !sameMeasurement(live.told, told)) {
      const track = new PointerTrack({ interval: this.ports.interval });
      track.push([end], undefined, now);
      sender.live = { told, track, end, drawn: live?.drawn ?? new DrawnMeasure(this.surfaces()) };
      this.drawLive(sender.live, sender.colour, look);
      return;
    }
    // An end that stands is no new sample, unless its message says that time passed for its sender.
    if (!samePoint(endOf(live.told), end) || (span ?? 0) > 0) live.track.push([end], span, now);
    // Nothing to draw anew while only the end moved on: `tick` draws that.
    const stands = !recoloured && sameLook(live.told, told) && samePoints(fixedOf(live.told), fixedOf(told));
    live.told = told;
    if (!stands) this.drawLive(live, sender.colour, look);
  }

  /** Draws the measurement being drawn as told, with its end where that is drawn now. */
  private drawLive({ told, end, drawn }: Live, colour: number, look: MeasureLook): void {
    drawn.draw({ ...told, points: [...fixedOf(told), end] }, colour, look, told.walls !== false);
  }
}

function newBodies(): Container {
  return new Container({ label: 'remote-measure-bodies', zIndex: MAP_LAYER_Z.measureBodies, eventMode: 'none', interactiveChildren: false });
}
