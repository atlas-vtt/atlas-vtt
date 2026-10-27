import { Container, Graphics, Matrix, Rectangle, Texture, type Renderer } from 'pixi.js';
import { exploredMemoryOn } from '../../../lighting/sceneLightingOptions';
import { DEFAULT_LIGHTING_QUALITY, type LightingQuality } from '../../../lighting/lightingQuality';
import type { UnlitGrid } from '../../../grid/gridLightingMark';
import { destroyTree } from '../../utils/destroyTree';
import { BackBufferHold } from './backBuffer';
import { createCompositeFilter, NO_BELOW, type BelowPictures, type CompositeFilter, type CompositeStack, type LightingMode } from './compositeFilter';
import { contextLost, glOf } from './gpu';
import { LightingWorld } from './LightingWorld';
import { ambientLift, darkLooks } from './senseDrawing';
import { describeShaderFailures, failedEngineShaders } from './shaderCheck';
import { SceneSightLayers } from './SceneSightLayers';
import type { BoundFields } from './WallFields';
import type { EngineScene, SceneFrame } from './types';
import type { Box } from '../../../vision/polygonBounds';

/** How an engine draws: on the canvas as the view's own lighting, or off-screen as a level below the view's (`LevelsBelow`). */
export interface LightingEngineOptions {
  /** The level of the view's stack this engine lights: 0 the level the view shows (the default), 1 or 2 a level below it drawn. */
  levelIndex?: number;
  /**
   * Whether the engine holds the canvas' back buffer while it is on (the default). An engine that
   * only ever renders into textures needs none, and must leave the view's own hold alone.
   */
  backBuffer?: boolean;
  /** Whether heavy work goes to the graphics device only as fast as it runs it (`GpuPacer`); off (the default), every update builds everything at once. */
  paced?: boolean;
}

/** The snapshots of the levels below for a render, and how much each level down is dimmed. */
export interface BelowShown {
  pictures: BelowPictures;
  dim: number;
}

const NOTHING_BELOW: BelowShown = { pictures: NO_BELOW, dim: 1 };

/**
 * Scene lighting, independent of the store: world-space caches (`LightingWorld`), sight meshes
 * and a bounds rectangle in one layer, lit by the composite filter. The world exists only while
 * lighting is enabled.
 *
 * The engine never takes its caller down. Before it draws on a context it asks the driver
 * whether its shaders link (`failedEngineShaders`); it draws nothing while the context is lost;
 * and an error thrown by a pass stops it for good (`failed`): the layer is hidden, the world and
 * the back buffer are released, and every later call does nothing. A restored context is only
 * noted in PIXI's runner; the world is rebuilt from the last scene at the engine's next call.
 */
export class LightingEngine {
  readonly layer = new Container({ label: 'lighting' });
  private readonly boundsRect = new Graphics();
  private readonly sightLayers = new SceneSightLayers();
  private world: LightingWorld | null = null;
  private composite: CompositeFilter | null = null;
  private boundFields: BoundFields | null = null;
  private explored: Texture = Texture.EMPTY;
  /** The level stack of the view's openings, and the pictures of the levels below for the render about to be drawn. */
  private stack: CompositeStack | null = null;
  private below: BelowShown = { pictures: NO_BELOW, dim: 1 };
  /** Where the composite runs beyond the world: the maps of the levels below seen through the openings. */
  private coverage: { width: number; height: number } | null = null;
  private readonly levelIndex: number;
  private mode: LightingMode = 'gm';
  private view = { screenToWorld: new Matrix(), zoom: 1 };
  /** An off-screen render holds the composite on its own view (`renderFrame`). */
  private viewHeld = false;
  private scene: EngineScene | null = null;
  private grid: UnlitGrid | null = null;
  private enabled = false;
  private stopped = false;
  /** The shaders link on the current context. */
  private verified = false;
  /** The context was restored: the world's textures are blank until it is rebuilt. */
  private stale = false;
  private restoreUnreported = false;
  // Rebuilding renders, and PIXI's other systems may not have their context back yet.
  private readonly contextListener = {
    contextChange: (): void => {
      this.stale = true;
      this.restoreUnreported = true;
    },
  };

  private readonly backBuffer: BackBufferHold | null;
  private readonly paced: boolean;

