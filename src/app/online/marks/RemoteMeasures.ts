import type { MarkPoint, MeasureState, SharedMeasure } from '../protocol/index.ts';
import { Container } from 'pixi.js';
import { pathLengthInCells, type GridGeometry } from '../../grid/gridDistance';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import type { DifficultCells } from '../../grid/movementCost';
import { MAP_LAYER_Z } from '../../pixi/mapLayerOrder';
import { drawMeasurement, measureLabelTarget, type MeasureRecord } from '../../pixi/utils/measureDrawing';
import { MeasureInk, MeasureInkLayer } from '../../pixi/utils/measureInk';
import { MeasureLabel } from '../../pixi/utils/measureLabel';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { PointerTrack } from './PointerTrack.ts';

/** One sender's measurements as they arrive. */
export type RemoteMeasure = { readonly who: string } & MeasureState;

/** What a measurement is measured by: the scene's grid and how its distances read. */
export interface MeasureRules {
  readonly grid: GridGeometry;
  readonly measurement: MeasurementSettings;
  /** Where the scene's difficult terrain lies, which drags pay for by the measurement's rule; null or unset where it has none. */
  readonly difficult?: DifficultCells | null;
}

/** A measurement being drawn: as its sender last told it, and its end as it is drawn, a moment behind. */
interface Live {
  told: SharedMeasure;
  readonly track: PointerTrack;
  end: { readonly x: number; readonly y: number };
}

interface Drawn {
  /** The kept measurements and the one being drawn, each in a drawing of its own: only the second changes with every frame. */
  readonly keptShapes: MeasureInk;
  readonly liveShape: MeasureInk;
  /** A label for every kept measurement in order, then one for the measurement being drawn. */
  readonly labels: MeasureLabel[];
  kept: readonly MeasureRecord[];
  live: Live | null;
  colour: number;
}

/** A measurement as Atlas's drawing takes it. */
export const recordOf = ({ shape, a, b }: SharedMeasure): MeasureRecord => ({ shape, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } });

const colourNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const sameMark = (a: MarkPoint, b: MarkPoint): boolean => a[0] === b[0] && a[1] === b[1];
const samePoint = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): boolean => a.x === b.x && a.y === b.y;
const sameRecords = (a: readonly MeasureRecord[], b: readonly MeasureRecord[]): boolean =>
  a.length === b.length && a.every((record, index) => record.shape === b[index]?.shape && samePoint(record.start, b[index].start) && samePoint(record.end, b[index].end));
const liveRecord = ({ told, end }: Live): MeasureRecord => ({ shape: told.shape, start: { x: told.a[0], y: told.a[1] }, end });

/**
 * Other people's measurements, drawn as Atlas draws its own (`drawMeasurement`) in the sender's
 * colour, each with its distance on a `MeasureLabel`, worked out here by the scene's rules. The end of a
 * measurement being drawn moves through a `PointerTrack`, timed by the span its messages tell, so it
 * glides between two messages, and its label says the distance to the end as drawn; kept
 * measurements stand as they arrive.
 */
