import { TFile, type App } from 'obsidian';
import { AssetService, type MapAsset, type TokenAsset } from './AssetService';
import { ensureFolder } from '../plugin/vaultFolders';
import { renderThumbnail, type ThumbnailSpec } from '../imageProcessing/imageProcessing';
import { fnv1a32 } from '../utils/hashing';

export const THUMBNAIL_DIR = 'atlas-vtt/assets/thumbnails';
/** Longer side of a thumbnail; asset cards are about half this size on a 2x display. */
export const THUMBNAIL_SIZE = 256;
export const THUMBNAIL_SPEC: ThumbnailSpec = { size: THUMBNAIL_SIZE, quality: 0.8 };
const MAX_CONCURRENT = 2;
/** Lists hear of finished thumbnails this often while more are being made. */
const ANNOUNCE_DELAY_MS = 200;
/** Thumbnails are recorded on their assets this often while more are being made: every record saves the whole index. */
const RECORD_DELAY_MS = 3000;

export type ThumbnailRenderer = (source: Blob, size: number) => Promise<ArrayBuffer>;
export interface ThumbnailUpdate {
  id: string;
  /** The thumbnail written for the asset; null when none could be made, so its list falls back to the image. */
  thumbnailPath: string | null;
}
type ThumbnailListener = (updates: ThumbnailUpdate[]) => void;
/** What a list shows for an asset's art right now. */
export interface ThumbnailState {
  /** The asset's thumbnail: recorded on it, or made since and not recorded yet. */
  path?: string;
  /** One is being made. Show a placeholder meanwhile, never the full image. */
  pending: boolean;
}
/** Assets whose cards show an image: token art or a map image. */
export type ThumbnailAsset = TokenAsset | MapAsset;

function sourceImagePath(asset: ThumbnailAsset): string {
  return asset.type === 'token' ? asset.imagePath : asset.mapFilePath;
}

/** Short stable digest so thumbnails of same-named images in different folders do not collide. */
function pathDigest(path: string): string {
  return fnv1a32(path).toString(16).padStart(8, '0');
}

/**
 * Small previews of token and map images so lists never decode full-size art
 * (a single map card would otherwise hold a decoded 5000 px image in memory).
 * Thumbnails are written next to the assets and recorded on the asset; assets
 * that lack one (older assets, imported collections) get theirs generated in
 * the background, a few at a time. Lists hear of a thumbnail soon after it was
 * written (`onUpdated`, `stateOf`); it is recorded on its asset in batches,
 * since each record saves the whole index.
 */
export class AssetThumbnailService {
  private static readonly instances = new WeakMap<App, AssetThumbnailService>();
  private readonly listeners = new Set<ThumbnailListener>();
  private readonly queued = new Set<string>();
  private readonly failedImages = new Set<string>();
  /** Thumbnails written this session, by path: usable before their asset records them. */
  private readonly made = new Set<string>();
  private readonly unrecorded = new Map<string, string>();
  private unannounced: ThumbnailUpdate[] = [];
  private queue: ThumbnailAsset[] = [];
  private running = 0;
  private announceTimer: number | null = null;
  private recordTimer: number | null = null;

  static getInstance(app: App, assets: AssetService): AssetThumbnailService {
    let instance = AssetThumbnailService.instances.get(app);
    if (!instance) {
      instance = new AssetThumbnailService(app, assets);
      AssetThumbnailService.instances.set(app, instance);
    }
    return instance;
  }

  constructor(
    private readonly app: App,
    private readonly assets: AssetService,
    private readonly render: ThumbnailRenderer = (source, size) => renderThumbnail(source, { ...THUMBNAIL_SPEC, size }),
  ) {}

