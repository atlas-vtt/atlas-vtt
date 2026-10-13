import { Texture, Graphics, type CanvasSource, type ImageSource, type Application } from 'pixi.js';
import { App as ObsidianApp, TFile } from 'obsidian';
import type { ITextureCache } from './types';
import { normalizeImagePath } from '../../utils/pathUtils';
import { loadAsset, unloadAsset } from '../utils/assetLifecycle';
import { decodeImage, decodedSource, imageMimeType, type DecodedImage } from '../decodedImage';

/**
 * Longest edge of a token texture. Tokens render at roughly one grid cell, so
 * detail beyond this is never visible and only costs GPU memory and upload time.
 */
const MAX_TOKEN_TEXTURE_SIZE = 1024;
/** Cache key of the placeholder used for tokens without art. */
const DEFAULT_TOKEN_TEXTURE_KEY = 'default-token';

/** Image paths PIXI's `Assets` loads by URL instead of reading them from the vault. */
const URL_PREFIXES = ['data:', 'blob:', 'http://', 'https://', 'app://'];

/**
 * Token art, decoded once per image and shared by every token that shows it.
 *
 * Every user holds the art it shows: `acquire` takes a hold, `release` drops it. Only
 * `evictUnused` destroys art, and never art that is held, so neither a token on the
 * map nor one still loading can end up with a destroyed texture.
 */
export class TextureCache implements ITextureCache {
  private readonly textures = new Map<string, Texture>();
  private readonly holds = new Map<string, number>();
  // Textures loaded through Assets are owned by its cache and must be unloaded by URL
  private readonly assetUrlByKey = new Map<string, string>();
  // Decoded bitmaps backing vault-loaded textures, closed on eviction
  private readonly bitmapByKey = new Map<string, ImageBitmap>();
  /** Latest reload started per art path; only it may replace the texture. */
  private readonly reloadGenerations = new Map<string, number>();
  private pixiApp: Application | null = null;

  constructor(private readonly obsApp: ObsidianApp) {}

  setPixiApp(app: Application): void {
    this.pixiApp = app;
  }

  acquire(imagePath: string): Promise<Texture> {
    if (!imagePath) return Promise.resolve(this.getDefaultTokenTexture());
    const key = normalizeImagePath(imagePath);
    // Held from the start, so art that finishes loading after an eviction pass is still held
    this.holds.set(key, (this.holds.get(key) ?? 0) + 1);
    return this.load(key);
  }

  release(imagePath: string): void {
    if (!imagePath) return;
    const key = normalizeImagePath(imagePath);
    const holds = (this.holds.get(key) ?? 0) - 1;
    if (holds > 0) this.holds.set(key, holds);
    else this.holds.delete(key);
  }

  evictUnused(keepImagePaths: Iterable<string>): void {
    const keep = new Set([DEFAULT_TOKEN_TEXTURE_KEY]);
    for (const path of keepImagePaths) if (path) keep.add(normalizeImagePath(path));
    for (const key of Array.from(this.textures.keys())) {
      if (!keep.has(key) && !this.holds.has(key)) this.destroyTexture(key);
    }
  }

  destroyAll(): void {
    for (const key of Array.from(this.textures.keys())) this.destroyTexture(key);
    this.holds.clear();
  }

  private async load(key: string): Promise<Texture> {
    const cached = this.textures.get(key);
    if (cached) return cached;
    try {
      return URL_PREFIXES.some((prefix) => key.startsWith(prefix))
        ? await this.loadUrl(key)
        : await this.loadVaultImage(key);
    } catch (error) {
      console.error(`[TextureCache] Failed to load texture: ${key}`, error);
      return this.getDefaultTokenTexture();
    }
  }

  private async loadUrl(url: string): Promise<Texture> {
    const texture = await loadAsset<Texture>({
      src: url,
      parser: 'texture',
      data: { autoGenerateMipmaps: true, scaleMode: 'linear' },
    });
    this.assetUrlByKey.set(url, url);
    this.textures.set(url, texture);
    return texture;
  }

