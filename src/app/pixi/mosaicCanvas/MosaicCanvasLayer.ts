/**
 * Draws a map image from its tessera pyramid at the level of detail of each picture that shows it, over
 * coarser tesserae while finer ones load. Every view (the GM's camera, each demand region, a picture of the
 * whole map) has its own tesserae; the layer keeps sprites for all of them, so textures and fades are
 * shared, and the canvas shows only the camera's. `drawFor` shows another view's for one render.
 * One render group of one container per level.
 */
import { Container, Rectangle, UPDATE_PRIORITY, type Ticker } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { finestLevel, levelFor, orderByPriority, pictureView, visibleTesserae, type TesseraView } from './levelOfDetail';
import { tesseraContentFrame, tesseraKey, type TesseraRef } from './pyramid';
import { coversView, tesseraCoverage, type TesseraKeySet } from './tesseraCoverage';
import { TesseraRequests, type TesseraSource } from './tesseraRequests';
import { TesseraSprites } from './tesseraSprites';
import { tesseraTextureKey, type TesseraTextureCache } from './tesseraTextureCache';

export type { TesseraSource } from './tesseraRequests';

/** Tesserae loaded around each view beyond what it shows, so a pan finds them ready. */
const PREFETCH_RING = 1;

/** Reads the GM's camera; null while it shows nothing (no size yet). */
export type CameraSource = () => TesseraView | null;

export interface MosaicCanvasLayerOptions {
  source: TesseraSource;
  cache: TesseraTextureCache;
  /** Runs the layer's update once per frame, before the stage renders. */
  ticker: Ticker;
  requestRender: () => void;
  camera?: CameraSource | null;
  /** The size of the pictures of the whole map taken (thumbnails): their tesserae are kept loaded. */
  picture?: { width: number; height: number } | null;
  /** Read when a tessera appears: true draws it at once instead of fading it in. */
  drawAtOnce?: () => boolean;
  maxInFlight?: number;
  /** Called once per tessera whose request failed; the layer does not request it again. */
  onTesseraError?: (ref: TesseraRef, error: unknown) => void;
}

interface Waiter {
  view: TesseraView;
  settle: () => void;
}

export class MosaicCanvasLayer {
  /** Add this to the viewport at (0, 0): world units are the source's natural pixels. */
  readonly container: Container;
  private readonly sprites: TesseraSprites;
  private readonly failed = new Map<string, TesseraRef>();
  private readonly regions = new Set<TesseraView>();
  private readonly waiters = new Set<Waiter>();
  private readonly overviewTesserae: TesseraRef[];
  private readonly picture: TesseraView | null;
  private readonly requests: TesseraRequests;
  private readonly loaded: TesseraKeySet = { has: key => this.isLoaded(key) };
  private readonly stopReady: () => void;
  private camera: CameraSource | null;
  private lastCamera: TesseraView | null = null;
  private dirty = true;
  private destroyed = false;
  /** The finest level the source serves: no view asks for a finer one. */
  private readonly finest: number;

  constructor(private readonly options: MosaicCanvasLayerOptions) {
    const { pyramid } = options.source;
    this.camera = options.camera ?? null;
    this.container = new Container({ isRenderGroup: true, label: 'map-image' });
    this.container.boundsArea = new Rectangle(0, 0, pyramid.width, pyramid.height);
    this.container.eventMode = 'none';
    // Coarsest first, so finer levels lie on top.
    const levels = pyramid.levels.map(level => new Container({ scale: { x: level.scaleX, y: level.scaleY } }));
    for (const level of [...levels].reverse()) this.container.addChild(level);
    this.sprites = new TesseraSprites({
      pyramid,
      levels,
      texture: ref => (this.isLoaded(tesseraKey(ref)) ? options.cache.get(this.textureKey(ref)) : null),
      requestRender: options.requestRender,
      ...(options.drawAtOnce && { drawAtOnce: options.drawAtOnce }),
      onOpaque: () => { this.dirty = true; },
    });
    const whole = { x: 0, y: 0, width: pyramid.width, height: pyramid.height };
    this.finest = finestLevel(pyramid, options.source.finestSide);
    const overview = pyramid.levels[Math.max(pyramid.overview, this.finest)];
    this.overviewTesserae = overview ? visibleTesserae(pyramid, overview.index, whole, 0) : [];
    this.picture = options.picture ? pictureView(whole, options.picture) : null;
    this.requests = new TesseraRequests(options.source, { arrived: this.arrived, failed: this.failedTessera }, options.maxInFlight);
    const prefix = `${options.source.key}/`;
    this.stopReady = options.cache.onReady((key) => {
      if (key.startsWith(prefix)) this.dirty = true;
    });
    options.ticker.add(this.tick, undefined, UPDATE_PRIORITY.LOW + 1);
  }

