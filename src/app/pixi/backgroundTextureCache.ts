import type { Texture } from 'pixi.js';
import { destroyVaultTexture } from './vaultImageTexture';

/** Idle backgrounds kept for quick scene switches, in addition to the ones on screen. */
const MAX_IDLE_ENTRIES = 3;
/** Decoded pixel budget for idle backgrounds. The most recently left one is always kept. */
const MAX_IDLE_BYTES = 256 * 1024 * 1024;
/** Mipmaps add a third to a texture's memory, so only smaller maps get them. */
const MIPMAP_SIZE_THRESHOLD = 2048;
const MAX_RECOMMENDED_TEXTURE_SIZE = 8192;

interface CacheEntry {
  texture: Promise<Texture>;
  refs: number;
  bytes: number;
  lastUsed: number;
}

function configureBackgroundTexture(texture: Texture): void {
  const { source } = texture;
  source.scaleMode = 'linear';
  source.autoGenerateMipmaps = texture.width <= MIPMAP_SIZE_THRESHOLD && texture.height <= MIPMAP_SIZE_THRESHOLD;
  source.update();
  if (texture.width > MAX_RECOMMENDED_TEXTURE_SIZE || texture.height > MAX_RECOMMENDED_TEXTURE_SIZE) {
    console.warn(`[BackgroundTextureCache] Texture size (${texture.width}x${texture.height}) exceeds the recommended maximum of ${MAX_RECOMMENDED_TEXTURE_SIZE}px. Consider resizing the map for better performance.`);
  }
}

function estimateBytes(texture: Texture): number {
  const { pixelWidth, pixelHeight, autoGenerateMipmaps } = texture.source;
  return pixelWidth * pixelHeight * 4 * (autoGenerateMipmaps ? 4 / 3 : 1);
}

/**
 * Reference-counted cache for map background textures, shared by every map view,
 * so that views of one map decode its image once. A background is held under its
 * image's resource URL, which changes with the file.
 *
 * Backgrounds that no view shows any more stay decoded in a small LRU, so switching
 * back to a recent scene skips decoding and only re-uploads to the GPU; PIXI's
 * texture GC already frees the GPU copy of an idle texture. Idle entries are kept
 * only while at least one background is in use, so closing the last map frees all.
 */
class BackgroundTextureCache {
  private readonly entries = new Map<string, CacheEntry>();

  /** The texture held for `url`, made by `load` when there is none. Every call must be paired with `release(url)`. */
  acquire(url: string, load: () => Promise<Texture>): Promise<Texture> {
    const entry = this.entries.get(url) ?? this.load(url, load);
    entry.refs++;
    entry.lastUsed = performance.now();
    return entry.texture;
  }

  release(url: string): void {
    const entry = this.entries.get(url);
    if (!entry || entry.refs === 0) return;
    entry.refs--;
    entry.lastUsed = performance.now();
    if (entry.refs === 0) this.trim();
  }

  private evictAllIdle(): void {
    for (const [url, entry] of this.entries) {
      if (entry.refs === 0) this.evict(url);
    }
  }

  private load(url: string, load: () => Promise<Texture>): CacheEntry {
    const entry: CacheEntry = { texture: load(), refs: 0, bytes: 0, lastUsed: 0 };
    entry.texture = entry.texture.then(
      (texture) => {
        configureBackgroundTexture(texture);
        entry.bytes = estimateBytes(texture);
        return texture;
      },
      (error: unknown) => {
        if (this.entries.get(url) === entry) this.entries.delete(url);
        throw error;
      },
    );
    this.entries.set(url, entry);
    return entry;
  }

  private trim(): void {
    const idle = [...this.entries].filter(([, entry]) => entry.refs === 0);
    if (idle.length === this.entries.size) {
      this.evictAllIdle();
      return;
    }

    idle.sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
    let keptBytes = 0;
    idle.forEach(([url, entry], index) => {
      keptBytes += entry.bytes;
      const overBudget = index >= MAX_IDLE_ENTRIES || (index > 0 && keptBytes > MAX_IDLE_BYTES);
      if (overBudget) this.evict(url);
    });
  }

  private evict(url: string): void {
    const entry = this.entries.get(url);
    this.entries.delete(url);
    // A background still being decoded is destroyed once it has arrived
    void entry?.texture.then(destroyVaultTexture, () => undefined);
  }
}

export const backgroundTextureCache = new BackgroundTextureCache();