  constructor(private readonly renderer: Renderer, private quality: LightingQuality = DEFAULT_LIGHTING_QUALITY, options: LightingEngineOptions = {}) {
    this.paced = options.paced ?? false;
    this.backBuffer = options.backBuffer === false ? null : new BackBufferHold(renderer);
    this.levelIndex = options.levelIndex ?? 0;
    this.layer.eventMode = 'none';
    this.layer.addChild(this.boundsRect, this.sightLayers.view);
    renderer.runners.contextChange.add(this.contextListener);
  }

  /** The engine cannot run on this graphics device; it draws nothing for the rest of its life. */
  get failed(): boolean {
    return this.stopped;
  }

  hasWorld(): boolean {
    return !!this.world;
  }

  /** True once after each restored context: the owner's own render textures came back blank too. */
  takeRestored(): boolean {
    const restored = this.restoreUnreported;
    this.restoreUnreported = false;
    return restored;
  }

  /** Does nothing while disabled: the next update after `setEnabled(true)` builds everything. */
  update(scene: EngineScene): void {
    if (!this.enabled || this.stopped) return;
    this.scene = scene;
    this.attempt(() => this.build(scene));
  }

  /**
   * A new quality takes effect at once: flicker on the world as it is, a texel, bounce or tile
   * rays of its own in a world built anew from the last scene (the old one's textures go once the
   * composite has the new ones).
   */
  setQuality(quality: LightingQuality): void {
    this.quality = quality;
    this.composite?.setPixelRatio(this.pixelRatio());
    this.world?.setFlicker(quality.flickerMs);
    const { scene } = this;
    if (scene && this.world && !this.world.fits(quality, scene.cellSize)) this.attempt(() => this.build(scene));
  }

  private build(scene: EngineScene): void {
    const { bounds } = scene;
    if (!this.world || this.world.bounds.width !== bounds.width || this.world.bounds.height !== bounds.height || !this.world.fits(this.quality, scene.cellSize)) {
      this.replaceWorld(new LightingWorld(this.renderer, bounds, this.quality, this.paced, scene.cellSize));
    }
    const world = this.world!;
    const composite = this.composite!;
    this.sightLayers.update(scene);
    const frame = this.sightLayers.select(this.viewHeld ? 'gm' : this.mode)!;
    world.update(scene.walls, scene.lights, scene.albedo, frame.pierce);
    if (world.fields.bound() !== this.boundFields) {
      this.boundFields = world.fields.bound();
      composite.setWorld(world);
    }
    world.setZones(scene.zones, scene);
    composite.setMaps(world.darknessMap(), world.zoneMap());
    // The composite has let go of a darkness map and a zone map the scene no longer needs.
    world.trim();
    composite.setAllSeen(frame.sight.all);
    composite.setDarkLooks(darkLooks(frame.sight, !!frame.spots?.length, scene));
    composite.setAmbient(scene.ambient, scene.ambientColor, ambientLift(scene));
    composite.setMemoryShown(exploredMemoryOn(scene));
    composite.setMemoryColours(scene.exploredColor, scene.unexploredColor);
  }

  /**
   * The one switch for the back buffer (`BackBufferHold`): the composite reads the scene beneath
   * it, and without one WebGL skips the composite and the layer shows the map unlit. Disabling
   * frees the world textures (100–270 MB on large maps).
   */
  setEnabled(on: boolean): void {
    if (this.stopped) return;
    this.enabled = on;
    this.layer.visible = on;
    this.backBuffer?.set(on);
    if (!on) this.dropWorld();
  }

  /**
   * The grid the composite draws unlit (`UnlitGrid`), handed over at every render, since the map
   * may get a new one. It is marked exactly while the composite draws: a grid marked without it
   * would erase the map under its lines.
   */
  setGrid(grid: UnlitGrid | null): void {
    if (grid !== this.grid) {
      this.grid?.setMarking(false);
      this.grid = grid;
    }
    grid?.setMarking(this.composite !== null);
    this.composite?.setGrid(grid?.markColor() ?? null);
  }

  /** Builds what is still to build and redraws the flicker when due; `view` (world px) is where flicker is looked at (`LightingWorld.animate`). */
  animate(now: number, view?: Box): boolean {
    return this.attempt(() => this.currentWorld()?.animate(now, false, view)) ?? false;
  }

  busy(): boolean {
    return this.world?.busy() ?? false;
  }

  flush(): void {
    this.attempt(() => this.currentWorld()?.flush());
  }

