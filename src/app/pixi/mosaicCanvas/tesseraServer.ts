import type { DecodedLevels } from './decodedLevels';
import { fitWithin } from '../../imageProcessing/imageLayout';
import {
  levelOf,
  rectAtLevel,
  TESSERA_CONTENT,
  tesseraContentFrame,
  tesseraContentRect,
  tesseraKey,
  tesseraSourceRect,
  windowLevel,
  type PixelRect,
  type Pyramid,
  type PyramidLevel,
  type TesseraRef,
} from './pyramid';
import type { ComposedPart, TesseraGraphics } from './tesseraGraphics';
import type { TesseraStore } from './tesseraStore';

/**
 * Answers tessera and overview requests for an open map: from its decoded levels
 * while a build holds them (a crop), else from the cache (a WebP decode).
 * Tracks requests so they can be cancelled and so the build can wait until
 * none is pending.
 */

export interface MapSource {
  hash: string;
  pyramid: Pyramid;
  complete: boolean;
  levels: DecodedLevels | null;
  /** Set while a band build writes the map: resolves once the tessera is stored, rejects once the build ended without it. */
  whenStored: ((ref: TesseraRef) => Promise<void>) | null;
}

interface PendingRequest {
  handle: number;
  controller: AbortController;
  /** Waits for a band build to write a tessera under way (an overview waits for many at once): not a request the build must let through first. */
  waiting: number;
}

/** A request whose map was closed while it ran; answered with an error so no awaiter hangs. */
export class MapClosedError extends Error {
  constructor(handle: number) {
    super(`The map image with handle ${handle} was closed.`);
  }
}

/** A tessera the cache does not hold: a build that could not write it, a cleared cache. */
export class MissingTesseraError extends Error {}

const CLOSED = Symbol('closed');

/** Resolves once `signal` aborts; never while it does not. */
function aborted(signal: AbortSignal): Promise<undefined> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve(undefined);
    else signal.addEventListener('abort', () => resolve(undefined), { once: true });
  });
}

/** The coarsest level whose longer side is at least `maxSide`; level 0 when none is. */
export function overviewSourceLevel(pyramid: Pyramid, maxSide: number): PyramidLevel {
  for (let index = pyramid.levels.length - 1; index > 0; index--) {
    const level = pyramid.levels[index]!;
    if (Math.max(level.width, level.height) >= maxSide) return level;
  }
  return pyramid.levels[0]!;
}

