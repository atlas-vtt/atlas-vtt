import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand/vanilla';
import { resolveMeasurementSettings, type MeasurementSettings } from '../../grid/measurementFormat';
import type { SceneSource } from '../../host/sceneSource';
import { levelObjects } from '../../levels/levelObjects';
import { isAura, measureList } from '../../measure/keptMeasures';
import type { KeptMeasure } from '../../measure/measureTypes';
import type { HeightAt } from '../../measure/tokenHeight';
import type { MeasuresSlice } from '../../stores/measuresSlice';
import type { ViewState } from '../../types/viewState';
import type { TokenSeen } from '../../vision/measureOrigin';
import type { MapBounds } from '../../vision/visibility';
import { MeasurePartsVisibility, type MeasurePlayersView } from '../measurePartsVisibility';
import type { LayerVisibility } from '../playerSafeFrame';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { watchMeasureLabelTheme } from '../utils/measureLabel';
import type { MeasureLook } from './DrawnMeasure';
import { LiveMeasuring, type MeasureGrid } from './LiveMeasuring';
import { MeasureHandleInteraction, type MeasureHandleStore } from './MeasureHandleInteraction';
import { MeasureInput } from './MeasureInput';
import { MeasureLayer } from './MeasureLayer';
import { MeasuredScene } from './MeasuredScene';
import { showMeasuresFullNotice } from './measureNotices';
import { NO_MEASUREMENTS, type LiveMeasure, type Measurements } from './measurements';
import { RangeMarks, type RangeSources } from './RangeMarks';

export { MEASURE_FADE_MS, type MeasureGrid } from './LiveMeasuring';

type MeasureState = Pick<ViewState, 'activeTool' | 'grid' | 'objects' | 'levels' | 'viewedLevel' | 'measureTool' | 'mapPath' | 'selectedIds' | 'tokenSettings'> & Pick<MeasuresSlice, 'addMeasure'>
  & ReturnType<MeasureHandleStore['getState']>;

/** What the measure tool reads of its view's state, and what it writes: a measurement to keep, and what the handles of the kept ones change. */
export type MeasureStore = Pick<StoreApi<MeasureState>, 'getState' | 'subscribe'>;

const sameList = (a: readonly KeptMeasure[], b: readonly KeptMeasure[]): boolean => a.length === b.length && a.every((measure, index) => measure === b[index]);

/**
 * The measure tool on one map view: owns its input (`MeasureInput`), the measurement being made
 * (`LiveMeasuring`), its drawing (`MeasureLayer`) and what of it players are shown
 * (`MeasurePartsVisibility`), and joins them to the store. Kept measurements are drawn from the
 * store, so undo, redo and another level show at once, each with the handles the GM moves, resizes,
 * opens and deletes it by (`MeasureHandles`, `MeasureHandleInteraction`). An area stops at the walls
 * of the level shown, as light is traced through them, and is cut again when they change; while it
 * is made or pointed at, the tokens in it are marked, and counted again when the tokens change. An
 * aura lies around its token as the store has it, so it follows a dragged token with every move of
 * the pointer, and only it is drawn again.
 */
export class MeasureRenderer {
  /** Measurement settings of the current map, from its collection when it has one. */
  public measurementSettingsProvider: (() => MeasurementSettings) | null = null;
  /** How high the token at a point stands, for the rulers that start or end on one; `rulesChanged` writes them again. */
  public heightAt: HeightAt | null = null;
  /** The token under the pointer and the tokens' speeds, for the range check and the rings of Ranges; without them no token is hovered. */
  public rangeSources: RangeSources | null = null;

  private readonly layer: MeasureLayer;
  private readonly parts: MeasurePartsVisibility;
  private readonly input: MeasureInput;
  private readonly live: LiveMeasuring;
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
      kept: (parts, audience) => this.parts.keep(parts, audience),
      forgotten: (parts) => this.parts.forget(parts),
      marked: (parts) => this.parts.marked(parts),
    });
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
      place: (measure) => this.layer.places.handlesOf(measure),
      aura: (measure) => this.layer.places.dragSetting(measure, this.look()),
    });
    this.parts = new MeasurePartsVisibility(this.layer.liveParts, () => this.view, [this.handles.layer, this.layer.gmMarks, this.ranges.view]);
    this.live = new LiveMeasuring({
      store,
      grid: gridSystem,
      layer: this.layer,
      parts: this.parts,
      measuring: () => this.input.measuring,
      changed: (live) => this.liveChanged(live),
      full: this.onFull,
    });
    this.input = new MeasureInput(viewport, this.live);

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

  /** The ids of the tokens in the kept area `id` as it lies on the map now: the ones it rings while it is pointed at. */
  public tokensIn(id: string): readonly string[] {
    return this.layer.tokensIn(id);
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
    this.live.destroy();
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
    // Another mode, scene or level, or the tool put away: what was being measured belongs to none of them. Asked of the change alone.
    if (putAway || !sameScene || state.measureTool.mode !== previous.measureTool.mode) {
      this.input.cancel();
      this.live.clear();
    }
    this.input.setEnabled(measuring);
    if (state.measureTool.players !== previous.measureTool.players) this.live.setHidden(!state.measureTool.players);
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
    // An aura is told to nobody yet: what is passed on says a circle where it was last edited, not where its token stands.
    const kept = list.filter((measure) => measure.hidden !== true && !isAura(measure));
    if (!sameList(kept, this.current.kept)) this.setMeasurements({ ...this.current, kept });
  }

  /** Follows the walls and the tokens of the level shown, asked of their records alone: other walls cut the areas again, other tokens move the auras and are counted again. */
  private readScene(state: MeasureState): void {
    const changed = this.scene.follow(state);
    if (changed.walls) this.layer.wallsChanged();
    // Auras first: one that moved marks and counts its tokens where it lies now.
    if (changed.tokens && this.layer.aurasMoved()) this.handles.placesChanged();
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

  /** The live measurement is another, or gone: it is drawn at the zoom the view has now. */
  private liveChanged(live: LiveMeasure | null): void {
    this.setMeasurements({ ...this.current, live });
    if (live) this.drawnZoom = this.viewport.scale.x;
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
    const moved = this.layer.redraw();
    this.ranges.redraw();
    this.handles.redraw();
    // Another grid or other rules place an aura, and so its handles, anew.
    if (moved) this.handles.placesChanged();
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
