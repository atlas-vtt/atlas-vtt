import { Container, Rectangle, type Texture } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { MapAlbedo } from './mapAlbedo';
import { MapImageLayer, viewportCamera, type CameraSource } from './MapImageLayer';
import { decoderTiles, placeholderTiles, type MapTiles } from './mapImageTiles';
import type { MapImageDeps, MapImageSource } from './mapImageTypes';
import type { MapImageChange } from './mapImageView';
import type { TileView } from './levelOfDetail';
import type { PixelRect } from './pyramid';
import { isMapClosed } from './tileErrors';
import { ResidentOverviews } from './residentOverviews';
import { TileTextureCache } from './tileTextureCache';
import { NO_STRETCH, sameStretch, type MapStretch } from '../../grid/mapStretch';

/**
 * The one owner of a view's map image (decisions 1, 12 and 13 of the tiled map images plan): it
 * loads the image, draws it from its tile pyramid in `layer`, and answers every question about
 * it: its world rect, its pixels (`overview`), the lighting's albedo, and whether a view of it is
 * drawn in full detail. World units are the image's natural pixels, its top left corner at (0, 0),
 * unless the grid's alignment stretches the image (`MapStretch`): then the image is drawn that many
 * times wider or taller, `worldRect` is its stretched size, and everything the tile layer is asked
 * (views, regions) is brought back into the image's own pixels here, so the layer never knows.
 */