  private async loadVaultImage(path: string): Promise<Texture> {
    const file = this.obsApp.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      console.error(`[TextureCache] File not found: ${path}`);
      return this.getDefaultTokenTexture();
    }

    const decoded = await this.decodeVaultImage(file);

    // A concurrent call may have finished first; keep the existing texture.
    const existing = this.textures.get(path);
    if (existing) {
      if (decoded instanceof ImageBitmap) decoded.close();
      return existing;
    }

    const texture = new Texture({ source: this.createSource(path, decoded), label: path });
    this.textures.set(path, texture);
    return texture;
  }

  /**
   * Re-reads art whose file changed into a new texture, which `show` puts on every sprite
   * with the old one before that is destroyed. Returns false when the art is not cached
   * from the vault, when a newer change to the same file overtook this one, or when the
   * file cannot be decoded (a half-written file keeps the art it had).
   */
  async reload(imagePath: string, show: (texture: Texture) => void): Promise<boolean> {
    const key = normalizeImagePath(imagePath);
    const previous = this.textures.get(key);
    const file = this.obsApp.vault.getAbstractFileByPath(key);
    if (!previous || this.assetUrlByKey.has(key) || !(file instanceof TFile)) return false;

    const generation = (this.reloadGenerations.get(key) ?? 0) + 1;
    this.reloadGenerations.set(key, generation);
    let decoded: DecodedImage;
    try {
      decoded = await this.decodeVaultImage(file);
    } catch (error) {
      console.warn(`[TextureCache] Could not reload ${key}:`, error);
      return false;
    }
    // A newer reload read the file later, and eviction or a rebuild replaced the texture
    if (this.reloadGenerations.get(key) !== generation || this.textures.get(key) !== previous) {
      if (decoded instanceof ImageBitmap) decoded.close();
      return false;
    }
    this.reloadGenerations.delete(key);
    const previousBitmap = this.bitmapByKey.get(key);
    this.bitmapByKey.delete(key);
    const texture = new Texture({ source: this.createSource(key, decoded), label: key });
    this.textures.set(key, texture);
    show(texture);
    previous.destroy(true);
    previousBitmap?.close();
    return true;
  }

  private async decodeVaultImage(file: TFile): Promise<DecodedImage> {
    return decodeImage(await this.obsApp.vault.readBinary(file), imageMimeType(file.extension), MAX_TOKEN_TEXTURE_SIZE);
  }

  private createSource(path: string, decoded: DecodedImage): ImageSource | CanvasSource {
    if (decoded instanceof ImageBitmap) this.bitmapByKey.set(path, decoded);
    return decodedSource(decoded, { autoGenerateMipmaps: true, scaleMode: 'linear', label: path });
  }

  private destroyTexture(key: string): void {
    const texture = this.textures.get(key);
    if (!texture) return;
    this.textures.delete(key);

    const assetUrl = this.assetUrlByKey.get(key);
    if (assetUrl) {
      this.assetUrlByKey.delete(key);
      // Assets owns this texture; unloading destroys it and its source.
      void unloadAsset(assetUrl);
      return;
    }

    texture.destroy(true);
    const bitmap = this.bitmapByKey.get(key);
    if (bitmap) {
      bitmap.close();
      this.bitmapByKey.delete(key);
    }
  }

  /** A walnut disc for tokens without art, drawn once per renderer. */
  private getDefaultTokenTexture(): Texture {
    const cached = this.textures.get(DEFAULT_TOKEN_TEXTURE_KEY);
    if (cached) return cached;

    if (!this.pixiApp?.renderer) return Texture.EMPTY;

    const size = 100;
    const radius = size / 2;
    const graphics = new Graphics()
      .circle(radius, radius, radius)
      .fill({ color: 0x8B6F47, alpha: 1 })
      .circle(radius, radius, radius * 0.8)
      .fill({ color: 0xA0826D, alpha: 0.5 });
    const texture = this.pixiApp.renderer.generateTexture(graphics);
    graphics.destroy();

    this.textures.set(DEFAULT_TOKEN_TEXTURE_KEY, texture);
    return texture;
  }
}
