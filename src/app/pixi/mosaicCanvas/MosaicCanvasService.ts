import { type App, type TFile } from 'obsidian';
import { t } from '../../i18n';
import { describeError } from '../../utils/errors';
import { unsupportedMessage } from '../../imageProcessing/band/unsupportedMessage';
import { decodeImageOnMainThread, requiredMainThreadDecode } from './mainThreadDecode';
import { TesseraDecoderClient, TesseraOpenError, type OpenedMap } from './TesseraDecoderClient';
import { OVERVIEW_MAX_SIDE, type PixelRect, type TesseraRef } from './pyramid';
import { OPEN_ALPHA_BYTE, type ArtAlpha, type LevelArt } from '../../levels/artRaster';
import type { RoofPieces } from '../../levels/roofs';
import { RecentReads } from './recentReads';
import { showNotice } from '../../ui/notice';
import type { MapVideoProblem } from './video/MapVideoSlot';

/**
 * Per app: the map tessera worker every view opens its map images through, and
 * the notices for images that cannot be shown and animated maps that cannot play
 * (one per file and session).
 */
export class MosaicCanvasService {
  private static readonly instances = new WeakMap<App, MosaicCanvasService>();

  static forApp(app: App): MosaicCanvasService {
    let service = MosaicCanvasService.instances.get(app);
    if (!service) {
      service = new MosaicCanvasService(app, TesseraDecoderClient.forApp(app));
      MosaicCanvasService.instances.set(app, service);
    }
    return service;
  }

  /** Forgets which images were reported; the worker itself is released with `TesseraDecoderClient.release`. */
  static release(app: App): void {
    MosaicCanvasService.instances.delete(app);
  }

  private readonly reported = new Set<string>();
  private readonly alphas = new RecentReads<ArtAlpha>();
  private readonly roofs = new RecentReads<RoofPieces>();
  private readonly reportedVideos = new Set<string>();

  constructor(private readonly app: App, readonly client: TesseraDecoderClient) {}

  /**
   * Opens a vault image's tessera pyramid. Bytes are read through the vault, and only when the cache
   * cannot serve the map by the file's path, size and time. SVG, which a worker cannot decode, and
   * any image the worker fails to decode are decoded on this thread at the size an `<img>` gives
   * them, the size such a map has always had; the worker builds its pyramid from that bitmap. A
   * video's pyramid is its poster's, taken here once and then cached like any map's.
   * Rejects with `TesseraOpenError` (or a decode error) when the image cannot be shown.
   */
  async open(file: TFile): Promise<OpenedMap> {
    const identity = { path: file.path, size: file.stat.size, mtime: file.stat.mtime };
    const read = (): Promise<ArrayBuffer> => this.app.vault.readBinary(file);
    const required = requiredMainThreadDecode(file);
    if (required) return this.client.open(read, identity, required);
    const decode = (bytes: ArrayBuffer): Promise<ImageBitmap> => decodeImageOnMainThread(bytes, file.extension);
    try {
      return await this.client.open(read, identity);
    } catch (error) {
      if (!(error instanceof TesseraOpenError) || error.failure.kind !== 'decode-failed') throw error;
      return this.client.open(read, identity, decode);
    }
  }

  /**
   * A vault map image as the level stack reads it (`LevelArt`): its size and which pixels of its
   * overview hold art, read in the tessera worker. The art is kept for the last few images by their
   * content, so a level shown again needs only the open. Rejects as `open` does.
   */
  async levelArt(file: TFile): Promise<LevelArt> {
    const opened = await this.open(file);
    try {
      const { width, height } = opened.pyramid;
      return { width, height, alpha: await this.alphas.of(opened.hash, () => this.client.alphaRaster(opened.handle, OVERVIEW_MAX_SIDE, OPEN_ALPHA_BYTE)) };
    } finally {
      this.close(opened.handle);
    }
  }

  /**
   * A vault image as a level's roof: its size and its pieces (`RoofPieces`), worked out in the tessera
   * worker over its overview, kept for the last few images by their content. Rejects as `open` does.
   */
  async roofPieces(file: TFile): Promise<{ width: number; height: number; pieces: RoofPieces }> {
    const opened = await this.open(file);
    try {
      const { width, height } = opened.pyramid;
      return { width, height, pieces: await this.roofs.of(opened.hash, () => this.client.roofPieces(opened.handle, OVERVIEW_MAX_SIDE)) };
    } finally {
      this.close(opened.handle);
    }
  }

  tessera(handle: number, ref: TesseraRef, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.client.tessera(handle, ref, signal);
  }

  overview(handle: number, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.client.overview(handle, maxSide, signal);
  }

  /** A part of the map fit within `maxSide` (`TesseraDecoderClient.window`). */
  window(handle: number, rect: PixelRect, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.client.window(handle, rect, maxSide, signal);
  }

  close(handle: number): void {
    this.client.close(handle);
  }

  /** Called when the tessera worker stopped and took the open maps along; each must be opened again. */
  onRestart(listener: () => void): () => void {
    return this.client.onRestart(listener);
  }

  /** Tells the GM once per file and session that its animated map shows its first frame only, and why. */
  reportVideoStill(file: TFile, problem: MapVideoProblem): void {
    console.warn(`[Atlas] The animated map ${file.path} shows its first frame only:`, problem);
    if (this.reportedVideos.has(file.path)) return;
    this.reportedVideos.add(file.path);
    showNotice(stillReasonOf(file, problem), 0);
  }

  /** Tells the GM once per file and session that its image cannot be shown, and why. */
  reportUnshown(file: TFile, error: unknown): void {
    console.error(`[Atlas] The map image ${file.path} cannot be shown:`, error);
    if (this.reported.has(file.path)) return;
    this.reported.add(file.path);
    showNotice(t('map.imageUnshown', { file: file.path, reason: reasonOf(error) }), 0);
  }
}

function stillReasonOf(file: TFile, problem: MapVideoProblem): string {
  if (problem.kind === 'too-large') {
    const { width, height, maxSide } = problem;
    return t('map.videoTooLarge', { file: file.path, width, height, side: maxSide });
  }
  return t('map.videoUnplayable', { file: file.path, reason: describeError(problem.error) });
}

function reasonOf(error: unknown): string {
  if (error instanceof TesseraOpenError && error.failure.kind === 'too-large') {
    const { width, height, maxPixels, maxSide } = error.failure;
    return t('image.tooLarge', { width, height, megapixels: Math.floor(maxPixels / 1e6), side: maxSide });
  }
  if (error instanceof TesseraOpenError && error.failure.kind === 'unsupported') {
    const { width, height, reason } = error.failure;
    return unsupportedMessage(width, height, reason);
  }
  return describeError(error);
}
