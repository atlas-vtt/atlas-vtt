import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand/vanilla';
import type { GridSystem } from '../../grid/GridSystem';
import { resolveMeasurementSettings, type MeasurementSettings } from '../../grid/measurementFormat';
import type { SceneSource } from '../../host/sceneSource';
import { levelObjects } from '../../levels/levelObjects';
import { measureList } from '../../measure/keptMeasures';
import { snapAreaEnd, snapAreaOrigin } from '../../measure/measureSnap';
import type { KeptMeasure, Measurement, MeasureShapeKind } from '../../measure/measureTypes';
import type { HeightAt } from '../../measure/tokenHeight';
import type { MeasuresSlice } from '../../stores/measuresSlice';
import type { ViewState } from '../../types/viewState';
import type { Point } from '../../types/visionTypes';
import type { TokenSeen } from '../../vision/measureOrigin';
import type { MapBounds } from '../../vision/visibility';
import { MeasurePartsVisibility, type MeasurePlayersView } from '../measurePartsVisibility';
import type { LayerVisibility } from '../playerSafeFrame';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { watchMeasureLabelTheme } from '../utils/measureLabel';
import type { MeasureLook } from './DrawnMeasure';
import { MeasureHandleInteraction, type MeasureHandleStore } from './MeasureHandleInteraction';
import { MeasureInput, type MeasureInputHost } from './MeasureInput';
import { MeasureLayer } from './MeasureLayer';
import { MeasuredScene } from './MeasuredScene';
import { showMeasuresFullNotice } from './measureNotices';
import { NO_MEASUREMENTS, type LiveMeasure, type Measurements } from './measurements';
import { RangeMarks, type RangeSources } from './RangeMarks';

type MeasureState = Pick<ViewState, 'activeTool' | 'grid' | 'objects' | 'levels' | 'viewedLevel' | 'measureTool' | 'mapPath' | 'selectedIds' | 'tokenSettings'> & Pick<MeasuresSlice, 'addMeasure'>
  & ReturnType<MeasureHandleStore['getState']>;

/** What the measure tool reads of its view's state, and what it writes: a measurement to keep, and what the handles of the kept ones change. */
export type MeasureStore = Pick<StoreApi<MeasureState>, 'getState' | 'subscribe'>;

/** The grid a measurement snaps to and is measured on. */
export type MeasureGrid = Pick<GridSystem, 'getOptions' | 'snapToCellCenter'>;

/** How long a released measurement that is not kept stays, with the pin that keeps it. */
export const MEASURE_FADE_MS = 2000;

/** The shapes the tool measures with; its other modes measure nothing. */
const OFFERED: readonly MeasureShapeKind[] = ['ruler', 'circle', 'cone', 'square', 'line'];

const sameList = (a: readonly KeptMeasure[], b: readonly KeptMeasure[]): boolean => a.length === b.length && a.every((measure, index) => measure === b[index]);

/**
 * The measure tool on one map view: owns its input (`MeasureInput`), its drawing (`MeasureLayer`)
 * and what of it players are shown (`MeasurePartsVisibility`), and joins them to the store. The
 * tool's choices are read from `measureTool` when they matter: the mode at a press, Keep and the
 * colour at the release. A released measurement is kept as a scene object (`addMeasure`, one undo
 * step) or fades after `MEASURE_FADE_MS`, during which the pin beside its label keeps it. Kept
 * measurements are drawn from the store, so undo, redo and another level show at once, each with
 * the handles the GM moves, resizes, opens and deletes it by (`MeasureHandles`,
 * `MeasureHandleInteraction`). An area stops at the walls of the level shown, as light is traced
 * through them, and is cut again when they change; while it is made or pointed at, the tokens in
 * it are marked, and counted again when the tokens change.
 */
export class MeasureRenderer implements MeasureInputHost {
  /** Measurement settings of the current map, from its collection when it has one. */
  public measurementSettingsProvider: (() => MeasurementSettings) | null = null;
  /** How high the token at a point stands, for the rulers that start or end on one; `rulesChanged` writes them again. */
  public heightAt: HeightAt | null = null;
  /** The token under the pointer and the tokens' speeds, for the range check and the rings of Ranges; without them no token is hovered. */
  public rangeSources: RangeSources | null = null;

