import type { DecodedLevels } from './decodedLevels';
import {
  levelOf,
  tileContentFrame,
  tileContentRect,
  tileKey,
  tileSourceRect,
  type Pyramid,
  type PyramidLevel,
  type TileRef,
} from './pyramid';
import type { ComposedPart, TileGraphics } from './tileGraphics';
import type { TileStore } from './tileStore';

/**
 * Answers tile and overview requests for an open map: from its decoded levels
 * while a build holds them (a crop), else from the cache (a WebP decode).
 * Tracks requests so they can be cancelled and so the build can wait until
 * none is pending.
 */

export interface MapSource {
  hash: string;
  pyramid: Pyramid;
  complete: boolean;
  levels: DecodedLevels | null;
}

interface PendingRequest {
  handle: number;
  controller: AbortController;
}

/** The coarsest level whose longer side is at least `maxSide`; level 0 when none is. */
export function overviewSourceLevel(pyramid: Pyramid, maxSide: number): PyramidLevel {
  for (let index = pyramid.levels.length - 1; index > 0; index--) {
    const level = pyramid.levels[index]!;
    if (Math.max(level.width, level.height) >= maxSide) return level;
  }
  return pyramid.levels[0]!;
}

export class TileServer {
  private readonly requests = new Map<number, PendingRequest>();
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly store: TileStore,
    private readonly graphics: TileGraphics,
  ) {}

  /** Resolves once no request is pending. */
  idle(): Promise<void> {
    if (this.requests.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** A tile's bitmap, or null when the request was cancelled meanwhile. */
  async tile(id: number, handle: number, source: MapSource, ref: TileRef): Promise<ImageBitmap | null> {
    levelOf(source.pyramid, ref);
    return this.track(id, handle, (signal) => this.tileBitmap(source, ref, signal));
  }

  /** The whole map fit within `maxSide`, from the coarsest level at least that large. */
  async overview(id: number, handle: number, source: MapSource, maxSide: number): Promise<ImageBitmap | null> {
    if (!(maxSide >= 1)) throw new RangeError(`An overview needs a side of at least 1 pixel, got ${maxSide}`);
    return this.track(id, handle, (signal) => this.composeOverview(source, maxSide, signal));
  }

  cancel(id: number): void {
    this.requests.get(id)?.controller.abort();
  }

  cancelHandle(handle: number): void {
    for (const request of this.requests.values()) {
      if (request.handle === handle) request.controller.abort();
    }
  }

  private async track(id: number, handle: number, run: (signal: AbortSignal) => Promise<ImageBitmap | null>): Promise<ImageBitmap | null> {
    const controller = new AbortController();
    this.requests.set(id, { handle, controller });
    try {
      const bitmap = await run(controller.signal);
      if (!controller.signal.aborted) return bitmap;
      bitmap?.close();
      return null;
    } catch (error) {
      if (controller.signal.aborted) return null;
      throw error;
    } finally {
      this.requests.delete(id);
      if (this.requests.size === 0) {
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
    }
  }

  private async tileBitmap(source: MapSource, ref: TileRef, signal: AbortSignal): Promise<ImageBitmap | null> {
    const cropped = await source.levels?.use(ref.level, (level) => this.graphics.crop(level, tileSourceRect(source.pyramid, ref)));
    if (cropped) return cropped;
    if (signal.aborted) return null;
    const bytes = await this.store.getTile(source.hash, ref);
    if (!bytes) throw new Error(`Tile ${tileKey(ref)} of map image ${source.hash} is not in the cache.`);
    if (signal.aborted) return null;
    return this.graphics.decode(bytes);
  }

  private async composeOverview(source: MapSource, maxSide: number, signal: AbortSignal): Promise<ImageBitmap | null> {
    const level = overviewSourceLevel(source.pyramid, maxSide);
    const fit = Math.min(1, maxSide / Math.max(level.width, level.height));
    const width = Math.max(1, Math.round(level.width * fit));
    const height = Math.max(1, Math.round(level.height * fit));
    // A level is never handed out itself: transferring it would take it from the build.
    const direct = await source.levels?.use(level.index, (bitmap) => this.graphics.resize(bitmap, width, height));
    if (direct) return direct;
    const whole = await this.composeLevel(source, level, signal);
    if (!whole || (whole.width === width && whole.height === height)) return whole;
    try {
      return await this.graphics.resize(whole, width, height);
    } finally {
      whole.close();
    }
  }

  /** A level drawn whole from its tiles' content. */
  private async composeLevel(source: MapSource, level: PyramidLevel, signal: AbortSignal): Promise<ImageBitmap | null> {
    const refs: TileRef[] = [];
    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) refs.push({ level: level.index, col, row });
    }
    const settled = await Promise.allSettled(refs.map((ref) => this.tileBitmap(source, ref, signal)));
    const bitmaps = settled.map((result) => (result.status === 'fulfilled' ? result.value : null));
    try {
      const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (signal.aborted || bitmaps.some((bitmap) => !bitmap)) return null;
      const parts: ComposedPart[] = refs.map((ref, index) => ({
        source: bitmaps[index]!,
        from: tileContentFrame(source.pyramid, ref),
        to: tileContentRect(source.pyramid, ref),
      }));
      return this.graphics.compose(level.width, level.height, parts);
    } finally {
      for (const bitmap of bitmaps) bitmap?.close();
    }
  }
}