  /** Vault path of the thumbnail that belongs to `imagePath`, whether or not it exists yet. */
  thumbnailPathFor(imagePath: string): string {
    const fileName = imagePath.slice(imagePath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'token';
    return `${THUMBNAIL_DIR}/${safeName}-${pathDigest(imagePath)}.webp`;
  }

  hasThumbnail(asset: ThumbnailAsset): boolean {
    return asset.thumbnailPath !== undefined
      && this.app.vault.getAbstractFileByPath(asset.thumbnailPath) instanceof TFile;
  }

  /** Renders and writes the thumbnail of the image at `imagePath`, returning the thumbnail's path. */
  async createForImage(imagePath: string): Promise<string> {
    const image = this.app.vault.getAbstractFileByPath(imagePath);
    if (!(image instanceof TFile)) throw new Error(`Image not found: ${imagePath}`);
    const source = new Blob([await this.app.vault.readBinary(image)]);
    return this.storeForImage(imagePath, await this.render(source, THUMBNAIL_SIZE));
  }

  /** Writes the thumbnail of the image at `imagePath`, returning the thumbnail's path. */
  private async storeForImage(imagePath: string, thumbnail: ArrayBuffer): Promise<string> {
    const thumbnailPath = this.thumbnailPathFor(imagePath);
    await this.writeThumbnail(thumbnailPath, thumbnail);
    return thumbnailPath;
  }

  /**
   * Stores the `thumbnail` rendered along with the image, sparing another
   * decode of it, or renders one from the image when none came with it. A
   * failure is logged and leaves the asset for the background pass.
   */
  async tryThumbnailForImage(imagePath: string, thumbnail: Blob | null): Promise<string | undefined> {
    if (!thumbnail) return this.tryCreateForImage(imagePath);
    try {
      return await this.storeForImage(imagePath, await thumbnail.arrayBuffer());
    } catch (error) {
      console.error('[AssetThumbnailService] Could not store thumbnail for', imagePath, error);
      return undefined;
    }
  }

  /** Moves a thumbnail its asset no longer uses to the trash; a failure is logged and leaves the file. */
  async tryDiscard(thumbnailPath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(thumbnailPath);
    if (!(file instanceof TFile)) return;
    try {
      await this.app.fileManager.trashFile(file);
    } catch (error) {
      console.error('[AssetThumbnailService] Could not remove the old thumbnail', thumbnailPath, error);
    }
  }

  /** Like `createForImage`, but a failure is logged and leaves the asset for the background pass. */
  async tryCreateForImage(imagePath: string): Promise<string | undefined> {
    try {
      return await this.createForImage(imagePath);
    } catch (error) {
      console.error('[AssetThumbnailService] Could not create thumbnail for', imagePath, error);
      return undefined;
    }
  }

  /**
   * The art a list shows for `asset` now. Pending while its thumbnail is being
   * made; an asset whose thumbnail could not be made has neither, and the list
   * falls back to the image itself.
   */
  stateOf(asset: ThumbnailAsset): ThumbnailState {
    if (this.hasThumbnail(asset) && asset.thumbnailPath) return { path: asset.thumbnailPath, pending: false };
    const made = this.thumbnailPathFor(sourceImagePath(asset));
    if (this.made.has(made) && this.app.vault.getAbstractFileByPath(made) instanceof TFile) return { path: made, pending: false };
    return { pending: this.queued.has(asset.id) };
  }

  /** Receives every batch of thumbnails soon after they were written; returns the unsubscribe function. */
  onUpdated(listener: ThumbnailListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Queues thumbnails for every asset in `assets` that has none; already queued or failed images are skipped. */
  ensureThumbnails(assets: readonly ThumbnailAsset[]): void {
    for (const asset of assets) {
      if (this.hasThumbnail(asset) || this.queued.has(asset.id) || this.failedImages.has(sourceImagePath(asset))) continue;
      this.queued.add(asset.id);
      this.queue.push(asset);
    }
    this.pump();
  }

  /** Makes the queued thumbnails of `assetIds` next: the ones on screen, ahead of the rest of the library. */
  prioritize(assetIds: readonly string[]): void {
    const wanted = new Set(assetIds);
    const first = this.queue.filter((asset) => wanted.has(asset.id));
    if (first.length === 0) return;
    this.queue = [...first, ...this.queue.filter((asset) => !wanted.has(asset.id))];
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT && this.queue.length > 0) {
      const asset = this.queue.shift()!;
      this.running += 1;
      void this.generate(asset).finally(() => {
        this.running -= 1;
        this.queued.delete(asset.id);
        this.pump();
      });
    }
    if (this.running === 0 && this.queue.length === 0) {
      // Recorded first, so a list that reloads on the announcement finds the records.
      void this.record();
      this.announce();
    }
  }

  private async generate(asset: ThumbnailAsset): Promise<void> {
    const imagePath = sourceImagePath(asset);
    const thumbnailPath = await this.tryCreateForImage(imagePath);
    this.unannounced.push({ id: asset.id, thumbnailPath: thumbnailPath ?? null });
    this.announceTimer ??= window.setTimeout(() => this.announce(), ANNOUNCE_DELAY_MS);
    if (!thumbnailPath) {
      this.failedImages.add(imagePath);
      return;
    }
    this.made.add(thumbnailPath);
    this.unrecorded.set(asset.id, thumbnailPath);
    this.recordTimer ??= window.setTimeout(() => { void this.record(); }, RECORD_DELAY_MS);
  }

  /** Tells the listeners which thumbnails were written since the last time. */
  private announce(): void {
    if (this.announceTimer !== null) window.clearTimeout(this.announceTimer);
    this.announceTimer = null;
    if (this.unannounced.length === 0) return;
    const updates = this.unannounced;
    this.unannounced = [];
    for (const listener of this.listeners) listener(updates);
  }

  /** Records the generated thumbnails on their assets with a single metadata save. */
  private async record(): Promise<void> {
    if (this.recordTimer !== null) window.clearTimeout(this.recordTimer);
    this.recordTimer = null;
    if (this.unrecorded.size === 0) return;
    const byId = new Map(this.unrecorded);
    this.unrecorded.clear();
    try {
      await this.assets.rewriteAssets((asset) => {
        const thumbnailPath = byId.get(asset.id);
        if ((asset.type !== 'token' && asset.type !== 'map') || !thumbnailPath) return false;
        asset.thumbnailPath = thumbnailPath;
        return true;
      });
    } catch (error) {
      console.error('[AssetThumbnailService] Could not record thumbnails:', error);
    }
  }

  private async writeThumbnail(path: string, content: ArrayBuffer): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, content);
      return;
    }
    await ensureFolder(this.app, THUMBNAIL_DIR);
    await this.app.vault.createBinary(path, content);
  }
}