  private readonly layer: MeasureLayer;
  private readonly parts: MeasurePartsVisibility;
  private readonly input: MeasureInput;
  /** The handles of the kept measurements: the viewport's dispatch hands them the pointer (`pointer`), the map's keys Escape and Delete. */
  public readonly handles: MeasureHandleInteraction;
  /** The range check and the rings of the Ranges mode: marks that are no measurements, and the GM's own. */
  public readonly ranges: RangeMarks;
  private current: Measurements = NO_MEASUREMENTS;
  private readonly listeners = new Set<(next: Measurements, previous: Measurements) => void>();
  /** The record the kept measurements were last read from. */
  private keptRecord: unknown = null;
  /** The walls and the tokens of the level shown, which areas stop at, ring and count. */
  private readonly scene: MeasuredScene;
  /** The kept measurement whose handle the pointer is over, and the one whose popover is open. */
  private hovered: string | null = null;
  private opened: string | null = null;
  private shownHovered: string | null = null;
  /** Where the area being made starts: its end snaps to whole cells from there. */
  private liveStart: Point | null = null;
  private fadeTimer: number | null = null;
  /** The live measurement as it is drawn; null while there is none. */
  private shown: Measurement | null = null;
  /** Where the pointer pressed to begin the live measurement. */
  private pressed: Point = { x: 0, y: 0 };
  /** The zoom everything is drawn at: shapes and labels keep their size on screen. */
  private drawnZoom = 1;
  private readonly stops: (() => void)[] = [];
  private view: MeasurePlayersView | null = null;

