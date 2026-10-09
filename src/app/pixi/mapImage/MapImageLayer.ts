/**
 * Draws a map image from its tile pyramid at the level of detail of each picture that shows it, over
 * coarser tiles while finer ones load. Every view (the GM's camera, each demand region, a picture of the
 * whole map) has its own tiles; the layer keeps sprites for all of them, so textures and fades are
 * shared, and the canvas shows only the camera's. `drawFor` shows another view's for one render.
 * One render group of one container per level.
 */
import { Container, Rectangle, UPDATE_PRIORITY, type Ticker } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { levelFor, orderByPriority, pictureView, visibleTiles, type TileView } from './levelOfDetail';
import { tileContentFrame, tileKey, type TileRef } from './pyramid';
import { coversView, tileCoverage, type TileKeySet } from './tileCoverage';
import { TileRequests, type TileSource } from './tileRequests';
import { TileSprites } from './tileSprites';
import { tileTextureKey, type TileTextureCache } from './tileTextureCache';

export type { TileSource } from './tileRequests';

/** Tiles loaded around each view beyond what it shows, so a pan finds them ready. */
const PREFETCH_RING = 1;

/** Reads the GM's camera; null while it shows nothing (no size yet). */
export type CameraSource = () => TileView | null;

export interface MapImageLayerOptions {
  source: TileSource;
  cache: TileTextureCache;
  /** Runs the layer's update once per frame, before the stage renders. */
  ticker: Ticker;
  requestRender: () => void;
  camera?: CameraSource | null;
  /** The size of the pictures of the whole map taken (thumbnails): their tiles are kept loaded. */
  picture?: { width: number; height: number } | null;
  /** Read when a tile appears: true draws it at once instead of fading it in. */
  drawAtOnce?: () => boolean;
  maxInFlight?: number;
  /** Called once per tile whose request failed; the layer does not request it again. */
  onTileError?: (ref: TileRef, error: unknown) => void;
}

interface Waiter {
  view: TileView;
  settle: () => void;
}

export class MapImageLayer {
  /** Add this to the viewport at (0, 0): world units are the source's natural pixels. */
  readonly container: Container;
  private readonly sprites: TileSprites;
  private readonly failed = new Map<string, TileRef>();
  private readonly regions = new Set<TileView>();
  private readonly waiters = new Set<Waiter>();
  private readonly overviewTiles: TileRef[];
  private readonly picture: TileView | null;
  private readonly requests: TileRequests;
  private readonly loaded: TileKeySet = { has: key => this.isLoaded(key) };
  private readonly stopReady: () => void;
  private camera: CameraSource | null;
  private lastCamera: TileView | null = null;
  private dirty = true;
  private destroyed = false;

  constructor(private readonly options: MapImageLayerOptions) {
    const { pyramid } = options.source;
    this.camera = options.camera ?? null;
    this.container = new Container({ isRenderGroup: true, label: 'map-image' });
    this.container.boundsArea = new Rectangle(0, 0, pyramid.width, pyramid.height);
    this.container.eventMode = 'none';
    // Coarsest first, so finer levels lie on top.
    const levels = pyramid.levels.map(level => new Container({ scale: { x: level.scaleX, y: level.scaleY } }));
    for (const level of [...levels].reverse()) this.container.addChild(level);
    this.sprites = new TileSprites({
      pyramid,
      levels,
      texture: ref => (this.isLoaded(tileKey(ref)) ? options.cache.get(this.textureKey(ref)) : null),
      requestRender: options.requestRender,
      ...(options.drawAtOnce && { drawAtOnce: options.drawAtOnce }),
      onOpaque: () => { this.dirty = true; },
    });
    const whole = { x: 0, y: 0, width: pyramid.width, height: pyramid.height };
    const overview = pyramid.levels[pyramid.overview];
    this.overviewTiles = overview ? visibleTiles(pyramid, overview.index, whole, 0) : [];
    this.picture = options.picture ? pictureView(whole, options.picture) : null;
    this.requests = new TileRequests(options.source, { arrived: this.arrived, failed: this.failedTile }, options.maxInFlight);
    const prefix = `${options.source.key}/`;
    this.stopReady = options.cache.onReady((key) => {
      if (key.startsWith(prefix)) this.dirty = true;
    });
    options.ticker.add(this.tick, undefined, UPDATE_PRIORITY.LOW + 1);
  }

  /** Replaces the GM camera (null: the canvas shows no tile; demand regions are still loaded). */
  setCamera(camera: CameraSource | null): void {
    this.camera = camera;
    this.dirty = true;
  }

