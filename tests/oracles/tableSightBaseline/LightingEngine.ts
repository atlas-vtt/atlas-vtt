// Frozen from 3c23746a6f54b67b442646ea8ff912c914c2447a src/app/pixi/lighting/engine/LightingEngine.ts. Only import paths are adapted.
import { Container, Graphics, Matrix, Texture, type Renderer } from 'pixi.js';
import { exploredMemoryOn } from '../../../src/app/lighting/sceneLightingOptions';
import type { UnlitGrid } from '../../../src/app/grid/gridLightingMark';
import type { Sight } from './sight';
import { destroyTree } from '../../../src/app/pixi/utils/destroyTree';
import { BackBufferHold } from '../../../src/app/pixi/lighting/engine/backBuffer';
import { createCompositeFilter, type CompositeFilter, type LightingMode } from '../../../src/app/pixi/lighting/engine/compositeFilter';
import { contextLost, glOf } from '../../../src/app/pixi/lighting/engine/gpu';
import { LightingWorld } from '../../../src/app/pixi/lighting/engine/LightingWorld';
import type { PierceShape } from '../../../src/app/pixi/lighting/engine/DarknessMap';
import { ambientLift, darkLooks, pierceShapes } from '../../../src/app/pixi/lighting/engine/senseDrawing';
import { describeShaderFailures, failedEngineShaders } from '../../../src/app/pixi/lighting/engine/shaderCheck';
import { SightMeshes } from '../../../src/app/pixi/lighting/engine/SightMeshes';
import type { BoundFields } from '../../../src/app/pixi/lighting/engine/WallFields';
import type { EngineScene, SceneFrame } from '../../../src/app/pixi/lighting/engine/types';

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
  private readonly sightMeshes = new SightMeshes();
  private world: LightingWorld | null = null;
  private composite: CompositeFilter | null = null;
  private boundFields: BoundFields | null = null;
  private explored: Texture = Texture.EMPTY;
  private mode: LightingMode = 'gm';
  private view = { screenToWorld: new Matrix(), zoom: 1 };
  /** An off-screen render holds the composite on its own view (`renderFrame`). */
  private viewHeld = false;
  private sight: Sight | null = null;
  private spots: EngineScene['spots'];
  /** What is perceived inside magical darkness, kept while sight and footprints stay. */
  private pierce: readonly PierceShape[] = [];
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

  private readonly backBuffer: BackBufferHold;

  constructor(private readonly renderer: Renderer) {
    this.backBuffer = new BackBufferHold(renderer);
    this.layer.eventMode = 'none';
    this.layer.addChild(this.boundsRect, this.sightMeshes.view);
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

  private build(scene: EngineScene): void {
    const { bounds } = scene;
    if (!this.world || this.world.bounds.width !== bounds.width || this.world.bounds.height !== bounds.height) {
      this.replaceWorld(new LightingWorld(this.renderer, bounds));
    }
    const world = this.world!;
    const composite = this.composite!;
    const newSight = scene.sight !== this.sight;
    const newSpots = scene.spots !== this.spots;
    if (newSight || newSpots) this.pierce = pierceShapes(scene.sight, scene.sight.all ? [] : scene.spots);
    world.update(scene.walls, scene.lights, scene.albedo, this.pierce);
    if (world.fields.bound() !== this.boundFields) {
      this.boundFields = world.fields.bound();
      composite.setWorld(world);
    }
    world.setZones(scene.zones, scene);
    composite.setMaps(world.darknessMap(), world.zoneMap());
    // The composite has let go of a darkness map and a zone map the scene no longer needs.
    world.trim();
    if (newSight) {
      this.sight = scene.sight;
      this.sightMeshes.draw(scene.sight, scene.sightRadius);
      composite.setAllSeen(scene.sight.all);
    }
    if (newSpots) {
      this.spots = scene.spots;
      this.sightMeshes.drawSpots(scene.sight.all ? [] : scene.spots ?? []);
    }
    composite.setDarkLooks(darkLooks(scene.sight, !!scene.spots?.length, scene));
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
    this.backBuffer.set(on);
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

  animate(now: number): boolean {
    return this.attempt(() => this.currentWorld()?.animate(now)) ?? false;
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
    if (!this.viewHeld) this.composite?.setMode(mode);
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
  renderFrame<T>(frame: SceneFrame, render: () => T): T {
    // Off or stopped, the engine has no composite: the render is as it is without lighting.
    if (!this.composite) return render();
    this.viewHeld = true;
    this.composite.setMode('gm');
    // Without a camera a frame pixel is 1 / resolution world pixels, counted from (x, y).
    this.composite.setView(new Matrix(1, 0, 0, 1, frame.x, frame.y), frame.resolution);
    try {
      return render();
    } finally {
      this.viewHeld = false;
      this.composite?.setMode(this.mode);
      this.composite?.setView(this.view.screenToWorld, this.view.zoom);
    }
  }

  /** The caller owns `texture`; set its replacement before destroying it. */
  setExplored(texture: Texture): void {
    this.explored = texture;
    this.composite?.setExplored(texture);
  }

  destroy(): void {
    this.renderer.runners.contextChange.remove(this.contextListener);
    this.dropWorld();
    this.sightMeshes.destroy();
    destroyTree(this.layer);
    this.backBuffer.release();
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
    this.backBuffer.release();
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
    this.sight = null;
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
      this.layer.filters = [this.composite.filter];
    }
    previous?.destroy();
    const { width, height } = world.bounds;
    // PIXI takes the filter area from the children's bounds: keep the whole map covered.
    this.boundsRect.clear().rect(0, 0, width, height).fill({ color: 0, alpha: 0 });
    this.sight = null;
  }
}