  /** The measurements as data, read-only: the live one and the kept ones players may see. */
  public readonly measurements: SceneSource<Measurements> = {
    get: () => this.current,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => { this.listeners.delete(listener); };
    },
  };

  constructor(
    private readonly viewport: Viewport,
    private readonly store: MeasureStore,
    private readonly gridSystem: MeasureGrid,
    /** Tells the GM that no further measurement can be kept. */
    private readonly onFull: () => void = showMeasuresFullNotice,
  ) {
    this.scene = new MeasuredScene(store);
    this.layer = new MeasureLayer(viewport, () => this.look(), {
      kept: (parts, measure) => this.parts.keep(parts, measure),
      forgotten: (parts) => this.parts.forget(parts),
      marked: (parts) => this.parts.marked(parts),
    });
    this.input = new MeasureInput(viewport, this);
    this.ranges = new RangeMarks({ viewport, store, look: () => this.look(), measuring: () => this.input.measuring, sources: () => this.rangeSources });
    // Made after the layer: the handles stand above every measurement and label.
    this.handles = new MeasureHandleInteraction({
      viewport,
      store,
      snapGrid: () => ((this.store.getState().grid?.snapToGrid ?? true) ? this.gridSystem.getOptions() : null),
      yields: () => this.input.measuring || this.store.getState().activeTool === 'wall',
      pointedAt: (id) => {
        this.hovered = id;
        this.showPointed();
      },
    });
    this.parts = new MeasurePartsVisibility(this.layer.liveParts, () => this.view, [this.handles.layer, this.layer.gmMarks, this.ranges.view]);

    // Shapes and labels keep their size on screen, so a new zoom draws them again; a pan changes nothing.
    const onZoom = (): void => {
      if (this.viewport.scale.x !== this.drawnZoom) this.redraw();
    };
    for (const event of ['zoomed', 'zoomed-end', 'moved'] as const) {
      this.viewport.on(event, onZoom);
      this.stops.push(() => this.viewport.off(event, onZoom));
    }
    this.stops.push(watchMeasureLabelTheme(() => this.redraw()));
    this.stops.push(this.store.subscribe((state, previous) => this.follow(state, previous)));

    const state = this.store.getState();
    this.readKept(state);
    this.readScene(state);
    this.input.setEnabled(state.activeTool === 'measure');
  }

  /** The layers only the GM's view of the canvas shows: the handles of the kept measurements, the areas' unlit outlines, and the range marks. */
  public get gmLayers(): readonly Container[] {
    return [this.handles.layer, this.layer.gmMarks, this.ranges.view];
  }

  /** The map's size, by which the lighting seals its walls: areas stop at the same walls. */
  public set mapBounds(bounds: (() => MapBounds | null) | null) {
    this.scene.bounds = bounds;
  }

  /** How the players see the tokens a measurement starts on; without it, the players' picture shows every measurement they may see. */
  public get playersView(): MeasurePlayersView | null {
    return this.view;
  }

  /** Measurements drawn before it was known (kept ones of a scene already loaded) show by it at once. */
  public set playersView(view: MeasurePlayersView | null) {
    this.view = view;
    this.refreshVisibility();
  }

  shape(): MeasureShapeKind | null {
    const { mode } = this.store.getState().measureTool;
    return OFFERED.find((shape) => shape === mode) ?? null;
  }

  /**
   * The pointer's place in world space. While the grid's snap setting is on and Alt does not free
   * it, a ruler's point lies on the cell's centre; an area starts on a cell's centre, corner or
   * edge middle, and ends a whole number of cells from its start, whichever way the pointer lies.
   */
  point(world: Point, free: boolean): Point {
    if (free || !(this.store.getState().grid?.snapToGrid ?? true)) return { x: world.x, y: world.y };
    const shape = this.shape();
    if (shape === null || shape === 'ruler') return this.gridSystem.snapToCellCenter(world.x, world.y);
    const grid = this.gridSystem.getOptions();
    const start = this.input.measuring ? this.liveStart : null;
    return start ? snapAreaEnd(grid, start, world) : snapAreaOrigin(grid, world);
  }

  /** The ids of the tokens in the kept area `id` as it lies on the map now: the ones it rings while it is pointed at. */
  public tokensIn(id: string): readonly string[] {
    return this.layer.tokensIn(id);
  }

  /** A press on the pin keeps the measurement that fades, and starts no other. */
  takePress(world: Point): boolean {
    const live = this.current.live;
    if (this.fadeTimer === null || !live || !this.layer.pinAt(world)) return false;
    if (this.keep(live)) this.clearLive();
    return true;
  }

  started(pressed: Point, start: Point): void {
    this.stopFade();
    this.pressed = pressed;
    this.liveStart = start;
    this.parts.start([pressed, start], !this.store.getState().measureTool.players);
  }

  changed(measurement: Measurement): void {
    this.showLive(this.sized(measurement));
  }

  /** Released: kept when Keep says so, or Shift says the other thing; else it fades. */
  finished(made: Measurement, shift: boolean): void {
    const measurement = this.sized(made);
    this.showLive(measurement);
    if (this.store.getState().measureTool.keep !== shift && this.keep(measurement)) this.clearLive();
    else this.fade();
  }

  cancelled(): void {
    this.clearLive();
  }

  /** What the players' picture shows of the measurements: one that started on a token they do not see, or that the GM keeps to themselves, is left out. */
  public getPlayerViewLayers(seen: TokenSeen): LayerVisibility[] {
    return this.parts.playerViewLayers(seen);
  }

  /** The measurements as the GM view shows them, whatever the canvas shows: for a picture of the scene. */
  public getGmViewLayers(): LayerVisibility[] {
    return this.parts.gmViewLayers();
  }

  /** The players' sight changed, or whether the canvas shows it: measurements show or hide by it. */
  public refreshVisibility(): void {
    this.parts.refresh();
    this.handles.visibilityChanged();
  }

  /** The map has another size: on a very large map the lighting then seals its walls another way, and areas stop at those. */
  public mapSizeChanged(): void {
    this.layer.wallsChanged();
  }

  /** The map's measurement rules may have changed: every distance is written again. */
  public rulesChanged(): void {
    this.ranges.rulesChanged();
    this.redraw();
  }

  public destroy(): void {
    for (const stop of this.stops) stop();
    this.stops.length = 0;
    this.stopFade();
    this.input.destroy();
    this.handles.destroy();
    this.ranges.destroy();
    this.layer.destroy();
    this.listeners.clear();
  }

  private follow(state: MeasureState, previous: MeasureState): void {
    const measuring = state.activeTool === 'measure';
    const putAway = !measuring && previous.activeTool === 'measure';
    const sameScene = state.mapPath === previous.mapPath && state.viewedLevel === previous.viewedLevel;
    // Another mode, scene or level, or the tool put away: what was being measured belongs to none of them.
    // Asked of the change alone, so that the many store writes that are none of these draw nothing.
    if (putAway || !sameScene || state.measureTool.mode !== previous.measureTool.mode) {
      this.input.cancel();
      this.clearLive();
    }
    this.input.setEnabled(measuring);
    if (state.measureTool.players !== previous.measureTool.players) this.setLiveHidden(!state.measureTool.players);
    this.readKept(state);
    this.readScene(state);
    this.handles.follow(state);
    this.showPointed();
    if (state.grid !== previous.grid) this.redraw();
  }

  /** Draws the kept measurements of the level shown, and tells those players may see, when their record is another. */
  private readKept(state: MeasureState): void {
    const record = levelObjects(state).measures;
    if (record === this.keptRecord) return;
    this.keptRecord = record;
    const list = measureList(record);
    this.layer.setKept(list);
    this.handles.setKept(list);
    const kept = list.filter((measure) => measure.hidden !== true);
    if (!sameList(kept, this.current.kept)) this.setMeasurements({ ...this.current, kept });
  }

  /**
   * Follows the walls and the tokens of the level shown: areas are cut again by other walls, and
   * those that mark their tokens count them again. Asked of the records alone, so the store writes
   * that change neither draw nothing.
   */
  private readScene(state: MeasureState): void {
    const changed = this.scene.follow(state);
    if (changed.walls) this.layer.wallsChanged();
    if (changed.tokens) this.layer.tokensChanged();
    const walled = this.scene.walled(state);
    if (walled !== (this.current.walled ?? false)) this.setMeasurements({ ...this.current, walled });
  }

  /** The kept areas pointed at mark the tokens in them: the one under the pointer and the one whose popover is open. */
  private showPointed(): void {
    const opened = this.store.getState().measurePopover ?? null;
    if (opened === this.opened && this.hovered === this.shownHovered) return;
    this.opened = opened;
    this.shownHovered = this.hovered;
    this.layer.setPointed(new Set([this.hovered, opened].filter((id): id is string => id !== null)));
  }

  /** A line takes the width the tool holds, in cells of this map; every other shape has none. */
  private sized(measurement: Measurement): Measurement {
    if (measurement.shape !== 'line') return measurement;
    const { lineWidth } = this.store.getState().measureTool;
    return { ...measurement, width: (lineWidth > 0 ? lineWidth : 1) * this.gridSystem.getOptions().size };
  }

  private showLive(measurement: Measurement): void {
    this.shown = measurement;
    const hidden = !this.store.getState().measureTool.players;
    const live: LiveMeasure = { ...measurement, pressed: this.pressed, ...(hidden && { hidden }) };
    this.setMeasurements({ ...this.current, live });
    this.drawnZoom = this.viewport.scale.x;
    this.layer.drawLive(measurement, this.store.getState().measureTool.color);
    this.parts.drawn();
  }

  /** The GM switched whether players see what is measured: the measurement on the map follows. */
  private setLiveHidden(hidden: boolean): void {
    if (!this.shown) return;
    this.parts.setLiveHidden(hidden);
    this.showLive(this.shown);
  }

  /** Keeps `measurement` as a scene object, in one undo step; false, with a word to the GM, where the level holds no more. */
  private keep(measurement: Measurement): boolean {
    const { color, players } = this.store.getState().measureTool;
    const origin = this.parts.liveOrigin;
    const id = this.store.getState().addMeasure({
      shape: measurement.shape,
      points: measurement.points.map(({ x, y }) => ({ x, y })),
      ...(measurement.width !== undefined && { width: measurement.width }),
      ...(color !== null && { color }),
      ...(!players && { hidden: true }),
      ...(origin && origin.tokenIds.length > 0 && { origin: { tokenIds: [...origin.tokenIds], unseenAtStart: origin.unseenAtStart } }),
    });
    if (id === null) this.onFull();
    return id !== null;
  }

  /** Leaves the released measurement on the map for a while, its pin beside its label. */
  private fade(): void {
    this.stopFade();
    this.layer.placePin();
    this.parts.pinned(true);
    this.fadeTimer = window.setTimeout(() => {
      this.fadeTimer = null;
      this.clearLive();
    }, MEASURE_FADE_MS);
  }

  private stopFade(): void {
    if (this.fadeTimer !== null) window.clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.parts.pinned(false);
  }

  private clearLive(): void {
    this.stopFade();
    this.shown = null;
    this.layer.clearLive();
    this.parts.cleared();
    if (this.current.live) this.setMeasurements({ ...this.current, live: null });
  }

  /** Records the measurements on the map and tells whoever follows them. */
  private setMeasurements(next: Measurements): void {
    const previous = this.current;
    this.current = next;
    for (const listener of [...this.listeners]) listener(next, previous);
  }

  /** Draws every measurement again at the current zoom, in the current theme and by the current rules. */
  private redraw(): void {
    this.drawnZoom = this.viewport.scale.x;
    this.layer.redraw();
    this.ranges.redraw();
    this.handles.redraw();
  }

  private look(): MeasureLook {
    const state = this.store.getState();
    const settings = this.measurementSettingsProvider?.() ?? resolveMeasurementSettings(undefined, state.grid);
    const grid = this.gridSystem.getOptions();
    return {
      zoom: this.viewport.scale.x,
      grid,
      settings,
      accent: cssColorToHexNumber(getObsidianAccentColor()),
      heightAt: this.heightAt,
      map: this.scene.areaMap(state, grid, settings),
      tokens: () => this.scene.tokens(),
      ringScale: state.tokenSettings?.tokenRingSize ?? 1,
    };
  }
}