  /** Replaces the GM camera (null: the canvas shows no tessera; demand regions are still loaded). */
  setCamera(camera: CameraSource | null): void {
    this.camera = camera;
    this.dirty = true;
  }

  /** Keeps the tesserae `view` needs loaded and ready to draw, e.g. another camera's; returns the function that ends it. */
  addDemandRegion(view: TesseraView): () => void {
    const region = { rect: { ...view.rect }, worldPerScreenPixel: view.worldPerScreenPixel };
    this.regions.add(region);
    this.dirty = true;
    return (): void => {
      if (this.regions.delete(region)) this.dirty = true;
    };
  }

  /**
   * Shows what `view` draws instead of the GM camera's picture, until the returned function puts that
   * back: for one render of another picture (the player window's, a thumbnail). Call it right before
   * that render and restore before the canvas renders again. Tesserae `view` asks for that are not loaded
   * fall back on what is, as on the canvas; keep them loaded with `addDemandRegion`.
   */
  drawFor(view: TesseraView): () => void {
    if (this.destroyed) return noop;
    const { pyramid } = this.options.source;
    // As `update` covers a view, so a demand region's picture is the one its tesserae were loaded for.
    const tesserae = visibleTesserae(pyramid, levelFor(pyramid, view.worldPerScreenPixel, this.finest), view.rect, PREFETCH_RING);
    // The render shows each tessera as it is now: one with no fade under way is opaque in it.
    const settled: TesseraKeySet = { has: key => this.sprites.isSettled(key) };
    return this.sprites.drawOnly(tesseraCoverage(pyramid, tesserae, this.loaded, settled).draw);
  }

