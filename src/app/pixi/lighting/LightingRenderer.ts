import { Matrix, type Application, type Container, type Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { ExploredEdit } from '../../lighting/exploredEdits';
import { sceneLook, type SceneLook } from '../../lighting/sceneLightingOptions';
import type { SceneLighting } from '../../types/lightingTypes';
import { SEES_ALL, type AmbientLight, type AmbientZone, type LightReach, type Sight } from '../../vision/sight';
import { GM_SIGHT_POLICY } from '../../vision/tokenSightPolicy';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import type { UnlitGrid } from '../../grid/gridLightingMark';
import { requestRender } from '../RenderScheduler';
import { awaitGpu, contextLost } from './engine/gpu';
import { LightingEngine } from './engine/LightingEngine';
import type { EngineScene, SceneFrame } from './engine/types';
import { ExploredMemory } from './ExploredMemory';
import type { LightingAttempt } from './lightingAttempts';
import { PlayerView } from './PlayerView';
import { SceneModelBuilder, SceneSpots, type SceneModel } from './sceneModel';
import type { ExploredMemoryWatcher, SceneLightingView } from './sceneLightingView';

/** Above tokens, below their nameplates and bars (100): the GM keeps readable labels in the dark. */
export const LIGHTING_Z_INDEX = 90;
const DEFAULT_CELL_SIZE = 70;

/** Why the engine does not light a view: it stopped on this device, or its last attempt never drew a frame. */
export type LightingUnavailable = 'failed' | 'unfinished';

export interface LightingRendererDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  /** Size of the map image in world pixels, or null before it loaded. */
  bounds: () => MapBounds | null;
  /** The map image, covering world `[0, width] × [0, height]`; bounce reads its colours. */
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
}

type SceneWithoutLook = Omit<EngineScene, keyof SceneLook>;
/**
 * From the build that begins an attempt, over the first lit frame and the tick that waits for
 * the graphics process to execute it, to the tick after that one.
 */