  /** Keeps the tiles `view` needs loaded and ready to draw, e.g. another camera's; returns the function that ends it. */
  addDemandRegion(view: TileView): () => void {
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
   * that render and restore before the canvas renders again. Tiles `view` asks for that are not loaded
   * fall back on what is, as on the canvas; keep them loaded with `addDemandRegion`.
   */
  drawFor(view: TileView): () => void {
    if (this.destroyed) return noop;
    const { pyramid } = this.options.source;
    // As `update` covers a view, so a demand region's picture is the one its tiles were loaded for.
    const tiles = visibleTiles(pyramid, levelFor(pyramid, view.worldPerScreenPixel), view.rect, PREFETCH_RING);
    // The render shows each tile as it is now: one with no fade under way is opaque in it.
    const settled: TileKeySet = { has: key => this.sprites.isSettled(key) };
    return this.sprites.drawOnly(tileCoverage(pyramid, tiles, this.loaded, settled).draw);
  }

  /**
   * Resolves once every point of `view` is covered by opaque (or failed) tiles of its level of detail
   * or finer; or after `timeoutMs`, or when the layer is destroyed. Its tiles are requested meanwhile.
   */
  whenReady(view: TileView, timeoutMs: number): Promise<void> {
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

  /** Aborts every request and removes the sprites; `keepTextures` leaves the tiles to the cache's LRU. */
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

  /** Each view's tiles by its own coverage; the union is loaded and kept, the camera's shown. */
  private update(camera: TileView | null): void {
    const { pyramid } = this.options.source;
    const views = camera ? [camera, ...this.regions] : [...this.regions];
    const draw: TileRef[] = [];
    const keep = new Set<string>();
    const retained: TileRef[] = [];
    const wanted: TileRef[] = [...this.overviewTiles];
    const missing: TileRef[] = [];
    let shown = new Set<string>();
    const cover = (view: TileView): TileRef[] => {
      const tiles = visibleTiles(pyramid, levelFor(pyramid, view.worldPerScreenPixel), view.rect, PREFETCH_RING);
      wanted.push(...tiles);
      const coverage = tileCoverage(pyramid, tiles, this.loaded, this.sprites.opaqueKeys);
      draw.push(...coverage.draw);
      retained.push(...coverage.retain);
      for (const ref of coverage.retain) keep.add(tileKey(ref));
      if (view === camera) shown = new Set(coverage.draw.map(tileKey));
      return coverage.missing;
    };
    for (const view of views) missing.push(...cover(view));
    // A picture of the whole map waits behind every view someone looks at.
    const pictureMissing = this.picture ? cover(this.picture) : [];

    const toRequest = (ref: TileRef): boolean => !this.failed.has(tileKey(ref)) && !this.options.cache.has(this.textureKey(ref));
    const queue = [...this.overviewTiles, ...orderByPriority(pyramid, missing, views), ...pictureMissing];
    this.requests.sync(queue.filter(toRequest), new Set(wanted.map(tileKey)));

    this.sprites.sync(draw, keep, shown);
    const pinned = new Set<string>();
    for (const ref of [...wanted, ...retained]) pinned.add(this.textureKey(ref));
    this.options.cache.pin(this, pinned);
    for (const waiter of [...this.waiters]) if (this.isReady(waiter.view)) waiter.settle();
  }

  private isReady(view: TileView): boolean {
    const { pyramid } = this.options.source;
    const tiles = visibleTiles(pyramid, levelFor(pyramid, view.worldPerScreenPixel), view.rect, 0);
    return coversView(pyramid, tiles, [...this.sprites.opaqueTiles(), ...this.failed.values()], view.rect);
  }

  private isLoaded(key: string): boolean {
    return this.options.cache.isReady(`${this.options.source.key}/${key}`);
  }

  private textureKey(ref: TileRef): string {
    return tileTextureKey(this.options.source.key, ref);
  }

  private readonly arrived = (ref: TileRef, bitmap: ImageBitmap): void => {
    this.dirty = true;
    if (this.destroyed) {
      bitmap.close();
      return;
    }
    this.options.cache.add(this.textureKey(ref), bitmap, tileContentFrame(this.options.source.pyramid, ref));
  };

  private readonly failedTile = (ref: TileRef, error: unknown): void => {
    this.failed.set(tileKey(ref), ref);
    this.dirty = true;
    this.options.onTileError?.(ref, error);
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

function sameView(a: TileView | null, b: TileView | null): boolean {
  if (!a || !b) return a === b;
  return a.worldPerScreenPixel === b.worldPerScreenPixel && a.rect.x === b.rect.x && a.rect.y === b.rect.y
    && a.rect.width === b.rect.width && a.rect.height === b.rect.height;
}