  /**
   * Resolves once every point of `view` is covered by opaque (or failed) tesserae of its level of detail
   * or finer; or after `timeoutMs`, or when the layer is destroyed. Its tesserae are requested meanwhile.
   */
  whenReady(view: TesseraView, timeoutMs: number): Promise<void> {
    if (this.destroyed || this.isReady(view)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const removeRegion = this.addDemandRegion(view);
      const waiter: Waiter = {
        view,
        settle: (): void => {
          window.clearTimeout(timer);
          this.waiters.delete(waiter);
          removeRegion();
          resolve();
        },
      };
      const timer = window.setTimeout(waiter.settle, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  /** Aborts every request and removes the sprites; `keepTextures` leaves the tesserae to the cache's LRU. */
  destroy({ keepTextures = false }: { keepTextures?: boolean } = {}): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.ticker.remove(this.tick);
    this.stopReady();
    this.requests.close();
    this.sprites.destroy();
    destroyTree(this.container);
    this.options.cache.unpin(this);
    if (!keepTextures) this.options.cache.deletePyramid(this.options.source.key);
    this.options.requestRender();
    for (const waiter of [...this.waiters]) waiter.settle();
  }

  private readonly tick = (): void => {
    const camera = this.camera?.() ?? null;
    if (!sameView(camera, this.lastCamera)) {
      this.lastCamera = camera;
      this.dirty = true;
    }
    if (!this.dirty || this.destroyed) return;
    this.dirty = false;
    this.update(camera);
  };

  /** Each view's tesserae by its own coverage; the union is loaded and kept, the camera's shown. */
  private update(camera: TesseraView | null): void {
    const { pyramid } = this.options.source;
    const views = camera ? [camera, ...this.regions] : [...this.regions];
    const draw: TesseraRef[] = [];
    const keep = new Set<string>();
    const retained: TesseraRef[] = [];
    const wanted: TesseraRef[] = [...this.overviewTesserae];
    const missing: TesseraRef[] = [];
    let shown = new Set<string>();
    const cover = (view: TesseraView): TesseraRef[] => {
      const tesserae = visibleTesserae(pyramid, levelFor(pyramid, view.worldPerScreenPixel, this.finest), view.rect, PREFETCH_RING);
      wanted.push(...tesserae);
      const coverage = tesseraCoverage(pyramid, tesserae, this.loaded, this.sprites.opaqueKeys);
      draw.push(...coverage.draw);
      retained.push(...coverage.retain);
      for (const ref of coverage.retain) keep.add(tesseraKey(ref));
      if (view === camera) shown = new Set(coverage.draw.map(tesseraKey));
      return coverage.missing;
    };
    for (const view of views) missing.push(...cover(view));
    // A picture of the whole map waits behind every view someone looks at.
    const pictureMissing = this.picture ? cover(this.picture) : [];

    const toRequest = (ref: TesseraRef): boolean => !this.failed.has(tesseraKey(ref)) && !this.options.cache.has(this.textureKey(ref));
    const queue = [...this.overviewTesserae, ...orderByPriority(pyramid, missing, views), ...pictureMissing];
    this.requests.sync(queue.filter(toRequest), new Set(wanted.map(tesseraKey)));

    this.sprites.sync(draw, keep, shown);
    const pinned = new Set<string>();
    for (const ref of [...wanted, ...retained]) pinned.add(this.textureKey(ref));
    this.options.cache.pin(this, pinned);
    for (const waiter of [...this.waiters]) if (this.isReady(waiter.view)) waiter.settle();
  }

  private isReady(view: TesseraView): boolean {
    const { pyramid } = this.options.source;
    const tesserae = visibleTesserae(pyramid, levelFor(pyramid, view.worldPerScreenPixel, this.finest), view.rect, 0);
    return coversView(pyramid, tesserae, [...this.sprites.opaqueTesserae(), ...this.failed.values()], view.rect);
  }

  private isLoaded(key: string): boolean {
    return this.options.cache.isReady(`${this.options.source.key}/${key}`);
  }

  private textureKey(ref: TesseraRef): string {
    return tesseraTextureKey(this.options.source.key, ref);
  }

  private readonly arrived = (ref: TesseraRef, bitmap: ImageBitmap): void => {
    this.dirty = true;
    if (this.destroyed) {
      bitmap.close();
      return;
    }
    this.options.cache.add(this.textureKey(ref), bitmap, tesseraContentFrame(this.options.source.pyramid, ref));
  };

  private readonly failedTessera = (ref: TesseraRef, error: unknown): void => {
    this.failed.set(tesseraKey(ref), ref);
    this.dirty = true;
    this.options.onTesseraError?.(ref, error);
  };
}

function noop(): void {}

/** The GM camera of a pixi-viewport: what it shows and the world units per device pixel. */
export function viewportCamera(
  viewport: { left: number; top: number; worldScreenWidth: number; worldScreenHeight: number; scale: { x: number } },
  renderer: { resolution: number },
): CameraSource {
  return () => {
    const zoom = viewport.scale.x;
    if (!(zoom > 0) || !(viewport.worldScreenWidth > 0) || !(viewport.worldScreenHeight > 0)) return null;
    return {
      rect: { x: viewport.left, y: viewport.top, width: viewport.worldScreenWidth, height: viewport.worldScreenHeight },
      worldPerScreenPixel: 1 / (zoom * renderer.resolution),
    };
  };
}

function sameView(a: TesseraView | null, b: TesseraView | null): boolean {
  if (!a || !b) return a === b;
  return a.worldPerScreenPixel === b.worldPerScreenPixel && a.rect.x === b.rect.x && a.rect.y === b.rect.y
    && a.rect.width === b.rect.width && a.rect.height === b.rect.height;
}