type AttemptState = 'none' | 'begun' | 'drawn' | 'executed' | 'done';

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
  /** What the scene is built from, and when it is built anew (`SceneModelBuilder`). */
  private readonly model = new SceneModelBuilder();
  private readonly spots = new SceneSpots();
  private readonly gmSpots = new SceneSpots(GM_SIGHT_POLICY);
  private reaches: LightReach[] = [];
  private sight: Sight = SEES_ALL;
  /** The zones of the scene as the rules read them, and the ambient light made of them and the scene's lighting. */
  private zones: readonly AmbientZone[] = [];
  private ambient: { lighting: SceneLighting; zones: readonly AmbientZone[]; light: AmbientLight } | null = null;
  /** The last scene without its look (`SceneLook`), reused while only the look changes; none from lighting off, the map leaving or a lost context until the next build. */
  private lastScene: SceneWithoutLook | null = null;
  private attemptState: AttemptState = 'none';
  private stopped = false;
  /** A scene build worked out new sight; reported once the guarded work is over. */
  private sightChanged = false;
  private readonly onContextLost = (): void => this.memory.holdSaves();
  private readonly playerView = new PlayerView((shown) => this.engine.setMode(shown ? 'player' : 'gm'));
  private readonly unsubscribe: () => void;
  private readonly tick = (): void => this.run(() => this.animate());

  constructor(private readonly deps: LightingRendererDeps) {
    const { renderer } = deps.app;
    this.engine = new LightingEngine(renderer);
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
    });
    renderer.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.layer.zIndex = LIGHTING_Z_INDEX;
    this.layer.onRender = (): void => this.onLayerRender();
    deps.viewport.addChild(this.layer);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.run(() => this.update(state)));
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
    this.run(() => this.engine.flush());
    return this.engine.renderFrame(frame, render);
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
    this.run(() => this.memory.beforeMapUnload());
    this.model.reset();
    this.lastScene = null;
    this.endAttempt();
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
    // An unfinished attempt builds nothing more, not even from the scene the engine remembers.
    this.engine.setEnabled(false);
    this.deps.onUnavailable?.(reason);
  }

  private update(state: ViewAtlasState): void {
    const { lighting } = state;
    // A load rewrites the store in steps (the next map's path, a cleared scene, the saved one):
    // lighting is off for its duration, and the update that ends it builds the scene whole.
    const bounds = lighting.enabled && !state.isMapLoading ? this.deps.bounds() : null;
    if (!bounds) {
      // Nothing is drawn while off; the next update after switching on rebuilds everything.
      this.engine.setEnabled(false);
      this.model.reset();
      this.lastScene = null;
      this.endAttempt();
      return;
    }
    if (!this.beginAttempt()) {
      this.stop('unfinished');
      return;
    }
    this.engine.setEnabled(true);
    this.memory.sync(bounds, state.exploredMask);

    const { model, rebuilt } = this.model.update(state, bounds, this.deps.measurement, this.deps.rules);
    const base = rebuilt || !this.lastScene ? (this.lastScene = this.takeModel(model, state, bounds)) : this.lastScene;
    const spots = this.spots.update(model, state, this.deps.measurement, this.deps.rules);
    const gmSight = model.gmSight ?? model.sight;
    // Both pictures always show the same tokens (`GM_SIGHT_POLICY`), so the same sight gives the same footprints.
    const gmSpots = gmSight === model.sight ? spots : this.gmSpots.update(model, state, this.deps.measurement, this.deps.rules, gmSight);
    this.engine.update({ ...base, spots: gmSpots, ...(gmSight !== model.sight && { playerSight: model.sight, playerSpots: spots }), ...sceneLook(lighting) });
    requestRender(this.deps.app);
  }

  /** A model built anew: its sight and reaches are the view's, and what the tokens now see is recorded. */
  private takeModel({ walls, lights, reaches, sight, gmSight = sight, explored, zones, ambient }: SceneModel, state: ViewAtlasState, bounds: MapBounds): SceneWithoutLook {
    this.reaches = reaches;
    this.sight = sight;
    this.zones = ambient.zones ?? [];
    this.sightChanged = true;
    if (explored) this.memory.record(explored);
    return { bounds, albedo: this.deps.albedo(), walls, lights, sight: gmSight, sightRadius: (state.grid?.size ?? DEFAULT_CELL_SIZE) * 0.5, zones };
  }

  /**
   * The GPU reset: every render texture came back blank, with lighting on or off. The saved
   * memory is reloaded and the scene rebuilt, as a new attempt: one the reset cut short was
   * never finished, which `LightingAttempt.begin` then reports.
   */
  private afterContextRestored(): void {
    this.attemptState = 'none';
    const state = this.deps.store.getState();
    // The memory comes back as it was last saved: the texels its undo steps hold belong to a texture that is gone.
    this.memory.forgetEdits();
    this.memory.reload(state.exploredMask);
    this.update(state);
  }

  /**
   * Lighting a map is an attempt until the engine has drawn a frame of it (`LightingAttempt`
   * notes it on this device, so a start that crashed the graphics process is not repeated).
   * False when the last attempt on this map never finished.
   */
  private beginAttempt(): boolean {
    if (this.attemptState !== 'none') return true;
    if (this.deps.attempt?.begin() === false) return false;
    this.attemptState = 'begun';
    return true;
  }

  /** Lighting goes off or the map leaves: an attempt still open ends without a verdict. */
  private endAttempt(): void {
    if (this.attemptState !== 'none' && this.attemptState !== 'done') this.deps.attempt?.finish();
    this.attemptState = 'none';
  }

  /**
   * The frame after the first lit render waits until the graphics process has executed it
   * (`awaitGpu`); the frame after that, which `run` skips on a lost context, ends the attempt.
   */
  private settleAttempt(): void {
    if (this.attemptState === 'drawn') {
      awaitGpu(this.deps.app.renderer);
      this.attemptState = 'executed';
    } else if (this.attemptState === 'executed') {
      this.deps.attempt?.finish();
      this.attemptState = 'done';
    }
  }

  /** The composite maps screen pixels to the world with the camera of the frame being rendered. */
  private onLayerRender(): void {
    const { viewport } = this.deps;
    const worldToScreen = new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y);
    this.engine.setView(worldToScreen.invert(), viewport.scale.x);
    this.engine.setGrid(this.deps.grid?.() ?? null);
    if (this.attemptState === 'begun' && this.engine.hasWorld()) this.attemptState = 'drawn';
  }

  private animate(): void {
    this.settleAttempt();
    if (!this.layer.visible || !this.engine.busy()) return;
    // ponytail: animated lights redraw the whole light map even while off-screen; cull to the viewport if that gets slow.
    if (this.engine.animate(performance.now())) requestRender(this.deps.app);
  }

  destroy(): void {
    this.stopped = true;
    this.unsubscribe();
    this.deps.app.ticker.remove(this.tick);
    this.deps.app.renderer.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.endAttempt();
    // The composite reads the memory's texture: it goes first.
    this.engine.destroy();
    this.memory.destroy();
  }
}