export class RemoteMeasures {
  readonly container = new Container({ label: 'remote-measures', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  /** Every sender's shapes, composed in one pass; their labels follow in the container, above them all. */
  private readonly shapes = new MeasureInkLayer('remote-measure-shapes');
  private readonly drawn = new Map<string, Drawn>();
  private readonly zoom: () => number;
  private readonly rules: () => MeasureRules | null;
  /** The senders' nominal send interval, in ms. */
  private readonly interval: number;
  private moving = false;

  constructor(zoom: () => number, rules: () => MeasureRules | null, interval: number) {
    this.zoom = zoom;
    this.rules = rules;
    this.interval = interval;
    this.container.addChild(this.shapes.view);
  }

  /** Every sender's measurements as they are now (`now` in ms, the clock `tick` runs on); a sender missing from them has none. */
  update(measures: readonly RemoteMeasure[], now: number): void {
    const present = new Set(measures.map((entry) => entry.who));
    for (const [who, drawn] of this.drawn) if (!present.has(who)) this.remove(who, drawn);
    const rules = this.rules();
    for (const entry of measures) {
      const known = this.drawn.get(entry.who);
      if ((entry.live === null && entry.kept.length === 0) || rules === null) {
        if (known !== undefined) this.remove(entry.who, known);
        continue;
      }
      const drawn = known ?? this.add(entry.who);
      const colour = colourNumber(entry.color);
      const kept = entry.kept.map(recordOf);
      const keptChanged = colour !== drawn.colour || !sameRecords(kept, drawn.kept);
      const before = drawn.live;
      drawn.live = this.follow(before, entry, now);
      // Nothing to draw anew for a sender whose measurements stand, or whose end only moved on: `tick` draws that.
      if (!keptChanged && drawn.live === before) continue;
      if (keptChanged) this.drawKept(drawn, kept, colour, rules);
      this.fitLabels(drawn);
      kept.forEach((record, index) => this.label(drawn.labels[index], record, rules));
      this.drawLive(drawn, rules);
    }
    this.moving = [...this.drawn.values()].some((drawn) => drawn.live?.track.busy(now) === true);
  }

  /** Whether an end being dragged still has somewhere to go. */
  get busy(): boolean {
    return this.moving;
  }

  /** Draws every end being dragged where it is at `now`. */
  tick(now: number): void {
    const rules = this.rules();
    this.moving = false;
    for (const drawn of this.drawn.values()) {
      const live = drawn.live;
      if (live === null) continue;
      const end = live.track.at(now);
      this.moving ||= live.track.busy(now);
      if (rules === null || end === null || samePoint(end, live.end)) continue;
      live.end = { x: end.x, y: end.y };
      this.drawLive(drawn, rules);
    }
  }

  /** The zoom changed: shapes and labels keep their size on screen. */
  rescale(): void {
    const rules = this.rules();
    if (rules === null) return;
    for (const drawn of this.drawn.values()) {
      this.drawKept(drawn, drawn.kept, drawn.colour, rules);
      drawn.kept.forEach((record, index) => this.label(drawn.labels[index], record, rules));
      this.drawLive(drawn, rules);
    }
  }

  clear(): void {
    for (const [who, drawn] of this.drawn) this.remove(who, drawn);
  }

  destroy(): void {
    this.clear();
    this.shapes.destroy();
    destroyTree(this.container);
  }

  private add(who: string): Drawn {
    const drawn: Drawn = { keptShapes: new MeasureInk(this.shapes), liveShape: new MeasureInk(this.shapes), labels: [], kept: [], live: null, colour: 0 };
    this.drawn.set(who, drawn);
    return drawn;
  }

  private remove(who: string, drawn: Drawn): void {
    this.drawn.delete(who);
    drawn.keptShapes.destroy();
    drawn.liveShape.destroy();
    for (const label of drawn.labels) label.destroy();
  }

  /**
   * The measurement being drawn after a message: the same one with its end moved on, or a new one
   * (another start or shape), which stands where it begins and does not glide from the last.
   */
  private follow(live: Live | null, { live: told, span }: RemoteMeasure, now: number): Live | null {
    if (told === null) return null;
    const end = { x: told.b[0], y: told.b[1] };
    if (live === null || live.told.shape !== told.shape || !sameMark(live.told.a, told.a)) {
      const track = new PointerTrack({ interval: this.interval });
      track.push([end], undefined, now);
      return { told, track, end };
    }
    // An end that stands is no new sample, unless its message says that time passed for its sender.
    if (!sameMark(live.told.b, told.b) || (span ?? 0) > 0) live.track.push([end], span, now);
    live.told = told;
    return live;
  }

  private drawKept(drawn: Drawn, kept: readonly MeasureRecord[], colour: number, { measurement }: MeasureRules): void {
    drawn.kept = kept;
    drawn.colour = colour;
    drawn.keptShapes.begin(this.zoom());
    for (const record of kept) drawMeasurement(drawn.keptShapes, colour, record, measurement.coneAngle);
  }

  private drawLive(drawn: Drawn, rules: MeasureRules): void {
    drawn.liveShape.begin(this.zoom());
    if (drawn.live === null) return;
    const record = liveRecord(drawn.live);
    drawMeasurement(drawn.liveShape, drawn.colour, record, rules.measurement.coneAngle);
    this.label(drawn.labels[drawn.kept.length], record, rules);
  }

  /** As many labels as measurements. */
  private fitLabels(drawn: Drawn): void {
    const count = drawn.kept.length + (drawn.live === null ? 0 : 1);
    while (drawn.labels.length > count) {
      const label = drawn.labels.pop();
      label?.destroy();
    }
    while (drawn.labels.length < count) {
      const label = new MeasureLabel();
      this.container.addChild(label.view);
      drawn.labels.push(label);
    }
  }

  /** Shows `record`'s distance on `label`, beside it. */
  private label(label: MeasureLabel | undefined, record: MeasureRecord, { grid, measurement }: MeasureRules): void {
    if (label === undefined) return;
    const distance = formatDistance(pathLengthInCells(grid, [record.start, record.end], measurement.diagonalRule), measurement);
    label.show(distance, measureLabelTarget(record), this.zoom(), grid.size);
  }
}
