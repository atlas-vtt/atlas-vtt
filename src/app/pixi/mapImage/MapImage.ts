import { Container, Rectangle, type Texture, type Ticker } from 'pixi.js';
import type { TFile } from 'obsidian';
import { destroyTree } from '../utils/destroyTree';
import { MapAlbedo } from './mapAlbedo';
import { MapImageLayer, viewportCamera, type CameraSource } from './MapImageLayer';
import { decoderTiles, placeholderTiles, type MapTiles, type TileReader } from './mapImageTiles';
import { visibleTiles, type TileView } from './levelOfDetail';
import type { PixelRect } from './pyramid';
import type { OpenedMap } from './TileDecoderClient';
import { TileTextureCache, tileTextureKey, type TileUploader } from './tileTextureCache';
import type { TileSource } from './tileRequests';

/**
 * The one owner of a view's map image (decisions 1, 12 and 13 of the tiled map images plan): it
 * loads the image, draws it from its tile pyramid in `layer`, and answers every question about
 * it: its world rect, its pixels (`overview`), the lighting's albedo, and whether a view of it is
 * drawn in full detail. World units are the image's natural pixels, its top left corner at (0, 0).
 */

/** What a scene shows under its tokens: a vault image, the missing-image placeholder, or nothing of a given size. */
export type MapImageSource =
  | { kind: 'file'; file: TFile }
  | { kind: 'placeholder' }
  | { kind: 'none'; width: number; height: number };

/** `image`: another image (or none) is shown, its world rect may differ; `albedo`: `albedoTexture()` became ready. */
export type MapImageChange = 'image' | 'albedo';

/** The part of `MapImageService` a map image opens and reads its file through. */
export interface MapImageOpener extends TileReader {
  open(file: TFile): Promise<OpenedMap>;
  reportUnshown(file: TFile, error: unknown): void;
}

/** The part of a pixi-viewport a map image reads its camera from and sets the world size of. */
export interface MapImageViewport {
  left: number;
  top: number;
  worldScreenWidth: number;
  worldScreenHeight: number;
  scale: { x: number };
  worldWidth: number;
  worldHeight: number;
}

export interface MapImageDeps {
  service: MapImageOpener;
  viewport: MapImageViewport;
  /** Runs the tile layer's updates and the texture uploads, once per frame. */
  ticker: Ticker;
  /** The renderer that draws the tiles; null uploads nothing ahead. */
  renderer: (TileUploader & { resolution: number }) | null;
  requestRender: () => void;
  reducedMotion?: () => boolean;
}

/** The viewport's world is never smaller than this a side, so a small map can still be panned around. */
const MIN_WORLD_SIDE = 10000;
/** Maps left whose overview tiles stay on the GPU, so switching back to one shows it at once. */
export const RESIDENT_MAPS = 3;

interface Opened {
  tiles: MapTiles | null;
  width: number;
  height: number;
}

interface Shown extends Opened {
  layer: MapImageLayer | null;
}

export class MapImage {
  /** Added to the viewport at index 0; its `boundsArea` is the world rect. */
  readonly layer: Container;
  private readonly cache: TileTextureCache;
  private readonly camera: CameraSource;
  private readonly albedo: MapAlbedo;
  private readonly listeners = new Set<(change: MapImageChange) => void>();
  /** Demand regions, each with the function that ends it on the layer shown now. */
  private readonly regions = new Map<TileView, () => void>();
  /** Pyramids of maps left most recently first, whose overview tiles are pinned in the cache. */
  private resident: TileSource[] = [];
  private shown: Shown | null = null;
  private generation = 0;
  private destroyed = false;

  constructor(private readonly deps: MapImageDeps) {
    this.layer = new Container({ label: 'map-image', eventMode: 'none', interactiveChildren: false });
    this.layer.boundsArea = new Rectangle(0, 0, 0, 0);
    this.cache = new TileTextureCache({ ticker: deps.ticker, renderer: deps.renderer, requestRender: deps.requestRender });
    this.camera = viewportCamera(deps.viewport, deps.renderer ?? { resolution: 1 });
    this.albedo = new MapAlbedo(() => this.emit('albedo'));
  }

  /** The image in world units; null before the first load and after `clear`. */
  get worldRect(): PixelRect | null {
    return this.shown ? { x: 0, y: 0, width: this.shown.width, height: this.shown.height } : null;
  }

  /**
   * Shows `source`, once its pyramid is open (not its tiles: see `whenReady`). An image that cannot
   * be shown is reported and the placeholder shows instead. A load overtaken by a later one is dropped.
   */
  async load(source: MapImageSource): Promise<void> {
    if (this.destroyed) return;
    const generation = ++this.generation;
    const next = await this.open(source);
    if (generation !== this.generation || this.destroyed) {
      next.tiles?.close();
      return;
    }
    this.show(next);
  }

  /** Takes the image off, as when its scene could not be opened; `worldRect` is null until the next load. */
  clear(): void {
    if (this.destroyed) return;
    this.generation++;
    const previous = this.shown;
    this.shown = null;
    this.retire(previous);
    this.layer.boundsArea = new Rectangle(0, 0, 0, 0);
    this.albedo.reset();
    this.deps.requestRender();
    this.emit('image');
  }

  /** The whole image fit within `maxSide` pixels (never read from a GPU texture); null without an image. */
  overview(maxSide: number): Promise<ImageBitmap | null> {
    return this.shown?.tiles?.overview(maxSide) ?? Promise.resolve(null);
  }