export class TesseraServer {
  private readonly requests = new Map<number, PendingRequest>();
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly store: TesseraStore,
    private readonly graphics: TesseraGraphics,
  ) {}

  /** Resolves once no request is pending, apart from those waiting for the build itself. */
  idle(): Promise<void> {
    if (this.active() === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private active(): number {
    let count = 0;
    for (const request of this.requests.values()) if (request.waiting === 0) count += 1;
    return count;
  }

  private settleIdle(): void {
    if (this.active() > 0) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  /** A tessera's bitmap, or null when the request was cancelled meanwhile; rejects with `MapClosedError` once its map closes. */
  async tessera(id: number, handle: number, source: MapSource, ref: TesseraRef): Promise<ImageBitmap | null> {
    levelOf(source.pyramid, ref);
    return this.track(id, handle, (signal) => this.tesseraBitmap(id, source, ref, signal));
  }

  /**
   * The whole map fit within `maxSide`, from the coarsest level at least that large, or a coarser
   * one where the cache misses tesserae of it (a build that could not write them all).
   */
  async overview(id: number, handle: number, source: MapSource, maxSide: number): Promise<ImageBitmap | null> {
    if (!(maxSide >= 1)) throw new RangeError(`An overview needs a side of at least 1 pixel, got ${maxSide}`);
    return this.track(id, handle, (signal) => this.composeOverview(id, source, maxSide, signal));
  }

  /**
   * A part of the map, `rect` in the image's pixels, fit within `maxSide`: composed from the tesserae
   * of the finest level that shows it so (`windowLevel`), which a band build still cutting is
   * waited for. Null when cancelled meanwhile; rejects with `MapClosedError` once its map closes.
   */
  async window(id: number, handle: number, source: MapSource, rect: PixelRect, maxSide: number): Promise<ImageBitmap | null> {
    if (!(maxSide >= 1)) throw new RangeError(`A window needs a side of at least 1 pixel, got ${maxSide}`);
    const level = windowLevel(source.pyramid, rect, maxSide);
    const part = rectAtLevel(level, rect);
    if (part.width < 1 || part.height < 1) throw new RangeError(`The window ${JSON.stringify(rect)} lies outside the map`);
    return this.track(id, handle, (signal) => this.composePart(id, source, level, part, signal));
  }

  /** Drops a request: it answers null. */
  cancel(id: number): void {
    this.requests.get(id)?.controller.abort();
  }

  /** Ends the requests of a closed map: they reject with `MapClosedError`. */
  cancelHandle(handle: number): void {
    for (const request of this.requests.values()) {
      if (request.handle === handle) request.controller.abort(CLOSED);
    }
  }

  private async track(id: number, handle: number, run: (signal: AbortSignal) => Promise<ImageBitmap | null>): Promise<ImageBitmap | null> {
    const controller = new AbortController();
    this.requests.set(id, { handle, controller, waiting: 0 });
    const { signal } = controller;
    const whenAborted = (): null => {
      if (signal.reason === CLOSED) throw new MapClosedError(handle);
      return null;
    };
    try {
      const bitmap = await run(signal);
      if (!signal.aborted) return bitmap;
      bitmap?.close();
      return whenAborted();
    } catch (error) {
      if (signal.aborted) return whenAborted();
      throw error;
    } finally {
      this.requests.delete(id);
      this.settleIdle();
    }
  }

  /** Runs `wait` with the request marked as waiting for the build, so the build does not wait for it in turn; an abort ends the wait at once. */
  private async whileWaiting<T>(id: number, wait: () => Promise<T>, signal: AbortSignal): Promise<T | undefined> {
    const request = this.requests.get(id);
    if (request) request.waiting += 1;
    this.settleIdle();
    try {
      return await Promise.race([wait(), aborted(signal)]);
    } finally {
      if (request) request.waiting -= 1;
    }
  }

  private async tesseraBitmap(id: number, source: MapSource, ref: TesseraRef, signal: AbortSignal): Promise<ImageBitmap | null> {
    const cropped = await source.levels?.use(ref.level, (level) => this.graphics.crop(level, tesseraSourceRect(source.pyramid, ref)));
    if (cropped) return cropped;
    if (signal.aborted) return null;
    // A band build writes the map row by row: a tessera it has not reached is waited for, not missing.
    // A build that ended without it rejects; the cache is then asked, which may hold it from an earlier build.
    const { whenStored } = source;
    if (whenStored) await this.whileWaiting(id, () => whenStored(ref), signal).catch(() => undefined);
    if (signal.aborted) return null;
    const bytes = await this.store.getTessera(source.hash, ref);
    if (!bytes) throw new MissingTesseraError(`Tessera ${tesseraKey(ref)} of map image ${source.hash} is not in the cache.`);
    if (signal.aborted) return null;
    return this.graphics.decode(bytes);
  }

  private async composeOverview(id: number, source: MapSource, maxSide: number, signal: AbortSignal): Promise<ImageBitmap | null> {
    const level = overviewSourceLevel(source.pyramid, maxSide);
    // Fit from the full size, not the level's: a level's sides are rounded up, which can shift the shorter side by a pixel.
    const { width, height } = fitWithin(source.pyramid, maxSide, maxSide);
    // A level is never handed out itself: transferring it would take it from the build.
    const direct = await source.levels?.use(level.index, (bitmap) => this.graphics.resize(bitmap, width, height));
    if (direct) return direct;
    const whole = await this.composeCached(id, source, level.index, signal);
    if (!whole || (whole.width === width && whole.height === height)) return whole;
    try {
      return await this.graphics.resize(whole, width, height);
    } finally {
      whole.close();
    }
  }

  /** The level `index` drawn whole from the cache, else the finest coarser level the cache holds whole. */
  private async composeCached(id: number, source: MapSource, index: number, signal: AbortSignal): Promise<ImageBitmap | null> {
    const { levels } = source.pyramid;
    for (let next = index; ; next++) {
      try {
        return await this.composeLevel(id, source, levels[next]!, signal);
      } catch (error) {
        if (!(error instanceof MissingTesseraError) || next === levels.length - 1) throw error;
      }
    }
  }

  /** A level drawn whole from its tesserae' content. */
  private composeLevel(id: number, source: MapSource, level: PyramidLevel, signal: AbortSignal): Promise<ImageBitmap | null> {
    return this.composePart(id, source, level, { x: 0, y: 0, width: level.width, height: level.height }, signal);
  }

  /** `part` of a level (its pixels) drawn from the content of the tesserae that cover it. */
  private async composePart(id: number, source: MapSource, level: PyramidLevel, part: PixelRect, signal: AbortSignal): Promise<ImageBitmap | null> {
    const refs: TesseraRef[] = [];
    const firstCol = Math.floor(part.x / TESSERA_CONTENT);
    const lastCol = Math.min(level.cols - 1, Math.floor((part.x + part.width - 1) / TESSERA_CONTENT));
    const firstRow = Math.floor(part.y / TESSERA_CONTENT);
    const lastRow = Math.min(level.rows - 1, Math.floor((part.y + part.height - 1) / TESSERA_CONTENT));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) refs.push({ level: level.index, col, row });
    }
    const settled = await Promise.allSettled(refs.map((ref) => this.tesseraBitmap(id, source, ref, signal)));
    const bitmaps = settled.map((result) => (result.status === 'fulfilled' ? result.value : null));
    try {
      const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (signal.aborted || bitmaps.some((bitmap) => !bitmap)) return null;
      // Each tessera's content, clipped to the part, drawn where it lies within the part.
      const parts: ComposedPart[] = [];
      refs.forEach((ref, index) => {
        const frame = tesseraContentFrame(source.pyramid, ref);
        const content = tesseraContentRect(source.pyramid, ref);
        const x = Math.max(content.x, part.x);
        const y = Math.max(content.y, part.y);
        const width = Math.min(content.x + content.width, part.x + part.width) - x;
        const height = Math.min(content.y + content.height, part.y + part.height) - y;
        if (width <= 0 || height <= 0) return;
        parts.push({
          source: bitmaps[index]!,
          from: { x: frame.x + (x - content.x), y: frame.y + (y - content.y), width, height },
          to: { x: x - part.x, y: y - part.y, width, height },
        });
      });
      return this.graphics.compose(part.width, part.height, parts);
    } finally {
      for (const bitmap of bitmaps) bitmap?.close();
    }
  }
}
