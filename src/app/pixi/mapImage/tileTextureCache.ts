/**
 * The GPU side of map tiles: one texture per tile, kept in a least-recently-used cache within a byte budget.
 * PIXI's texture garbage collection is switched off for these textures: it would unload a retained tile
 * that was not drawn for a while. Uploads are spread over frames, at most `uploadsPerFrame` each.
 */
import { ImageSource, Rectangle, Texture, UPDATE_PRIORITY, type TextureSource, type Ticker } from 'pixi.js';
import { tileKey, type PixelRect, type TileRef } from './pyramid';

/** GPU memory the tile textures of one renderer may take, beyond the pinned ones. */
export const TILE_TEXTURE_BUDGET_BYTES = 160 * 1024 * 1024;
/** Tile textures uploaded per frame at most, so a burst of arrivals never stalls one frame. */
export const TILE_UPLOADS_PER_FRAME = 4;

/** The part of a renderer the cache uses; the Canvas renderer's `initSource` does nothing. */
export interface TileUploader {
  texture: { initSource(source: TextureSource): unknown };
}

export interface TileTextureCacheOptions {
  ticker: Ticker;
  /** The renderer that draws the tiles; null uploads nothing ahead (they upload when first drawn). */
  renderer: TileUploader | null;
  /** Asks for a render once uploaded textures can be drawn (`requestRender(app)`). */
  requestRender: () => void;
  budgetBytes?: number;
  uploadsPerFrame?: number;
}

interface Entry {
  texture: Texture;
  bitmap: ImageBitmap;
  bytes: number;
  ready: boolean;
}

/** A tile texture's key: the pyramid's identity (its source hash) and the tile, "hash/level/col/row". */
export function tileTextureKey(pyramidKey: string, tile: TileRef): string {
  return `${pyramidKey}/${tileKey(tile)}`;
}

export class TileTextureCache {
  /** Map order is recency: the first entry is the least recently used. */
  private readonly entries = new Map<string, Entry>();
  private readonly uploads = new Set<string>();
  private readonly pins = new Map<object, ReadonlySet<string>>();
  private readonly listeners = new Set<(key: string) => void>();
  private readonly budget: number;
  private readonly uploadsPerFrame: number;
  private totalBytes = 0;
  private destroyed = false;

  constructor(private readonly options: TileTextureCacheOptions) {
    this.budget = options.budgetBytes ?? TILE_TEXTURE_BUDGET_BYTES;
    this.uploadsPerFrame = options.uploadsPerFrame ?? TILE_UPLOADS_PER_FRAME;
    options.ticker.add(this.upload, undefined, UPDATE_PRIORITY.NORMAL);
  }

  /** Bytes the cached tiles take, at four per pixel. */
  get bytes(): number {
    return this.totalBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Takes `bitmap` over as the texture of `key`, drawing `frame` of it; the cache closes the bitmap when the
   * texture goes. The texture is ready once uploaded (`isReady`, `onReady`). A key already held keeps its
   * texture and the new bitmap is closed.
   */
  add(key: string, bitmap: ImageBitmap, frame: PixelRect): Texture {
    if (this.destroyed) {
      bitmap.close();
      throw new Error('TileTextureCache: add after destroy');
    }
    const held = this.entries.get(key);
    if (held) {
      bitmap.close();
      return held.texture;
    }
    const source = new ImageSource({ resource: bitmap });
    // ImageSource forces collection on in its constructor; a collected tile would re-upload from a closed bitmap.
    source.autoGarbageCollect = false;
    const texture = new Texture({ source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height) });
    const bytes = bitmap.width * bitmap.height * 4;
    this.entries.set(key, { texture, bitmap, bytes, ready: false });
    this.totalBytes += bytes;
    this.uploads.add(key);
    // Never the tile just added: whoever asked for it pins it once it is drawn.
    this.evict(key);
    return texture;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Whether `key` has a texture that is uploaded and may be drawn. */
  isReady(key: string): boolean {
    return this.entries.get(key)?.ready ?? false;
  }

  /** The texture of `key`, marking it recently used; null when not cached. */
  get(key: string): Texture | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.texture;
  }

  /** Calls `listener` with each key whose texture became ready; returns the function that stops it. */
  onReady(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Replaces the keys `owner` pins: pinned textures (those drawn or kept as fallbacks) are never evicted.
   * Pinned keys count as just used. Evicts what the budget no longer holds.
   */
  pin(owner: object, keys: Iterable<string>): void {
    const pinned = new Set(keys);
    this.pins.set(owner, pinned);
    for (const key of pinned) this.get(key);
    this.evict();
  }

  unpin(owner: object): void {
    if (this.pins.delete(owner)) this.evict();
  }

  /** Destroys the texture of `key` and closes its bitmap, pinned or not. */
  delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.uploads.delete(key);
    this.totalBytes -= entry.bytes;
    entry.texture.destroy(true);
    entry.bitmap.close();
  }

  /** Destroys every texture of the pyramid `pyramidKey` (see `tileTextureKey`), pinned or not. */
  deletePyramid(pyramidKey: string): void {
    const prefix = `${pyramidKey}/`;
    for (const key of [...this.entries.keys()]) if (key.startsWith(prefix)) this.delete(key);
  }

  /** Releases every texture; the cache takes nothing more afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.ticker.remove(this.upload);
    for (const key of [...this.entries.keys()]) this.delete(key);
    this.pins.clear();
    this.listeners.clear();
  }

  private isPinned(key: string): boolean {
    for (const keys of this.pins.values()) if (keys.has(key)) return true;
    return false;
  }

  private evict(spare?: string): void {
    if (this.totalBytes <= this.budget) return;
    for (const key of [...this.entries.keys()]) {
      if (this.totalBytes <= this.budget) return;
      if (key !== spare && !this.isPinned(key)) this.delete(key);
    }
  }

  private readonly upload = (): void => {
    if (this.uploads.size === 0) return;
    const done: string[] = [];
    for (const key of this.uploads) {
      if (done.length >= this.uploadsPerFrame) break;
      done.push(key);
    }
    for (const key of done) {
      this.uploads.delete(key);
      const entry = this.entries.get(key);
      if (!entry) continue;
      try {
        this.options.renderer?.texture.initSource(entry.texture.source);
        entry.ready = true;
      } catch (error) {
        // An error must not reach the ticker, which stops at one; the tile counts as missing again.
        console.warn('[TileTextureCache] A tile texture failed to upload:', error);
        this.delete(key);
      }
    }
    this.options.requestRender();
    for (const key of done) {
      if (!this.isReady(key)) continue;
      for (const listener of this.listeners) listener(key);
    }
  };
}
