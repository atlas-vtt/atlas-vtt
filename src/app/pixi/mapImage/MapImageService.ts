import { Notice, type App, type TFile } from 'obsidian';
import { t } from '../../i18n';
import { describeError } from '../../utils/errors';
import { decodeImage, imageMimeType } from '../decodedImage';
import { TileDecoderClient, TileOpenError, type OpenedMap } from './TileDecoderClient';
import type { TileRef } from './pyramid';

/**
 * Per app: the map tile worker every view opens its map images through, and
 * the notice for images that cannot be shown (one per file and session).
 */
export class MapImageService {
  private static readonly instances = new WeakMap<App, MapImageService>();

  static forApp(app: App): MapImageService {
    let service = MapImageService.instances.get(app);
    if (!service) {
      service = new MapImageService(app, TileDecoderClient.forApp(app));
      MapImageService.instances.set(app, service);
    }
    return service;
  }

  /** Forgets which images were reported; the worker itself is released with `TileDecoderClient.release`. */
  static release(app: App): void {
    MapImageService.instances.delete(app);
  }

  private readonly reported = new Set<string>();

  constructor(private readonly app: App, readonly client: TileDecoderClient) {}

  /**
   * Opens a vault image's tile pyramid. Bytes are read through the vault, and only when the cache
   * cannot serve the map by the file's path, size and time. SVG, which a worker cannot decode, and
   * any image the worker fails to decode are decoded on this thread at the size an `<img>` gives
   * them, the size such a map has always had; the worker builds its pyramid from that bitmap.
   * Rejects with `TileOpenError` (or a decode error) when the image cannot be shown.
   */
  async open(file: TFile): Promise<OpenedMap> {
    const identity = { path: file.path, size: file.stat.size, mtime: file.stat.mtime };
    const read = (): Promise<ArrayBuffer> => this.app.vault.readBinary(file);
    const decode = (bytes: ArrayBuffer): Promise<ImageBitmap> => decodeOnMainThread(bytes, file.extension);
    if (file.extension.toLowerCase() === 'svg') return this.client.open(read, identity, decode);
    try {
      return await this.client.open(read, identity);
    } catch (error) {
      if (!(error instanceof TileOpenError) || error.failure.kind !== 'decode-failed') throw error;
      return this.client.open(read, identity, decode);
    }
  }

  tile(handle: number, ref: TileRef, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.client.tile(handle, ref, signal);
  }

  overview(handle: number, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.client.overview(handle, maxSide, signal);
  }

  close(handle: number): void {
    this.client.close(handle);
  }

  /** Called when the tile worker stopped and took the open maps along; each must be opened again. */
  onRestart(listener: () => void): () => void {
    return this.client.onRestart(listener);
  }

  /** Tells the GM once per file and session that its image cannot be shown, and why. */
  reportUnshown(file: TFile, error: unknown): void {
    console.error(`[Atlas] The map image ${file.path} cannot be shown:`, error);
    if (this.reported.has(file.path)) return;
    this.reported.add(file.path);
    new Notice(t('map.imageUnshown', { file: file.path, reason: reasonOf(error) }), 0);
  }
}

function reasonOf(error: unknown): string {
  if (error instanceof TileOpenError && error.failure.kind === 'too-large') {
    const { width, height, maxPixels, maxSide } = error.failure;
    return t('image.tooLarge', { width, height, megapixels: Math.floor(maxPixels / 1e6), side: maxSide });
  }
  return describeError(error);
}

async function decodeOnMainThread(bytes: ArrayBuffer, extension: string): Promise<ImageBitmap> {
  const image = await decodeImage(bytes, imageMimeType(extension), Infinity);
  return image instanceof ImageBitmap ? image : createImageBitmap(image);
}