  /** A mipmapped texture of the overview for the lighting; null until it is made, then `onChange('albedo')`. */
  albedoTexture(): Texture | null {
    const tiles = this.shown?.tiles;
    return tiles ? this.albedo.textureOf(tiles) : null;
  }

  /** Resolves once `rect` is drawn at the detail `worldPerScreenPixel` asks for, or after `timeoutMs`. */
  whenReady(rect: PixelRect, worldPerScreenPixel: number, timeoutMs: number): Promise<void> {
    return this.shown?.layer?.whenReady({ rect, worldPerScreenPixel }, timeoutMs) ?? Promise.resolve();
  }

  /** `whenReady` for what the view's own camera shows now. */
  whenCameraReady(timeoutMs: number): Promise<void> {
    const view = this.camera();
    return view ? this.whenReady(view.rect, view.worldPerScreenPixel, timeoutMs) : Promise.resolve();
  }

  /** Keeps the tiles another camera needs (the player window's) loaded and drawn; returns the function that ends it. */
  addDemandRegion(view: TileView): () => void {
    const region: TileView = { rect: { ...view.rect }, worldPerScreenPixel: view.worldPerScreenPixel };
    this.regions.set(region, this.shown?.layer?.addDemandRegion(region) ?? noop);
    return (): void => {
      const release = this.regions.get(region);
      this.regions.delete(region);
      release?.();
    };
  }

  onChange(listener: (change: MapImageChange) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation++;
    const previous = this.shown;
    this.shown = null;
    previous?.layer?.destroy();
    previous?.tiles?.close();
    this.resident = [];
    this.regions.clear();
    this.albedo.reset();
    this.cache.destroy();
    destroyTree(this.layer);
    this.listeners.clear();
  }

  private async open(source: MapImageSource): Promise<Opened> {
    if (source.kind === 'none') return { tiles: null, width: source.width, height: source.height };
    if (source.kind === 'file') {
      try {
        const opened = await this.deps.service.open(source.file);
        return { tiles: decoderTiles(this.deps.service, opened), width: opened.pyramid.width, height: opened.pyramid.height };
      } catch (error) {
        this.deps.service.reportUnshown(source.file, error);
      }
    }
    const tiles = placeholderTiles();
    return { tiles, width: tiles.source.pyramid.width, height: tiles.source.pyramid.height };
  }

  private show(next: Opened): void {
    const previous = this.shown;
    // The same pyramid again (another scene on it, a renamed file): what is drawn stays, the second open goes.
    if (previous?.tiles && next.tiles && previous.tiles.source.key === next.tiles.source.key) {
      next.tiles.close();
      this.emit('image');
      return;
    }
    let layer: MapImageLayer | null = null;
    if (next.tiles) {
      this.resident = this.resident.filter(source => source.key !== next.tiles!.source.key);
      layer = new MapImageLayer({
        source: next.tiles.source,
        cache: this.cache,
        ticker: this.deps.ticker,
        requestRender: this.deps.requestRender,
        camera: this.camera,
        ...(this.deps.reducedMotion && { reducedMotion: this.deps.reducedMotion }),
        onTileError: onceLogged(),
      });
      this.layer.addChild(layer.container);
    }
    this.shown = { ...next, layer };
    this.retire(previous);
    for (const region of this.regions.keys()) this.regions.set(region, layer?.addDemandRegion(region) ?? noop);
    this.layer.boundsArea = new Rectangle(0, 0, next.width, next.height);
    this.deps.viewport.worldWidth = Math.max(next.width, MIN_WORLD_SIDE);
    this.deps.viewport.worldHeight = Math.max(next.height, MIN_WORLD_SIDE);
    this.albedo.reset();
    this.deps.requestRender();
    this.emit('image');
  }

  /** Ends what `shown` drew; a cached pyramid's overview stays resident for the next few maps. */
  private retire(shown: Shown | null): void {
    if (!shown) return;
    const cacheable = shown.tiles?.cacheable ?? false;
    if (shown.tiles && cacheable) {
      const { source } = shown.tiles;
      this.resident = [source, ...this.resident.filter(other => other.key !== source.key)];
      for (const dropped of this.resident.splice(RESIDENT_MAPS)) this.cache.deletePyramid(dropped.key);
      // Pinned before the layer lets go of them, so the budget cannot take them in between.
      this.cache.pin(this, this.resident.flatMap(overviewKeys));
    }
    shown.layer?.destroy({ keepTextures: cacheable });
    shown.tiles?.close();
  }

  private emit(change: MapImageChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('[MapImage] A listener failed:', error);
      }
    }
  }
}

function noop(): void {}

/** The texture keys of a pyramid's overview tiles. */
function overviewKeys({ key, pyramid }: TileSource): string[] {
  const whole = { x: 0, y: 0, width: pyramid.width, height: pyramid.height };
  return visibleTiles(pyramid, pyramid.overview, whole, 0).map(ref => tileTextureKey(key, ref));
}

/** Logs the first tile a layer could not get; the layer asks for none of them again. */
function onceLogged(): (ref: unknown, error: unknown) => void {
  let logged = false;
  return (_ref, error) => {
    if (logged) return;
    logged = true;
    console.warn('[MapImage] A map tile could not be loaded:', error);
  };
}
