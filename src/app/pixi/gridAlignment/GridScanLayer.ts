/**
 * Shows a grid detection on the map while it runs: the waves, the map's lines and the grid taking
 * shape (`scanChoreography.ts`), drawn by one mesh over the map (`gridScanShader.ts`). The layer is
 * the GM's alone and moves only while a scan is under way.
 */

import { AlphaFilter, Color, Container, Geometry, Mesh, RenderTexture } from 'pixi.js';
import type { Application, Shader, Texture, Ticker, WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { alignmentGridColor } from '../../grid/GridSystem';
import type { MapStretch } from '../../grid/mapStretch';
import type { AlignmentPoint, AlignmentResult, MapBounds } from '../gridAlignmentMath';
import type { DetectionEvent, InkMap } from '../spectralEngine/detectionJob';
import { requestRender } from '../RenderScheduler';
import { destroyTree } from '../utils/destroyTree';
import { createGridScanShader } from './gridScanShader';
import type { GridScanShader } from './gridScanShader';
import { ScanChoreography } from './scanChoreography';
import { IDENTITY } from './scanFrame';
import type { ScanLattice } from './scanFrame';
import { latticeOnMap, reachOf, worldToImageShare } from './scanGeometry';
import { isSoftwareRenderer, scanPace } from './scanPace';
import type { ScanPace } from './scanPace';
import { hitsTexture, inkTexture } from './scanTextures';

/** The map a scan runs over. */
export interface ScannedMap {
  readonly worldRect: MapBounds | null;
  readonly imageSize: { width: number; height: number } | null;
  readonly mapStretch: MapStretch;
  /** The map's picture as one texture, laid on its image; null until it is made. */
  albedoTexture?(): Texture | null;
}

export interface GridScanHost {
  app: Application;
  viewport: Viewport;
  map: ScannedMap;
  /** Shows `overlay` to the GM alone; returns what removes it again. */
  addOverlay(overlay: Container): () => void;
  /** Whether a swell may bend the map's picture; unset, it may. */
  bendsMap?(): boolean;
}

/** The map's middle, as shares of its rect. */
const MAP_MIDDLE: AlignmentPoint = { x: 0.5, y: 0.5 };

function rgb(color: number): [number, number, number] {
  const { red, green, blue } = new Color(color);
  return [red, green, blue];
}

export class GridScanLayer {
  private readonly view = new Container({ label: 'gridScan', eventMode: 'none', visible: false });
  private readonly geometry: Geometry;
  private readonly positions = new Float32Array(8);
  private readonly shader: GridScanShader;
  private readonly removeOverlay: () => void;
  private choreography: ScanChoreography | null = null;
  /** Where the waves start, as shares of the map's rect, so it keeps its place on a map drawn another way. */
  private origin = MAP_MIDDLE;
  private ink: Texture | null = null;
  private hits: Texture | null = null;
  private onRevealed: (() => void) | null = null;
  private onStill: (() => void) | null = null;
  private onQuiet: (() => void) | null = null;
  /** Passes the scan through as it is, at whatever resolution it is given. */
  private readonly half = new AlphaFilter({ alpha: 1 });
  private ticking = false;
  private destroyed = false;
  /** False once the scan's first draw failed on this device. */
  private usable = true;

  /**
   * Null where the scan cannot be drawn (no WebGL) or cannot be drawn well (a renderer in software,
   * a device that proved too slow for it this session): a detection then shows its answer alone.
   */
  static create(host: GridScanHost, pace: ScanPace = scanPace): GridScanLayer | null {
    const { renderer } = host.app;
    if (renderer.name !== 'webgl' || pace.quality === 'none') return null;
    return isSoftwareRenderer((renderer as WebGLRenderer).gl) ? null : new GridScanLayer(host, pace);
  }

  private constructor(private readonly host: GridScanHost, private readonly pace: ScanPace) {
    this.geometry = new Geometry({
      attributes: { aPosition: { buffer: this.positions, format: 'float32x2' } },
      indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });
    this.shader = createGridScanShader();
    this.view.addChild(new Mesh<Geometry, Shader>({ geometry: this.geometry, shader: this.shader.shader }));
    this.removeOverlay = host.addOverlay(this.view);
    this.warm();
  }

  /**
   * Draws the scan once, into a texture of one pixel. A program is compiled on its first draw,
   * which takes a frame or several: that is spent here, when the scan is made, and not on the
   * first frames of a detection, where it showed as a hitch. It is also where a driver that
   * rejects the program shows itself: PIXI only logs a failed link and then throws from every
   * render that draws with it, so a scan whose first draw fails is never shown at all.
   */
  private warm(): void {
    const { app } = this.host;
    const target = RenderTexture.create({ width: 1, height: 1 });
    this.view.visible = true;
    try {
      app.renderer.render({ container: this.view, target });
    } catch (error) {
      this.usable = false;
      console.warn('[GridScan] This graphics device cannot draw the grid scan: detections show their answers alone', error);
    } finally {
      this.view.visible = false;
      target.destroy(true);
      // An off-screen render takes the stage's pending changes with it.
      requestRender(app);
    }
  }

  get active(): boolean {
    return this.choreography?.active ?? false;
  }

  /** Begins a scan whose waves run out from `origin` (a point of the world), or from the map's middle. */
  start(origin?: AlignmentPoint): void {
    const rect = this.host.map.worldRect;
    if (!rect || this.destroyed || !this.usable) return;
    this.origin = origin ? { x: (origin.x - rect.x) / rect.width, y: (origin.y - rect.y) / rect.height } : MAP_MIDDLE;
    this.onRevealed = null;
    this.setInk(null);
    this.setHits(null);
    this.choreography = this.choreographyOver(rect);
    this.choreography.begin();
    this.pace.begin();
    this.tick();
  }

  /** Shows what a detection under way reports. */
  show(event: DetectionEvent): void {
    if (event.type === 'ink') this.showInk(event.ink);
    else if (event.type === 'fit') this.showFit(event.fit);
    else this.showTrial(event.trial);
  }

  /** The map's lines, which glow where the looking wave has passed. */
  private showInk(ink: InkMap): void {
    if (this.active) this.setInk(inkTexture(ink));
  }

  /** A grid the detection found on its way. */
  private showFit(fit: AlignmentResult): void {
    const lattice = this.latticeOf(fit);
    if (lattice) this.choreography?.fit(lattice, fit.confidence ?? 0);
  }

  /** A grid the detection tries next. */
  private showTrial(trial: AlignmentResult): void {
    const lattice = this.latticeOf(trial);
    if (lattice) this.choreography?.trial(lattice);
  }

  private latticeOf(grid: AlignmentResult): ScanLattice | null {
    const { map } = this.host;
    return grid.gridType && map.imageSize ? latticeOnMap({ ...grid, gridType: grid.gridType }, map.imageSize, map.mapStretch) : null;
  }

  /**
   * The detection's answer, once the map is drawn as it wants it. `revealed` is called when the
   * locking wave has passed the whole map, or at once where no scan can show.
   */
  lock(result: AlignmentResult, hits: Float32Array | null, revealed: () => void): void {
    const rect = this.host.map.worldRect;
    if (!rect || !result.gridType || this.destroyed || !this.usable) {
      revealed();
      return;
    }
    // A map drawn another way since the scan began has another rect.
    this.choreography ??= this.choreographyOver(rect);
    this.onRevealed = revealed;
    if (hits) this.setHits(hitsTexture(hits, rect));
    const { gridType, cellSize, offsetX, offsetY } = result;
    this.choreography.lock({ gridType, cellSize, offsetX, offsetY, toLattice: IDENTITY });
    this.tick();
  }

  /** Calls `still` once, when the scan under way has nothing left to show, however it ends. */
  whenStill(still: () => void): void {
    this.onStill = still;
  }

  /** Calls `quiet` once, when the scan under way shows nothing the eye still follows (`ScanFrame.quiet`), however it ends. */
  whenQuiet(quiet: () => void): void {
    this.onQuiet = quiet;
  }

  /** Whether a scan is on the map: from its start until it has nothing left to show. */
  get showing(): boolean {
    return this.ticking;
  }

  /** The detection found no grid. */
  miss(): void {
    this.choreography?.miss();
  }

  /** Ends whatever shows; a grid waiting behind the locking wave is revealed at once. */
  cancel(): void {
    this.choreography?.cancel();
    this.reveal();
  }

  /** Safe to call again: a scan that ends by itself and the scene that is left may both ask. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.reveal();
    this.removeOverlay();
    destroyTree(this.view);
    this.geometry.destroy(true);
    this.shader.shader.destroy();
    this.half.destroy();
  }

  private originInWorld(rect: MapBounds): AlignmentPoint {
    return { x: rect.x + this.origin.x * rect.width, y: rect.y + this.origin.y * rect.height };
  }

  private choreographyOver(rect: MapBounds): ScanChoreography {
    return new ScanChoreography(reachOf(this.originInWorld(rect), rect));
  }

  private reveal(): void {
    const revealed = this.onRevealed;
    this.onRevealed = null;
    revealed?.();
  }

  private tick(): void {
    if (this.ticking) return;
    this.ticking = true;
    this.host.app.ticker.add(this.frame);
    this.frame(this.host.app.ticker);
  }

  private sayQuiet(): void {
    const quiet = this.onQuiet;
    this.onQuiet = null;
    quiet?.();
  }

  private stop(): void {
    // A view that closes destroys its app, ticker and all, before the panel over it is gone: there is nothing to leave then.
    const ticker = this.host.app.ticker as Ticker | null;
    if (this.ticking) ticker?.remove(this.frame);
    this.ticking = false;
    this.view.visible = false;
    this.choreography = null;
    this.setInk(null);
    this.setHits(null);
    // The map's picture is the map image's, which another scene or level destroys
    this.shader.setPicture(null);
    // Last: whoever hears this may destroy the scan (a new scene's detection does).
    this.sayQuiet();
    const still = this.onStill;
    this.onStill = null;
    still?.();
  }

  private readonly frame = (ticker: Ticker): void => {
    const { viewport, map, app } = this.host;
    const rect = map.worldRect;
    if (!this.choreography || !rect || !map.imageSize) {
      this.stop();
      this.reveal();
      return;
    }
    // A device that cannot keep up gets the scan at half its pixels, or is spared it.
    if (this.pace.frame(ticker.deltaMS) && this.pace.quality === 'none') {
      this.choreography.cancel();
      this.reveal();
    }
    const frame = this.choreography.step(ticker.deltaMS);
    if (frame.revealed) this.reveal();
    if (frame.quiet) this.sayQuiet();
    if (frame.still) {
      this.stop();
      requestRender(app);
      return;
    }

    // The overlay stands on the stage: it follows the viewport to lie on the map.
    this.view.position.copyFrom(viewport.position);
    this.view.scale.copyFrom(viewport.scale);
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    this.positions.set([rect.x, rect.y, right, rect.y, right, bottom, rect.x, bottom]);
    this.geometry.getBuffer('aPosition').update();
    const origin = this.originInWorld(rect);
    // At half the pixels the scan is drawn into a layer of its own, which is laid over the map enlarged.
    const coarse = this.pace.quality === 'half';
    this.half.resolution = app.renderer.resolution / 2;
    this.view.filters = coarse ? [this.half] : null;
    if (coarse) this.view.filterArea = app.screen;
    // A swell bends the map's own picture, which is the unlit map: over a lit scene it would show what the light hides.
    this.shader.setPicture(this.host.bendsMap?.() === false ? null : map.albedoTexture?.()?.source ?? null);
    this.shader.update({
      mapRect: rect,
      pixelSize: (coarse ? 2 : 1) / viewport.scale.x,
      origin,
      reach: reachOf(origin, rect),
      lineColor: rgb(alignmentGridColor()),
      toInk: worldToImageShare(map.imageSize, map.mapStretch),
    }, frame);
    this.view.visible = true;
    // Uniforms are no change the scene graph sees.
    requestRender(app);
  };

  // A texture leaves the shader before it is destroyed: one destroyed while bound is a PIXI warning.
  private setInk(texture: Texture | null): void {
    const old = this.ink;
    this.ink = texture;
    this.shader.setInk(texture?.source ?? null);
    old?.destroy(true);
  }

  private setHits(texture: Texture | null): void {
    const old = this.hits;
    this.hits = texture;
    this.shader.setHits(texture?.source ?? null);
    old?.destroy(true);
  }
}
