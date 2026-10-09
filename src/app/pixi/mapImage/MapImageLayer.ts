/**
 * Draws a map image from its tile pyramid: the tiles the GM's camera and every demand region need, at their
 * level of detail, over coarser tiles while finer ones load. One render group of one container per level.
 */
import { Container, Rectangle, Sprite, UPDATE_PRIORITY, type Ticker } from 'pixi.js';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { levelFor, orderByPriority, visibleTiles, type TileView } from './levelOfDetail';
import { tileContentFrame, tileContentRect, tileKey, type TileRef } from './pyramid';
import { tileCoverage } from './tileCoverage';
import { TileRequests, type TileSource } from './tileRequests';
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
  /** Read when a tile appears: true draws it at once instead of fading it in. */
  reducedMotion?: () => boolean;
  maxInFlight?: number;
  /** Called once per tile whose request failed; the layer does not request it again. */
  onTileError?: (ref: TileRef, error: unknown) => void;
}

interface DrawnTile {
  sprite: Sprite;
  fade: ValueTransition | null;
}

interface Waiter {
  view: TileView;
  settle: () => void;
}

export class MapImageLayer {
  /** Add this to the viewport at (0, 0): world units are the source's natural pixels. */
  readonly container: Container;
  private readonly levels: Container[];
  private readonly drawn = new Map<string, DrawnTile>();
  private readonly opaque = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly regions = new Set<TileView>();
  private readonly waiters = new Set<Waiter>();
  private readonly overviewTiles: TileRef[];
  private readonly requests: TileRequests;
  private readonly stopReady: () => void;
  private camera: CameraSource | null;
  private lastCamera: TileView | null = null;
  private covered = new Set<string>();
  private dirty = true;
  private destroyed = false;

  constructor(private readonly options: MapImageLayerOptions) {
    const { pyramid } = options.source;
    this.camera = options.camera ?? null;
    this.container = new Container({ isRenderGroup: true, label: 'map-image' });
    this.container.boundsArea = new Rectangle(0, 0, pyramid.width, pyramid.height);
    this.container.eventMode = 'none';
    // Coarsest first, so finer levels lie on top.
    this.levels = pyramid.levels.map(level => new Container({ scale: { x: level.scaleX, y: level.scaleY } }));
    for (const level of [...this.levels].reverse()) this.container.addChild(level);
    const overview = pyramid.levels[pyramid.overview];
    this.overviewTiles = overview ? visibleTiles(pyramid, overview.index, { x: 0, y: 0, width: pyramid.width, height: pyramid.height }, 0) : [];
    this.requests = new TileRequests(options.source, { arrived: this.arrived, failed: this.failedTile }, options.maxInFlight);
    const prefix = `${options.source.key}/`;
    this.stopReady = options.cache.onReady((key) => {
      if (key.startsWith(prefix)) this.dirty = true;
    });
    options.ticker.add(this.tick, undefined, UPDATE_PRIORITY.LOW + 1);
  }

  /** Replaces the GM camera (null: only demand regions are drawn). */
  setCamera(camera: CameraSource | null): void {
    this.camera = camera;
    this.dirty = true;
  }

  /** Keeps the tiles `view` needs loaded and drawn, e.g. another camera's; returns the function that ends it. */
  addDemandRegion(view: TileView): () => void {
    const region = { rect: { ...view.rect }, worldPerScreenPixel: view.worldPerScreenPixel };
    this.regions.add(region);
    this.dirty = true;
    return (): void => {
      if (this.regions.delete(region)) this.dirty = true;
    };
  }

