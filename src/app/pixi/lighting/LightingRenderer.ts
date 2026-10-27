import { Matrix, type Application, type Container, type Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand/vanilla';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { ExploredEdit } from '../../lighting/exploredEdits';
import { DEFAULT_LIGHTING_QUALITY, type LightingQuality, type LightingQualitySource } from '../../lighting/lightingQuality';
import { sceneLook, type SceneLook } from '../../lighting/sceneLightingOptions';
import type { SceneLighting } from '../../types/lightingTypes';
import type { ViewState } from '../../types/viewState';
import { SEES_ALL, type AmbientLight, type AmbientZone, type LightReach, type Sight } from '../../vision/sight';
import { GM_SIGHT_POLICY } from '../../vision/tokenSightPolicy';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import type { UnlitGrid } from '../../grid/gridLightingMark';
import { requestRender } from '../RenderScheduler';
import { LevelsBelow, type BelowLevelsHost, type BelowRender } from './levels/LevelsBelow';
import type { TokenPerception } from '../../vision/tokenPerception';
import type { ArtFloors } from '../../levels/levelSurfaces';
import { contextLost } from './engine/gpu';
import { AttemptProgress } from './AttemptProgress';
import { LightingEngine } from './engine/LightingEngine';
import type { EngineScene, SceneFrame } from './engine/types';
import type { BelowShown } from './engine/LightingEngine';
import { ExploredMemory, type ExploredMemoryState } from './ExploredMemory';
import type { LightingAttempt } from './lightingAttempts';
import { PlayerView } from './PlayerView';
import { SceneModelBuilder, SceneSpots, type SceneModel, type SceneState } from '../../vision/sceneModel';
import type { ExploredMemoryWatcher, SceneLightingView } from './sceneLightingView';
import { levelExploredMask, viewedLevelId } from '../../levels/sceneLevels';
import { MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';
import { frameTime } from '../utils/animationFrames';
import type { Box } from '../../vision/polygonBounds';

/**
 * Where flicker is looked at: the GM's view grown by half its size on every side, as for liquids
 * (`boxInView`), since the player window frames at least that.
 */
function animationView(viewport: Viewport, screen: { width: number; height: number }): Box {
  const [scaleX, scaleY] = [viewport.scale.x || 1, viewport.scale.y || 1];
  const [left, top] = [-viewport.x / scaleX, -viewport.y / scaleY];
  const [width, height] = [screen.width / scaleX, screen.height / scaleY];
  return { minX: left - width / 2, minY: top - height / 2, maxX: left + width * 1.5, maxY: top + height * 1.5 };
}

/** Above tokens, below their nameplates and bars (100): the GM keeps readable labels in the dark. */
export const LIGHTING_Z_INDEX = 90;

/** A drag's sight is stamped into the explored memory at most this often (ms): each stamp is a few ms of GPU work (`ExploredMemory`). */
const EXPLORED_STAMP_MS = 100;

/** Whether the pointer holds tokens (`heldTokens`, noted for every drag). */
function dragging(state: Pick<ViewState, 'heldTokens'>): boolean {
  for (const _ in state.heldTokens) return true;
  return false;
}
const DEFAULT_CELL_SIZE = 70;

/** Why the engine does not light a view: it stopped on this device, or its last attempt never drew a frame. */
export type LightingUnavailable = 'failed' | 'unfinished';

/**
 * What the lighting reads of its view's state: the scene it lights, the load flag, the explored
 * memory's part, and what it draws of the level below through the openings (`LevelsBelow`).
 */
export type LightingState = SceneState & ExploredMemoryState & Pick<ViewState, 'exploredMask' | 'exploredMasks' | 'background' | 'levelAlignments'> & {
  objects: Pick<ViewState['objects'], 'fog' | 'levelSurfaces'>;
  /** The GM hides the roofs of the GM's picture (the switcher's Roofs). */
  roofsHidden?: boolean;
  /** How large the map draws token rings; the tokens of levels below wear theirs alike. */
  tokenSettings?: Pick<ViewState['tokenSettings'], 'tokenRingSize'>;
};

export type LightingStore = Pick<StoreApi<LightingState>, 'getState' | 'subscribe'>;

export interface LightingRendererDeps {
  viewport: Viewport;
  app: Application;
  store: LightingStore;
  measurement: () => MeasurementSettings;
  /** Size of the map image in world pixels, or null before it loaded. */
  bounds: () => MapBounds | null;
  /**
   * The map image's colours, covering world `[0, width] × [0, height]` at any resolution; bounce
   * reads them. Null while they are not ready (mid grey meanwhile); the view follows when they arrive.
   */
  albedo: () => Texture | null;
  /** The grid the composite draws unlit, while there is one (`UnlitGrid`). */
  grid?: () => UnlitGrid | null;
  /** The senses and conditions of the map's collection; the generic ones without it. */
  rules?: () => SightRules;
  /** The device-local record of attempts to light this map; without one every attempt is made. */
  attempt?: LightingAttempt;
  /** The engine cannot light this view. The renderer has stopped; its owner replaces and destroys it. */
  onUnavailable?: (reason: LightingUnavailable) => void;
  /** What the tokens see or which light reaches them was worked out anew. */
  onSightChange?: () => void;
  /** Who shows the GM the explored memory while it is edited. */
  exploredWatcher?: ExploredMemoryWatcher;
  /** How much the lighting may ask of the graphics device, followed while the view lives; the default quality without one. */
  quality?: LightingQualitySource;
  /** What the view gives the levels below it, seen through its openings; without it the openings show nothing below. */
  below?: BelowLevelsHost;
  /** How long a piece of a roof below takes to fade; unset, the motion of the canvas's window (none where it asks for reduced motion). */
  roofFadeMs?: number;
}

type SceneWithoutLook = Omit<EngineScene, keyof SceneLook | 'albedo'>;

/**
 * Scene lighting for one map view: feeds the store's walls, lights and vision tokens to the
 * `LightingEngine`, which lights the scene beneath its layer, hides what no token sees in the
 * player view and ghosts it for the GM. Explored memory (`ExploredMemory`) records nothing with
 * the scene's explored memory off, but keeps (and saves) what it holds.
 *
 * Lighting never takes the map down: every call that reaches the GPU goes through `run`, which
 * draws nothing while the WebGL context is lost, rebuilds after its restore and turns an error
 * into `onUnavailable` instead of letting it reach the store, the ticker or PIXI.
 */
export class LightingRenderer implements SceneLightingView {
  readonly layer: Container;
  /** Visible means the players' view: flipped by the player-frame capture, held in session view. */
  readonly modeLayer: HideableLayer;
  private readonly engine: LightingEngine;
  private readonly memory: ExploredMemory;
  /**
   * What the scene is built from, and when it is built anew (`SceneModelBuilder`); a moving light
   * is built whole once it rests, on the clock of the display frames (`frameTime`).
   */
  private readonly model = new SceneModelBuilder({ clock: () => this.clock() });
  private readonly spots = new SceneSpots();
  private readonly gmSpots = new SceneSpots(GM_SIGHT_POLICY);
  private reaches: LightReach[] = [];
  private sight: Sight = SEES_ALL;
  /** The zones of the scene as the rules read them, and the ambient light made of them and the scene's lighting. */
  private zones: readonly AmbientZone[] = [];
  private ambient: { lighting: SceneLighting; zones: readonly AmbientZone[]; light: AmbientLight } | null = null;
  /** The last scene without its look (`SceneLook`), reused while only the look changes; none from lighting off, the map leaving or a lost context until the next build. */
  private lastScene: SceneWithoutLook | null = null;
  /** The albedo the engine was last given. */
  private albedo: Texture | null = null;
  private readonly attempt: AttemptProgress;
  private stopped = false;
  /** A scene build worked out new sight; reported once the guarded work is over. */
  private sightChanged = false;
  private readonly onContextLost = (): void => {
    this.memory.holdSaves();
    this.levelsBelow?.holdSaves();
  };
  private readonly playerView = new PlayerView((shown) => this.engine.setMode(shown ? 'player' : 'gm'));
  /** The levels below seen through the viewed level's openings; none without a host. */
  private readonly levelsBelow: LevelsBelow | null;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeQuality: () => void;
  private quality: LightingQuality;
  private readonly tick = (): void => this.run(() => this.animate());

  constructor(private readonly deps: LightingRendererDeps) {
    const { renderer } = deps.app;
    this.quality = deps.quality?.current() ?? DEFAULT_LIGHTING_QUALITY;
    this.engine = new LightingEngine(renderer, this.quality, { paced: true });
    this.attempt = new AttemptProgress(renderer, deps.attempt);
    this.layer = this.engine.layer;
    this.memory = new ExploredMemory({
      renderer,
      store: deps.store,
      onTexture: (texture) => {
        if (texture) this.engine.setExplored(texture);
        deps.exploredWatcher?.setTexture(texture);
      },
      onTravel: (undone) => deps.exploredWatcher?.memoryTravelled(undone),
      onChange: () => requestRender(deps.app),
      guard: (work) => this.run(work),
      stampEveryMs: EXPLORED_STAMP_MS,
    });
    this.levelsBelow = deps.below ? new LevelsBelow({
      app: deps.app,
      viewport: deps.viewport,
      store: deps.store,
      host: deps.below,
      quality: () => this.quality,
      measurement: deps.measurement,
      ...(deps.rules && { rules: deps.rules }),
      view: this.engine,
      mode: () => (this.playerView.visible ? 'player' : 'gm'),
      requestRender: () => requestRender(deps.app),
      fadeMs: deps.roofFadeMs ?? (prefersReducedMotion(deps.app.canvas) ? 0 : MOTION_SLOW_MS),
      onReady: () => this.run(() => this.update(deps.store.getState())),
      guard: (work) => this.run(work),
    }) : null;
    renderer.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.layer.zIndex = LIGHTING_Z_INDEX;
    this.layer.onRender = (): void => this.onLayerRender();
    deps.viewport.addChild(this.layer);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.run(() => this.update(state)));
    this.unsubscribeQuality = deps.quality?.onChange(() => this.followQuality()) ?? ((): void => undefined);
    deps.app.ticker.add(this.tick);
    this.run(() => this.update(deps.store.getState()));
  }

  isEnabled(): boolean {
    return this.deps.store.getState().lighting.enabled;
  }

  currentSight(): Sight { return this.sight; }
  sightIsCurrent(): boolean { return !this.isEnabled() || this.lastScene !== null; }
  lightReaches(): LightReach[] { return this.reaches; }
  /** The scene's lighting as the rules read it: with its zones when it has any, the same object while both stay. */
  ambientLight(): AmbientLight {
    const { lighting } = this.deps.store.getState();
    if (this.zones.length === 0) return lighting;
    if (this.ambient?.lighting !== lighting || this.ambient.zones !== this.zones) this.ambient = { lighting, zones: this.zones, light: { ...lighting, zones: this.zones } };
    return this.ambient.light;
  }

  renderForFrame<T>(frame: SceneFrame, render: () => T): T {
    // Bounce still to build after an edit belongs in the picture; so does a world a restored context took.
    let below: BelowShown | undefined;
    this.run(() => {
      this.followAlbedo();
      this.engine.flush();
      below = this.belowForFrame(frame);
    });
    try {
      return this.engine.renderFrame(frame, render, below);
    } finally {
      // Thumbnails are rare: their look's snapshots go once taken.
      this.levelsBelow?.releasePicture('thumbnail');
    }
  }

  /** The levels below seen through the openings, drawn for a picture of the scene in the GM's look; none for a frame without a size. */
  private belowForFrame({ x, y, width, height }: SceneFrame): BelowShown | undefined {
    if (!this.levelsBelow || !width || !height) return undefined;
    return this.levelsBelow.drawFor({ key: 'thumbnail', mode: 'gm', view: { camera: new Matrix(1, 0, 0, 1, -x, -y), width, height } });
  }

  prepareBelow(picture?: BelowRender): void {
    this.run(() => this.levelsBelow?.prepare(picture));
  }

  releaseBelowPicture(): void {
    this.levelsBelow?.releasePicture('frame');
  }

  artFloors(): ArtFloors | undefined {
    return this.levelsBelow?.artFloors;
  }

  belowTokenPerception(): TokenPerception {
    return this.levelsBelow?.tokenPerception(this.deps.store.getState()) ?? ((): 'unseen' => 'unseen');
  }

  /** The quality changed: the engine redraws at the new one, from the scene it holds. */
  private followQuality(): void {
    const quality = this.deps.quality?.current() ?? DEFAULT_LIGHTING_QUALITY;
    if (quality === this.quality) return;
    this.quality = quality;
    this.run(() => {
      this.engine.setQuality(quality);
      // The levels below are lit a tier lower than the view: built anew at the new one.
      this.levelsBelow?.reset(true);
      this.update(this.deps.store.getState());
    });
    requestRender(this.deps.app);
  }

  /** The map image changed size or finished loading. */
  refreshBounds(): void {
    this.run(() => {
      this.model.reset();
      this.update(this.deps.store.getState());
    });
  }

  resetExplored(): void {
    this.memory.reset();
  }

  editExplored(edit: ExploredEdit): boolean {
    return this.memory.edit(edit);
  }

  /** Before the map unloads: save the scene's pending memory into it, then start the next scene blank. */
  beforeMapUnload(): void {
    this.run(() => {
      this.levelsBelow?.reset(true);
      this.memory.beforeMapUnload();
    });
    this.model.reset();
    this.lastScene = null;
    this.attempt.end();
  }

  /**
   * Runs lighting work that reaches the GPU. Nothing is drawn while the context is lost, and the
   * scene counts as not built from then on, since a change of it may go by; the first call after
   * its restore rebuilds; an error stops the engine and reports the view unavailable, once. New
   * sight is reported afterwards, outside the guard: what its listener does is not the engine's
   * to fail on.
   */
  private run(work: () => void): void {
    if (this.stopped) return;
    try {
      if (contextLost(this.deps.app.renderer)) {
        this.lastScene = null;
        return;
      }
      if (this.engine.takeRestored()) this.afterContextRestored();
      if (!this.stopped) work();
    } catch (error) {
      this.engine.fail(error);
    }
    if (this.engine.failed) this.stop('failed');
    if (!this.sightChanged) return;
    this.sightChanged = false;
    if (!this.stopped) this.deps.onSightChange?.();
  }

  private stop(reason: LightingUnavailable): void {
    if (this.stopped) return;
    this.stopped = true;
    // Whatever the memory holds now may be broken: the saved mask stays as it is.
    this.memory.cancelSaves();
    this.levelsBelow?.reset(false);
    // An unfinished attempt builds nothing more, not even from the scene the engine remembers.
    this.engine.setEnabled(false);
    this.deps.onUnavailable?.(reason);
  }

  private update(current: LightingState): void {
    let state = current;
    const { lighting } = state;
    // A load rewrites the store in steps (the next map's path, a cleared scene, the saved one):
    // lighting is off for its duration, and the update that ends it builds the scene whole.
    const bounds = lighting.enabled && !state.isMapLoading ? this.deps.bounds() : null;
    if (!bounds) {
      // Nothing is drawn while off; the next update after switching on rebuilds everything.
      this.levelsBelow?.reset(true);
      this.engine.setCoverage(null);
      this.engine.setEnabled(false);
      this.model.reset();
      this.lastScene = null;
      this.attempt.end();
      return;
    }
    if (!this.attempt.begin()) {
      this.stop('unfinished');
      return;
    }
    this.engine.setEnabled(true);
    // A level below that the view no longer draws saves its memory first: the view may be about to
    // take that level up. What the saves write reaches the store, so the state is read again.
    this.levelsBelow?.drop(state);
    state = this.deps.store.getState();
    // Each level has its memory: showing another one saves the one left and loads its own
    this.memory.sync(bounds, levelExploredMask(state), viewedLevelId(state));
    state = this.deps.store.getState();

    // What the view looks over: its own map, and the maps of the levels below seen through its openings.
    const reach = this.levelsBelow?.reach(state, bounds) ?? null;
    this.engine.setCoverage(reach);
    const { model, rebuilt } = this.model.update(state, bounds, this.deps.measurement, this.deps.rules, reach ?? bounds);
    const base = rebuilt || !this.lastScene ? (this.lastScene = this.takeModel(model, state, bounds)) : this.lastScene;
    // The drag ended: what its tokens saw last goes into the memory now.
    if (!dragging(state)) this.memory.stampDue();
    const spots = this.spots.update(model, state, this.deps.measurement, this.deps.rules);
    const gmSight = model.gmSight ?? model.sight;
    // Both pictures always show the same tokens (`GM_SIGHT_POLICY`), so the same sight gives the same footprints.
    const gmSpots = gmSight === model.sight ? spots : this.gmSpots.update(model, state, this.deps.measurement, this.deps.rules, gmSight);
    this.albedo = this.deps.albedo();
    this.engine.update({ ...base, albedo: this.albedo, spots: gmSpots, ...(gmSight !== model.sight && { playerSight: model.sight, playerSpots: spots }), ...sceneLook(state.lighting) });
    this.levelsBelow?.update(state, bounds, { sight: model.sight, gmSight });
    if (this.levelsBelow?.failed()) this.engine.fail(new Error('The lighting of a level below stopped'));
    requestRender(this.deps.app);
  }

  /** A model built anew: its sight and reaches are the view's, and what the tokens now see is recorded. */
  private takeModel({ walls, lights, reaches, sight, gmSight = sight, explored, zones, ambient }: SceneModel, state: LightingState, bounds: MapBounds): SceneWithoutLook {
    this.reaches = reaches;
    this.sight = sight;
    this.zones = ambient.zones ?? [];
    this.sightChanged = true;
    // A drag records what its tokens see at most every `EXPLORED_STAMP_MS`; any other change at once.
    if (explored) this.memory.record(explored, dragging(state) ? this.clock() : undefined);
    const cellSize = state.grid?.size ?? DEFAULT_CELL_SIZE;
    return { bounds, walls, lights, sight: gmSight, sightRadius: cellSize * 0.5, cellSize, zones };
  }

  /**
   * The GPU reset: every render texture came back blank, with lighting on or off. The saved
   * memory is reloaded and the scene rebuilt, as a new attempt: one the reset cut short was
   * never finished, which `LightingAttempt.begin` then reports.
   */
  private afterContextRestored(): void {
    this.attempt.restart();
    const state = this.deps.store.getState();
    // The memory comes back as it was last saved: the texels its undo steps hold belong to a texture that is gone.
    this.memory.forgetEdits();
    this.memory.reload(levelExploredMask(state));
    // The levels below come back from their saved memories, built anew.
    this.levelsBelow?.reset(false);
    this.update(state);
  }

  /** The time of the display frame (ms), which the map's animations, its lights' motion and the memory's stamps go by. */
  private clock(): number {
    return frameTime(this.deps.app.ticker);
  }

  /** The composite maps screen pixels to the world with the camera of the frame being rendered. */
  private onLayerRender(): void {
    const { viewport } = this.deps;
    const worldToScreen = new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y);
    this.engine.setView(worldToScreen.invert(), viewport.scale.x);
    this.engine.setGrid(this.deps.grid?.() ?? null);
    this.attempt.rendered(this.engine.hasWorld());
  }

  /**
   * The map image's albedo is made after the image (from its overview, once asked for) and goes
   * with it: a lit scene hands the engine the one there is now, which rebuilds only the bounce.
   */
  private followAlbedo(): void {
    if (this.lastScene && this.deps.albedo() !== this.albedo) this.update(this.deps.store.getState());
  }

  private animate(): void {
    this.attempt.settle();
    this.followAlbedo();
    // The display frame's time, which every animation of the map shares, so their frames share renders.
    const now = this.clock();
    // A light that moved has come to rest: its reflection, its full tile and the bounce follow.
    const rest = this.model.restsAt();
    if (rest !== null && now >= rest) this.update(this.deps.store.getState());
    if (this.memory.stampDue(now)) requestRender(this.deps.app);
    if (!this.layer.visible) return;
    const view = animationView(this.deps.viewport, this.deps.app.renderer.screen);
    this.levelsBelow?.animate(now, view);
    if (!this.engine.busy()) return;
    if (this.engine.animate(now, view)) requestRender(this.deps.app);
  }

  destroy(): void {
    this.stopped = true;
    this.unsubscribe();
    this.unsubscribeQuality();
    this.deps.app.ticker.remove(this.tick);
    this.deps.app.renderer.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.attempt.end();
    // The composites read the memories' and the stack's textures: they go first.
    this.levelsBelow?.reset(false);
    this.engine.destroy();
    this.levelsBelow?.destroy();
    this.memory.destroy();
  }
}