  /**
   * Stops the engine for good after an error on the graphics device, the engine's own or one
   * its owner met in lighting work beside it (explored memory).
   */
  fail(error: unknown): void {
    if (this.stopped) return;
    console.error('Atlas: dynamic lighting stopped after an error on the graphics device', error);
    this.stop();
  }

  setMode(mode: LightingMode): void {
    this.mode = mode;
    if (!this.viewHeld) this.attempt(() => this.applySightMode(mode));
  }

  /** The picture and its magical-darkness cutouts always use the same frame's sight. */
  private applySightMode(mode: LightingMode): void {
    const { scene, world, composite } = this;
    const frame = this.sightLayers.select(mode);
    if (!scene || !world || !composite || !frame) return;
    world.update(scene.walls, scene.lights, scene.albedo, frame.pierce);
    composite.setMaps(world.darknessMap(), world.zoneMap());
    composite.setAllSeen(frame.sight.all);
    composite.setDarkLooks(darkLooks(frame.sight, !!frame.spots?.length, scene));
    composite.setMode(mode);
  }

  setView(screenToWorld: Matrix, zoom: number): void {
    this.view.screenToWorld.copyFrom(screenToWorld);
    this.view.zoom = zoom;
    if (!this.viewHeld) this.composite?.setView(screenToWorld, zoom);
  }

  /**
   * Runs `render`, a render of the layer's scene outside the stage's (a thumbnail), with the
   * composite on the GM's view of `frame` instead of the canvas's camera and mode. Those set
   * meanwhile, as the layer's `onRender` does in every render, wait until it is done. The layer
   * renders in the tree as on the canvas: PIXI copies any render target into a blend filter's
   * back texture, and only the canvas needs the back buffer for that.
   */
  renderFrame<T>(frame: SceneFrame, render: () => T, below: BelowShown = NOTHING_BELOW): T {
    // Off or stopped, the engine has no composite: the render is as it is without lighting.
    if (!this.composite) return render();
    this.viewHeld = true;
    // A thumbnail is drawn on every pixel it has.
    this.composite?.setPixelRatio(undefined);
    this.attempt(() => this.applySightMode('gm'));
    // Without a camera a frame pixel is 1 / resolution world pixels, counted from (x, y).
    this.composite?.setView(new Matrix(1, 0, 0, 1, frame.x, frame.y), frame.resolution);
    // The levels below drawn for this frame; where none was, their texels show nothing.
    this.composite?.setBelow(below.pictures, below.dim);
    try {
      return render();
    } finally {
      this.viewHeld = false;
      this.composite?.setPixelRatio(this.pixelRatio());
      this.attempt(() => this.applySightMode(this.mode));
      this.composite?.setView(this.view.screenToWorld, this.view.zoom);
      this.composite?.setBelow(this.below.pictures, this.below.dim);
    }
  }

  /** The level stack of the view's openings (`LevelStackTexture`), or null while the level shows only itself. The caller owns its texture. */
  setStack(stack: CompositeStack | null): void {
    this.stack = stack;
    this.composite?.setStack(stack);
    // A level below without a stack is drawn nowhere, so its area may stay as it was.
    if (this.levelIndex > 0 && stack) this.layer.filterArea = belowArea(stack);
  }

  /**
   * The snapshots of the levels below for the render about to be drawn (`LevelsBelow.prepare`),
   * nearest first, dimmed by `dim` once per level down; a level without one shows nothing where the
   * stack shows it. The caller owns the textures.
   */
  setBelow(pictures: BelowPictures, dim: number): void {
    this.below = { pictures, dim };
    if (!this.viewHeld) this.composite?.setBelow(pictures, dim);
  }

  /**
   * Where the composite runs besides the world: from the origin over `area` (the maps of the levels
   * below seen through the view's openings, a tower's ground beyond its own map); null, the world alone.
   */
  setCoverage(area: { width: number; height: number } | null): void {
    if (area?.width === this.coverage?.width && area?.height === this.coverage?.height) return;
    this.coverage = area;
    this.drawBounds();
  }

  /** The caller owns `texture`; set its replacement before destroying it. */
  setExplored(texture: Texture): void {
    this.explored = texture;
    this.composite?.setExplored(texture);
  }

  destroy(): void {
    this.renderer.runners.contextChange.remove(this.contextListener);
    this.dropWorld();
    this.sightLayers.destroy();
    destroyTree(this.layer);
    this.backBuffer?.release();
  }