  /**
   * Resolves once every tile `view` shows at its level of detail is drawn opaque, covered by opaque finer
   * tiles, or failed; or after `timeoutMs`, or when the layer is destroyed. Its tiles are requested meanwhile.
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
    for (const tile of this.drawn.values()) tile.fade?.cancel();
    this.drawn.clear();
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
    this.update(camera ? [camera, ...this.regions] : [...this.regions]);
  };

  private update(views: readonly TileView[]): void {
    const { pyramid } = this.options.source;
    const wanted: TileRef[] = [];
    for (const view of views) {
      const level = levelFor(pyramid, view.worldPerScreenPixel);
      wanted.push(...visibleTiles(pyramid, level, view.rect, PREFETCH_RING));
      // The overview is the fallback under every finer level; never drawn minified past its level.
      if (level < pyramid.overview) wanted.push(...visibleTiles(pyramid, pyramid.overview, view.rect, 0));
    }
    const coverage = tileCoverage(pyramid, wanted, { has: key => this.isLoaded(key) }, this.opaque);
    this.covered = new Set(coverage.hidden.map(tileKey));

    const keep = new Set([...this.overviewTiles, ...wanted].map(tileKey));
    const toRequest = (ref: TileRef): boolean => !this.failed.has(tileKey(ref)) && !this.options.cache.has(this.textureKey(ref));
    const fine = coverage.missing.filter(ref => ref.level !== pyramid.overview);
    this.requests.sync([...this.overviewTiles.filter(toRequest), ...orderByPriority(pyramid, fine, views).filter(toRequest)], keep);

    this.syncSprites(coverage.draw, coverage.retain);
    const pinned = new Set<string>();
    for (const ref of [...coverage.retain, ...this.overviewTiles, ...wanted]) pinned.add(this.textureKey(ref));
    this.options.cache.pin(this, pinned);
    for (const waiter of [...this.waiters]) if (this.isReady(waiter.view)) waiter.settle();
  }

  private syncSprites(draw: readonly TileRef[], retain: readonly TileRef[]): void {
    const retained = new Set(retain.map(tileKey));
    const shown = new Set(draw.map(tileKey));
    let changed = false;
    for (const [key, tile] of this.drawn) {
      if (retained.has(key)) {
        if (tile.sprite.visible !== shown.has(key)) {
          tile.sprite.visible = shown.has(key);
          changed = true;
        }
        continue;
      }
      tile.fade?.cancel();
      destroyTree(tile.sprite);
      this.drawn.delete(key);
      this.opaque.delete(key);
      changed = true;
    }
    for (const ref of draw) {
      if (this.drawn.has(tileKey(ref))) continue;
      this.show(ref);
      changed = true;
    }
    if (changed) this.options.requestRender();
  }

  private show(ref: TileRef): void {
    const texture = this.options.cache.get(this.textureKey(ref));
    const level = this.levels[ref.level];
    if (!texture || !level) return;
    const key = tileKey(ref);
    const content = tileContentRect(this.options.source.pyramid, ref);
    const sprite = new Sprite({ texture, x: content.x, y: content.y, label: key });
    sprite.eventMode = 'none';
    level.addChild(sprite);
    const tile: DrawnTile = { sprite, fade: null };
    this.drawn.set(key, tile);
    if (this.options.reducedMotion?.()) {
      this.opaque.add(key);
      this.dirty = true;
      return;
    }
    sprite.alpha = 0;
    tile.fade = new ValueTransition(0, MOTION_NORMAL_MS, (alpha) => {
      sprite.alpha = alpha;
      this.options.requestRender();
    });
    tile.fade.animateTo(1, () => {
      tile.fade = null;
      this.opaque.add(key);
      this.dirty = true;
    });
  }

  private isReady(view: TileView): boolean {
    const { pyramid } = this.options.source;
    const tiles = visibleTiles(pyramid, levelFor(pyramid, view.worldPerScreenPixel), view.rect, 0);
    return tiles.every((ref) => {
      const key = tileKey(ref);
      return this.opaque.has(key) || this.covered.has(key) || this.failed.has(key);
    });
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
    this.failed.add(tileKey(ref));
    this.dirty = true;
    this.options.onTileError?.(ref, error);
  };
}

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
