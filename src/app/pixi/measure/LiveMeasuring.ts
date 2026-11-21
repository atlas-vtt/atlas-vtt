import type { GridSystem } from '../../grid/GridSystem';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { toolLook } from '../../measure/measureLights';
import { snapAreaEnd, snapAreaOrigin } from '../../measure/measureSnap';
import { placesFreely, type ToolSwitchState } from '../../types/toolSwitches';
import type { MeasureInput, Measurement, MeasureShapeKind, MeasureToolOptions } from '../../measure/measureTypes';
import type { GridState } from '../../types/gridTypes';
import type { SceneLighting } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import type { MeasurePartsVisibility } from '../measurePartsVisibility';
import { hexColorOf } from '../utils/colorUtils';
import type { MeasureLook } from './DrawnMeasure';
import type { MeasureInputHost } from './MeasureInput';
import type { MeasureLayer } from './MeasureLayer';
import { LIVE_DISSOLVE_MS } from './measurePresence';
import type { LiveMeasure } from './measurements';
import { measureToolInUse } from '../../measure/heldRuler';
import type { ViewState } from '../../types/viewState';

/** The grid a measurement snaps to and is measured on. */
export type MeasureGrid = Pick<GridSystem, 'getOptions' | 'snapToCellCenter'>;

/** How long a released measurement that is not kept stays, with the pin that keeps it; it dissolves over the last `LIVE_DISSOLVE_MS`. */
export const MEASURE_FADE_MS = 2000;

/** The shapes the tool measures with; its other modes measure nothing. */
const OFFERED: readonly MeasureShapeKind[] = ['ruler', 'circle', 'cone', 'square', 'line'];

/**
 * What the measurement being made reads of its view, and the one thing it writes: whether the grid
 * snaps and how large its cells are, the tool's choices, whether the scene is lit, and where a
 * measurement is kept. A view's store is one; so is any object that answers the same.
 */
export interface LiveMeasuringState extends ToolSwitchState {
  readonly grid: Pick<GridState, 'snapToGrid' | 'size'> | null;
  readonly measureTool: MeasureToolOptions;
  /** Set while the measure key is held for a press: it measures with a ruler and keeps nothing (`measureToolInUse`). */
  readonly heldRulerFrom?: ViewState['activeTool'] | undefined;
  readonly lighting: Pick<SceneLighting, 'enabled'>;
  /** Keeps a measurement and returns its id; null, and nothing kept, where no more can be (`MeasuresSlice.addMeasure`). */
  addMeasure(measure: MeasureInput): string | null;
}

export interface LiveMeasuringDeps {
  store: { getState(): LiveMeasuringState };
  grid: MeasureGrid;
  layer: Pick<MeasureLayer, 'drawLive' | 'clearLive' | 'dissolveLive' | 'placePin' | 'pinAt' | 'keepPinned'>;
  parts: Pick<MeasurePartsVisibility, 'start' | 'drawn' | 'pinned' | 'cleared' | 'setLiveHidden' | 'liveOrigin'>;
  /** A measurement is being made: the pointer is down for one, or between its clicks. */
  measuring: () => boolean;
  /** The live measurement is another, or gone (null): told before it is drawn. */
  changed: (live: LiveMeasure | null) => void;
  /** Tells the GM that no further measurement can be kept. */
  full: () => void;
  /** Whether a press (the browser's own event or touch) already did something that starts no measurement: it closed a kept measurement's popover. Unset, none has. */
  spent?: (press: object) => boolean;
  /** The map's rules and the theme's accent: a kept area takes the tool's effect, and the light that starts with, by them (`toolLook`); unset, neither. */
  look?: () => Pick<MeasureLook, 'settings' | 'accent'>;
}

/**
 * The measurement being made, from its first press to its end: what the measure tool's input asks
 * and tells (`MeasureInputHost`). The tool's choices are read from `measureTool` when they matter:
 * the mode at a press, Keep, the colour and the look at the release. A released measurement is kept as a
 * scene object (`addMeasure`, one undo step) or fades after `MEASURE_FADE_MS`, during which the pin
 * beside its label keeps it.
 */
export class LiveMeasuring implements MeasureInputHost {
  /** The live measurement as data; null while there is none. */
  private live: LiveMeasure | null = null;
  /** The same as it is drawn. */
  private shown: Measurement | null = null;
  /** Where the area being made starts: its end snaps to whole cells from there. */
  private start: Point | null = null;
  /** Where the pointer pressed to begin the live measurement. */
  private pressed: Point = { x: 0, y: 0 };
  private fadeTimer: number | null = null;

  constructor(private readonly deps: LiveMeasuringDeps) {}

  shape(): MeasureShapeKind | null {
    const { mode } = measureToolInUse(this.deps.store.getState());
    return OFFERED.find((shape) => shape === mode) ?? null;
  }

  /**
   * The pointer's place in world space. While the grid's snap setting and the tool's Snap switch
   * are on (Alt, `held`, turns the switch around), a ruler's point lies on the cell's centre; an area starts on a cell's centre, corner or
   * edge middle, and ends a whole number of cells from its start, whichever way the pointer lies.
   */
  point(world: Point, held: boolean): Point {
    const { store, grid } = this.deps;
    if (placesFreely(store.getState(), 'measureSnap', held) || !(store.getState().grid?.snapToGrid ?? true)) return { x: world.x, y: world.y };
    const shape = this.shape();
    if (shape === null || shape === 'ruler') return grid.snapToCellCenter(world.x, world.y);
    const start = this.deps.measuring() ? this.start : null;
    return start ? snapAreaEnd(grid.getOptions(), start, world) : snapAreaOrigin(grid.getOptions(), world);
  }