/** The viewport's world is never smaller than this a side, so a small map can still be panned around. */
const MIN_WORLD_SIDE = 10000;

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
  private readonly resident: ResidentOverviews;
  private shown: Shown | null = null;
  /** The source of what is shown, and the load that showed it. */
  private loaded: { source: MapImageSource; generation: number } | null = null;
  private generation = 0;
  private destroyed = false;
  private stretch: MapStretch = NO_STRETCH;
  private readonly stopRestarts: () => void;

  constructor(private readonly deps: MapImageDeps) {
    this.layer = new Container({ label: 'map-image', eventMode: 'none', interactiveChildren: false });
    this.layer.boundsArea = new Rectangle(0, 0, 0, 0);
    this.cache = new TileTextureCache({ ticker: deps.ticker, renderer: deps.renderer, requestRender: deps.requestRender });
    this.resident = new ResidentOverviews(this.cache);
    const camera = viewportCamera(deps.viewport, deps.renderer ?? { resolution: 1 });
    this.camera = (): TileView | null => {
      const view = camera();
      return view && this.onImage(view);
    };
    this.albedo = new MapAlbedo(() => this.emit('albedo'));
    this.stopRestarts = deps.service.onRestart(() => this.reopen());
  }

  /** The image in world units, as it is drawn; null before the first load and after `clear`. */
  get worldRect(): PixelRect | null {
    return this.shown ? { x: 0, y: 0, width: this.shown.width * this.stretch.x, height: this.shown.height * this.stretch.y } : null;
  }

  /** The image's own size in pixels, whatever its stretch; null before the first load and after `clear`. */
  get imageSize(): { width: number; height: number } | null {
    return this.shown ? { width: this.shown.width, height: this.shown.height } : null;
  }

  /** How the image is drawn stretched. */
  get mapStretch(): MapStretch {
    return this.stretch;
  }

  /**
   * Shows `source`, once its pyramid is open (not its tiles: see `whenReady`). An image that cannot
   * be shown is reported and the placeholder shows instead. A load overtaken by a later one is dropped.
   * The image appears with `stretch`; without one it keeps the stretch of the image before it.
   */
  async load(source: MapImageSource, stretch?: MapStretch): Promise<void> {
    return this.loadAs(source, false, stretch);
  }

  /** Draws the shown image, and every one after it, with `stretch`: `worldRect` changes, which listeners hear as another image. */
  setStretch(stretch: MapStretch): void {
    if (this.destroyed || sameStretch(stretch, this.stretch)) return;
    this.stretch = stretch;
    if (!this.shown) return;
    this.place(this.shown);
    this.deps.requestRender();
    this.emit('image');
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

  /** The whole image fit within `maxSide` pixels (never read from a GPU texture); null without an image, also once it is closed meanwhile. */
  overview(maxSide: number): Promise<ImageBitmap | null> {
    const pending = this.shown?.tiles?.overview(maxSide);
    return pending ? pending.catch(nullWhenClosed) : Promise.resolve(null);
  }

  /** A mipmapped texture of the overview for the lighting; null until it is made, then `onChange('albedo')`. */
  albedoTexture(): Texture | null {
    const tiles = this.shown?.tiles;
    return tiles ? this.albedo.textureOf(tiles) : null;
  }

  /** Resolves once `rect` is drawn at the detail `worldPerScreenPixel` asks for, or after `timeoutMs`. */
  whenReady(rect: PixelRect, worldPerScreenPixel: number, timeoutMs: number): Promise<void> {
    return this.shown?.layer?.whenReady(this.onImage({ rect, worldPerScreenPixel }), timeoutMs) ?? Promise.resolve();
  }

  /** `whenReady` for what the view's own camera shows now. */
  whenCameraReady(timeoutMs: number): Promise<void> {
    const view = this.camera();
    if (!view) return Promise.resolve();
    return this.shown?.layer?.whenReady(view, timeoutMs) ?? Promise.resolve();
  }

  /**
   * Shows what `view` (another camera's, a thumbnail's) draws instead of the view's own camera,
   * until the returned function puts that back: for one render of another picture.
   */
  drawFor(view: TileView): () => void {
    return this.shown?.layer?.drawFor(this.onImage(view)) ?? noop;
  }

  /** Keeps the tiles another camera needs (the player window's) loaded for its own picture (`drawFor`); returns the function that ends it. */
  addDemandRegion(view: TileView): () => void {
    const region: TileView = { rect: { ...view.rect }, worldPerScreenPixel: view.worldPerScreenPixel };
    this.regions.set(region, this.shown?.layer?.addDemandRegion(this.onImage(region)) ?? noop);
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
    this.stopRestarts();
    this.generation++;
    const previous = this.shown;
    this.shown = null;
    previous?.layer?.destroy();
    previous?.tiles?.close();
    this.resident.clear();
    this.regions.clear();
    this.albedo.reset();
    this.cache.destroy();
    destroyTree(this.layer);
    this.listeners.clear();
  }

  /** `replace`: shows the open even when it is the pyramid shown now, as after the tile worker restarted. */
  private async loadAs(source: MapImageSource, replace: boolean, stretch?: MapStretch): Promise<void> {
    if (this.destroyed) return;
    const generation = ++this.generation;
    const next = await this.open(source);
    if (generation !== this.generation || this.destroyed) {
      next.tiles?.close();
      return;
    }
    this.loaded = { source, generation };
    if (stretch) this.stretch = stretch;
    this.show(next, replace);
  }

  /**
   * The tile worker restarted and the shown map's handle went with it: opens it again in a new
   * layer, which asks again for the tiles that failed meanwhile (textures it holds stay cached).
   * A load under way opens in the new worker by itself.
   */
  private reopen(): void {
    const loaded = this.loaded;
    if (this.destroyed || !loaded || loaded.generation !== this.generation || !this.shown?.tiles?.cacheable) return;
    void this.loadAs(loaded.source, true);
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

  private show(next: Opened, replace: boolean): void {
    const previous = this.shown;
    const samePyramid = previous?.tiles && next.tiles && previous.tiles.source.key === next.tiles.source.key;
    // The same pyramid again (another scene on it, a renamed file): what is drawn stays, the second open goes.
    if (samePyramid && !replace) {
      next.tiles?.close();
      if (previous) this.place(previous);
      this.emit('image');
      return;
    }
    let layer: MapImageLayer | null = null;
    if (next.tiles) {
      this.resident.release(next.tiles.source.key);
      layer = new MapImageLayer({
        source: next.tiles.source,
        cache: this.cache,
        ticker: this.deps.ticker,
        requestRender: this.deps.requestRender,
        camera: this.camera,
        picture: this.deps.picture ?? null,
        ...(this.deps.drawAtOnce && { drawAtOnce: this.deps.drawAtOnce }),
        onTileError: onceLogged(),
      });
      this.layer.addChild(layer.container);
    }
    this.shown = { ...next, layer };
    if (samePyramid) {
      // Reopened: its textures stay for the new layer, its resident slot stays free.
      previous?.layer?.destroy({ keepTextures: true });
      previous?.tiles?.close();
    } else {
      this.retire(previous);
    }
    this.place(this.shown);
    this.albedo.reset();
    this.deps.requestRender();
    this.emit('image');
  }

  /** Puts `shown` into the world with the stretch: the layer's scale, the world's size, and the demand regions, which the tile layer knows in image pixels. */
  private place(shown: Shown): void {
    const { x, y } = this.stretch;
    this.layer.scale.set(x, y);
    // In the layer's own space, which the scale stretches.
    this.layer.boundsArea = new Rectangle(0, 0, shown.width, shown.height);
    this.deps.viewport.worldWidth = Math.max(shown.width * x, MIN_WORLD_SIDE);
    this.deps.viewport.worldHeight = Math.max(shown.height * y, MIN_WORLD_SIDE);
    for (const [region, release] of this.regions) {
      release();
      this.regions.set(region, shown.layer?.addDemandRegion(this.onImage(region)) ?? noop);
    }
  }

  /** A view of the world as the tile layer sees it: in the image's own pixels, at the finer of the two axes' detail. */
  private onImage(view: TileView): TileView {
    const { x, y } = this.stretch;
    if (x === 1 && y === 1) return view;
    const { rect } = view;
    return {
      rect: { x: rect.x / x, y: rect.y / y, width: rect.width / x, height: rect.height / y },
      worldPerScreenPixel: view.worldPerScreenPixel / Math.max(x, y),
    };
  }

  /** Ends what `shown` drew; a cached pyramid's overview stays resident for the next few maps. */
  private retire(shown: Shown | null): void {
    if (!shown) return;
    const cacheable = shown.tiles?.cacheable ?? false;
    if (shown.tiles && cacheable) {
      this.resident.keep(shown.tiles.source);
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

/** A map closed while its overview was read (another scene, a restarted worker) has no image: null. */
function nullWhenClosed(error: unknown): null {
  if (isMapClosed(error)) return null;
  throw error;
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