  /** Runs GPU work if the device can take it now; an error stops the engine instead of escaping. */
  private attempt<T>(work: () => T): T | undefined {
    if (this.stopped || !this.enabled) return undefined;
    try {
      return this.ready() ? work() : undefined;
    } catch (error) {
      this.fail(error);
      return undefined;
    }
  }

  /**
   * Whether the context is there and links the engine's shaders. After a restored context the
   * world goes (its textures are blank) and the shaders are checked again on the new one.
   */
  private ready(): boolean {
    if (contextLost(this.renderer)) return false;
    if (this.stale) {
      const scene = this.scene;
      this.dropWorld();
      this.scene = scene;
      this.stale = false;
      this.verified = false;
    }
    if (this.verified) return true;
    const gl = glOf(this.renderer);
    const failures = gl ? failedEngineShaders(gl) : [];
    // Lost while compiling: the logs say nothing about the device. Wait for the restore.
    if (contextLost(this.renderer)) return false;
    if (failures.length > 0) {
      console.error(`Atlas: dynamic lighting cannot run on this graphics device. These shaders did not compile:\n${describeShaderFailures(failures)}`);
      this.stop();
      return false;
    }
    this.verified = true;
    return true;
  }

  /**
   * Device pixels per screen pixel the composite may take (`LightingQuality.compositePixelRatio`).
   * Only the view's own level: a level below draws its picture texel on pixel for the view's
   * composite, which reads it as it is.
   */
  private pixelRatio(): number | undefined {
    return this.levelIndex === 0 ? this.quality.compositePixelRatio : undefined;
  }

  /** The world, rebuilt from the last scene when a restored context took it. */
  private currentWorld(): LightingWorld | null {
    if (!this.world && this.scene) this.build(this.scene);
    return this.world;
  }

  /** Leaves stage renders clean: no layer, no composite, no back buffer. */
  private stop(): void {
    this.stopped = true;
    this.enabled = false;
    this.layer.visible = false;
    try {
      this.dropWorld();
    } catch (error) {
      console.error('Atlas: could not release the lighting textures', error);
    }
    this.backBuffer?.release();
  }

  /** The composite goes with the world, so it never holds the world's destroyed textures. */
  private dropWorld(): void {
    this.grid?.setMarking(false);
    this.layer.filters = null;
    this.composite?.filter.destroy();
    this.composite = null;
    this.boundFields = null;
    this.world?.destroy();
    this.world = null;
    this.scene = null;
    this.sightLayers.clear();
  }

  /** The composite moves to the new world before the old one's textures are destroyed. */
  private replaceWorld(world: LightingWorld): void {
    const previous = this.world;
    this.world = world;
    this.boundFields = world.fields.bound();
    if (this.composite) {
      // The darkness map and the zone map are the old world's: nothing of them may stay bound when that world goes.
      this.composite.setMaps(null, null);
      this.composite.setWorld(world);
    } else {
      this.composite = createCompositeFilter(world, this.explored);
      this.composite.setMode(this.mode);
      this.composite.setView(this.view.screenToWorld, this.view.zoom);
      this.composite.setLevelIndex(this.levelIndex);
      this.composite.setPixelRatio(this.pixelRatio());
      this.composite.setStack(this.stack);
      this.composite.setBelow(this.below.pictures, this.below.dim);
      this.layer.filters = [this.composite.filter];
    }
    previous?.destroy();
    this.drawBounds();
    this.sightLayers.clear();
  }

  /** PIXI takes the filter area from the children's bounds: keep the whole map covered, and what lies beyond it through the openings. */
  private drawBounds(): void {
    if (!this.world) return;
    const { width, height } = this.world.bounds;
    this.boundsRect.clear().rect(0, 0, Math.max(width, this.coverage?.width ?? 0), Math.max(height, this.coverage?.height ?? 0)).fill({ color: 0, alpha: 0 });
  }
}

/**
 * Where a level below's composite runs: the stack's texels, a texel wider all round, in world pixels
 * (the layer's own). Its picture is read only where the stack shows it, so the rest of the map is
 * left unlit and costs nothing.
 */
function belowArea(stack: CompositeStack): Rectangle {
  const { box, texel } = stack;
  return new Rectangle((box.x - 1) * texel, (box.y - 1) * texel, (box.columns + 2) * texel, (box.rows + 2) * texel);
}