  /** A press on the pin keeps the measurement that fades, and one that closed a popover only did that: neither starts another. */
  takePress(world: Point, press: object | undefined): boolean {
    if (press && this.deps.spent?.(press)) return true;
    const { live } = this;
    if (this.fadeTimer === null || !live || !this.deps.layer.pinAt(world)) return false;
    if (this.deps.layer.keepPinned(() => this.keep(live))) this.clear();
    return true;
  }

  started(pressed: Point, start: Point): void {
    // One that still fades makes way: the new one comes in on its own.
    if (this.fadeTimer !== null) this.deps.layer.clearLive();
    this.stopFade();
    this.pressed = pressed;
    this.start = start;
    this.deps.parts.start([pressed, start], !this.deps.store.getState().measureTool.players);
  }

  changed(measurement: Measurement): void {
    this.show(this.sized(measurement));
  }

  /** Released: kept when Keep says so, or Shift says the other thing; else it fades. */
  finished(made: Measurement, shift: boolean): void {
    const measurement = this.sized(made);
    this.show(measurement);
    if (measureToolInUse(this.deps.store.getState()).keep !== shift && this.keep(measurement)) this.clear();
    else this.fade();
  }

  cancelled(): void {
    this.clear();
  }

  /** The GM switched whether players see what is measured: the measurement on the map follows. */
  setHidden(hidden: boolean): void {
    if (!this.shown) return;
    this.deps.parts.setLiveHidden(hidden);
    this.show(this.shown);
  }

  /** Takes the live measurement off the map, with its pin. */
  clear(): void {
    this.stopFade();
    this.shown = null;
    this.deps.layer.clearLive();
    this.deps.parts.cleared();
    if (!this.live) return;
    this.live = null;
    this.deps.changed(null);
  }

  /** Lets the live measurement dissolve over `LIVE_DISSOLVE_MS`, without its pin, and clears it then: the held ruler let go. */
  dissolve(): void {
    if (!this.shown) return this.clear();
    this.stopFade();
    this.deps.layer.dissolveLive(LIVE_DISSOLVE_MS);
    this.fadeTimer = window.setTimeout(() => {
      this.fadeTimer = null;
      this.clear();
    }, LIVE_DISSOLVE_MS);
  }

  destroy(): void {
    this.stopFade();
  }

  /** A line takes the width the tool holds, in cells of this map; every other shape has none. */
  private sized(measurement: Measurement): Measurement {
    if (measurement.shape !== 'line') return measurement;
    const { lineWidth } = this.deps.store.getState().measureTool;
    return { ...measurement, width: (lineWidth > 0 ? lineWidth : 1) * this.deps.grid.getOptions().size };
  }

  private show(measurement: Measurement): void {
    const { store, layer, parts } = this.deps;
    this.shown = measurement;
    const { players, color } = store.getState().measureTool;
    this.live = { ...measurement, pressed: this.pressed, ...(!players && { hidden: true as const }), ...(color !== null && { color }) };
    this.deps.changed(this.live);
    layer.drawLive(measurement, color);
    parts.drawn();
  }

  /** Keeps `measurement` as a scene object, in one undo step; false, with a word to the GM, where the level holds no more. */
  private keep(measurement: Measurement): boolean {
    const { store, parts, full } = this.deps;
    const { color, players } = store.getState().measureTool;
    const origin = parts.liveOrigin;
    const id = store.getState().addMeasure({
      shape: measurement.shape,
      points: measurement.points.map(({ x, y }) => ({ x, y })),
      ...(measurement.width !== undefined && { width: measurement.width }),
      ...(color !== null && { color }),
      ...(!players && { hidden: true }),
      ...(origin && origin.tokenIds.length > 0 && { origin: { tokenIds: [...origin.tokenIds], unseenAtStart: origin.unseenAtStart } }),
      ...this.look(measurement),
    });
    if (id === null) full();
    return id !== null;
  }

  /** What a kept area takes from the tool's look: its effect and, on a lit scene, the light that starts with. */
  private look(measurement: Measurement): Pick<MeasureInput, 'effect' | 'light'> {
    const look = this.deps.look?.();
    if (!look) return {};
    const state = this.deps.store.getState();
    return toolLook(measurement, state.measureTool, { scale: unitScaleOf(look.settings, state.grid), lit: state.lighting.enabled, accent: hexColorOf(look.accent) });
  }

  /** Leaves the released measurement on the map for a while, its pin beside its label, and lets it dissolve at the end; the pin keeps it until it is gone. */
  private fade(): void {
    this.stopFade();
    this.deps.layer.placePin();
    this.deps.parts.pinned(true);
    this.fadeTimer = window.setTimeout(() => {
      this.deps.layer.dissolveLive(LIVE_DISSOLVE_MS);
      this.fadeTimer = window.setTimeout(() => {
        this.fadeTimer = null;
        this.clear();
      }, LIVE_DISSOLVE_MS);
    }, MEASURE_FADE_MS - LIVE_DISSOLVE_MS);
  }

  private stopFade(): void {
    if (this.fadeTimer !== null) window.clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.deps.parts.pinned(false);
  }
}
