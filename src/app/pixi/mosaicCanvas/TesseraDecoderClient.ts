import type { App } from 'obsidian';
import type { PixelRect, TesseraRef } from './pyramid';
import { TesseraPortKeeper, type TesseraWorkerCrash } from './tesseraPortKeeper';
import { workerPort, type PortFactory } from './tesseraPorts';
import { MapClosedError, TesseraLevelError } from './tesseraErrors';
import { openWithRetry, type BytesSource, type MainThreadDecode, type OpenExchange } from './tesseraOpenRequest';
import type { ArtAlpha } from '../../levels/artRaster';
import type { RoofPieces } from '../../levels/roofs';
import type { StoredLevel, TesseraSelection } from './tesseraBlobs';
import {
  isTesseraEvent,
  type FileIdentity,
  type OpenedPyramid,
  type TesseraEvent,
  type TesseraReply,
  type TesseraRequest,
} from './tesseraProtocol';
import TesseraWorker from './tesseraWorker?worker&inline';

/**
 * The main thread's side of the map tessera worker: one worker per app, shared
 * by every view and the player window. Opens maps by file identity first, so
 * a map whose pyramid is cached opens without its file being read; tesserae and
 * overviews come back as transferred `ImageBitmap`s. Handles are the client's
 * own: a worker that crashed takes its handles along, and the client's never
 * name a map of the next worker.
 */

export { isMapClosed, MapClosedError, TesseraLevelError, TesseraOpenError } from './tesseraErrors';
export type { BytesSource, MainThreadDecode } from './tesseraOpenRequest';

export type OpenedMap = OpenedPyramid;

export interface TesseraDecoderClientOptions {
  /** Names the vault's tessera cache; null keeps it in memory. */
  appId: string | null;
  worker: PortFactory;
  /** Used when the worker cannot start. */
  inThread?: PortFactory;
}

interface Pending {
  resolve: (reply: TesseraReply) => void;
  reject: (reason: Error) => void;
  /** The client handle a tessera or overview request reads. */
  handle?: number;
}

const STOPPED = 'Map tesserae have stopped.';

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The tessera request was cancelled.', 'AbortError');
}

export class TesseraDecoderClient {
  private static readonly instances = new WeakMap<App, TesseraDecoderClient>();

  static forApp(app: App): TesseraDecoderClient {
    let client = TesseraDecoderClient.instances.get(app);
    if (!client) {
      client = new TesseraDecoderClient({
        appId: app.appId,
        worker: workerPort(() => new TesseraWorker({ name: 'Atlas map tesserae' })),
      });
      TesseraDecoderClient.instances.set(app, client);
    }
    return client;
  }

  /** Stops the worker; called when the plugin unloads. */
  static release(app: App): void {
    TesseraDecoderClient.instances.get(app)?.dispose();
    TesseraDecoderClient.instances.delete(app);
  }

  private readonly ports: TesseraPortKeeper;
  private readonly pending = new Map<number, Pending>();
  /** Client handle → the worker's handle, for the maps open in the worker that runs now. */
  private readonly handles = new Map<number, number>();
  private readonly listeners = new Set<(event: TesseraEvent) => void>();
  private readonly restartListeners = new Set<() => void>();
  private nextId = 1;
  private nextHandle = 1;
  private disposed = false;

  constructor(options: TesseraDecoderClientOptions) {
    this.ports = new TesseraPortKeeper({
      ...options,
      receive: (message) => this.receive(message),
      lost: (crash) => this.lost(crash),
    });
  }

  /**
   * Opens a map image for tesserae; rejects with `TesseraOpenError` when it cannot be shown. `decode`
   * decodes the bytes on this thread for images a worker cannot decode (SVG); it runs only when
   * the bytes are read, and its bitmap is transferred along with them.
   */
  async open(source: BytesSource, identity: FileIdentity | null, decode?: MainThreadDecode): Promise<OpenedMap> {
    const reply = await this.openLike('open', source, identity, decode);
    if (reply.type !== 'opened') throw new Error(`Unexpected reply to open: ${reply.type}`);
    const handle = this.nextHandle++;
    this.handles.set(handle, reply.opened.handle);
    return { ...reply.opened, handle };
  }

  /** Builds a map's pyramid into the cache without opening it; true once it is complete. `decode` as for `open`. */
  async prebuild(source: BytesSource, identity: FileIdentity | null, decode?: MainThreadDecode): Promise<boolean> {
    return (await this.ensurePyramid(source, identity, decode)).complete;
  }

  /** `prebuild`, answering the pyramid's hash and how many of its tesserae are stored too; rejects with `TesseraOpenError` where it cannot be built. */
  async ensurePyramid(source: BytesSource, identity: FileIdentity | null, decode?: MainThreadDecode): Promise<{ hash: string; complete: boolean; stored: number }> {
    const reply = await this.openLike('prebuild', source, identity, decode);
    if (reply.type !== 'prebuilt') throw new Error(`Unexpected reply to prebuild: ${reply.type}`);
    return { hash: reply.hash, complete: reply.complete, stored: reply.stored };
  }

  /** The stored WebP bytes of a cached pyramid's tesserae, never decoded; null for a tessera the cache misses. */
  async tesseraBlobs(hash: string, tesserae: TesseraSelection): Promise<(ArrayBuffer | null)[]> {
    const reply = await this.request({ type: 'tessera-blobs', id: this.nextId++, hash, tesserae }, []);
    if (reply.type !== 'tessera-blobs') throw this.failure(reply);
    return reply.blobs;
  }

  /**
   * A level of a cached pyramid once every tessera of it is stored, with each tessera's stored size: at once
   * where the cache holds it, else as a build (started elsewhere) stores it. Rejects once `signal`
   * aborts, and when the worker stops: a new worker knows nothing of the wait, so ask again; rejects
   * with `TesseraLevelError` for a level the worker cannot answer for.
   */
  async levelReady(hash: string, level: number, signal?: AbortSignal): Promise<StoredLevel> {
    const reply = await this.answer({ type: 'level-ready', id: this.nextId++, hash, level }, undefined, signal);
    if (reply.type === 'error') throw new TesseraLevelError(reply.message);
    if (reply.type !== 'level-ready') throw this.failure(reply);
    return reply.level;
  }

  /** A tessera's bitmap; rejects with `MapClosedError` once its map is closed or was lost with a crashed worker. */
  tessera(handle: number, ref: TesseraRef, signal?: AbortSignal): Promise<ImageBitmap> {
    const target = this.handles.get(handle);
    if (target === undefined) return Promise.reject(new MapClosedError());
    return this.bitmap({ type: 'tessera', id: this.nextId++, handle: target, ref }, handle, signal);
  }

  /** The whole map fit within `maxSide` pixels, composed in the worker; rejects as `tessera` does. */
  overview(handle: number, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    const target = this.handles.get(handle);
    if (target === undefined) return Promise.reject(new MapClosedError());
    return this.bitmap({ type: 'overview', id: this.nextId++, handle: target, maxSide }, handle, signal);
  }

  /** A part of the map (`rect` in the image's pixels) fit within `maxSide`, composed in the worker from the finest level that shows it so; rejects as `tessera` does. */
  window(handle: number, rect: PixelRect, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    const target = this.handles.get(handle);
    if (target === undefined) return Promise.reject(new MapClosedError());
    return this.bitmap({ type: 'window', id: this.nextId++, handle: target, rect, maxSide }, handle, signal);
  }

  /** Which pixels of the map's overview fit within `maxSide` hold art (alpha above `threshold`), read in the worker; rejects as `tessera` does. */
  async alphaRaster(handle: number, maxSide: number, threshold: number, signal?: AbortSignal): Promise<ArtAlpha> {
    const target = this.handles.get(handle);
    if (target === undefined) throw new MapClosedError();
    const reply = await this.answer({ type: 'alpha-raster', id: this.nextId++, handle: target, maxSide, threshold }, handle, signal);
    if (reply.type !== 'alpha-raster') throw this.failure(reply);
    return reply.raster;
  }

  /** The pieces of the map as a roof (`roofPieces`), over its overview fit within `maxSide`, worked out in the worker; rejects as `tessera` does. */
  async roofPieces(handle: number, maxSide: number, signal?: AbortSignal): Promise<RoofPieces> {
    const target = this.handles.get(handle);
    if (target === undefined) throw new MapClosedError();
    const reply = await this.answer({ type: 'roof-pieces', id: this.nextId++, handle: target, maxSide }, handle, signal);
    if (reply.type !== 'roof-pieces') throw this.failure(reply);
    return reply.pieces;
  }

  /** Ends an open; requests still pending for it reject with `MapClosedError`. A handle of a crashed worker is ignored. */
  close(handle: number): void {
    const target = this.handles.get(handle);
    if (target === undefined) return;
    this.handles.delete(handle);
    for (const [id, request] of this.pending) {
      if (request.handle !== handle) continue;
      this.pending.delete(id);
      request.reject(new MapClosedError());
    }
    this.ports.running?.post({ type: 'close', handle: target }, []);
  }

  async cacheSize(): Promise<number> {
    const reply = await this.request({ type: 'cache-size', id: this.nextId++ }, []);
    if (reply.type !== 'cache-size') throw this.failure(reply);
    return reply.bytes;
  }

  /** Deletes every cached pyramid except those of open maps and running builds; resolves with the bytes left. */
  async clearCache(): Promise<number> {
    const reply = await this.request({ type: 'clear-cache', id: this.nextId++ }, []);
    if (reply.type !== 'cleared') throw this.failure(reply);
    return reply.bytes;
  }

  /** Build progress, completion and failures; returns the unsubscribe. */
  onEvent(listener: (event: TesseraEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Called when the worker stopped and took its open maps along: their handles are void, so
   * whoever shows one opens it again. Returns the unsubscribe.
   */
  onRestart(listener: () => void): () => void {
    this.restartListeners.add(listener);
    return () => this.restartListeners.delete(listener);
  }

  /** Called with a pyramid's hash once it is complete in the cache. */
  onPyramidComplete(listener: (hash: string) => void): () => void {
    return this.onEvent((event) => {
      if (event.type === 'complete') listener(event.hash);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.restartListeners.clear();
    this.ports.terminate();
    this.fail(new Error(STOPPED));
  }

  private openLike(type: 'open' | 'prebuild', source: BytesSource, identity: FileIdentity | null, decode?: MainThreadDecode): Promise<TesseraReply> {
    const exchange: OpenExchange = {
      nextId: () => this.nextId++,
      request: (message, transfer) => this.request(message, transfer),
    };
    return openWithRetry(exchange, { type, source, identity, ...(decode && { decode }) });
  }

  private async bitmap(
    message: Extract<TesseraRequest, { type: 'tessera' | 'overview' | 'window' }>,
    handle: number,
    signal: AbortSignal | undefined,
  ): Promise<ImageBitmap> {
    const reply = await this.answer(message, handle, signal);
    if (reply.type !== 'bitmap') throw this.failure(reply);
    return reply.bitmap;
  }

  /** The reply to a request (about the open map `handle`, if any), which `signal` cancels in the worker too. */
  private async answer(
    message: Extract<TesseraRequest, { type: 'tessera' | 'overview' | 'window' | 'alpha-raster' | 'roof-pieces' | 'level-ready' }>,
    handle: number | undefined,
    signal: AbortSignal | undefined,
  ): Promise<TesseraReply> {
    signal?.throwIfAborted();
    const onAbort = (): void => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      this.ports.running?.post({ type: 'cancel', id: message.id }, []);
      pending.reject(abortReason(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.request(message, [], handle);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private request(message: Extract<TesseraRequest, { id: number }>, transfer: Transferable[], handle?: number): Promise<TesseraReply> {
    if (this.disposed) return Promise.reject(new Error(STOPPED));
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject, ...(handle === undefined ? {} : { handle }) });
      try {
        this.ports.current().post(message, transfer);
      } catch (error) {
        this.pending.delete(message.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private receive(message: TesseraReply | TesseraEvent): void {
    if (isTesseraEvent(message)) {
      for (const listener of this.listeners) listener(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      // Answered after it was cancelled.
      if (message.type === 'bitmap') message.bitmap.close();
      return;
    }
    this.pending.delete(message.id);
    pending.resolve(message);
  }

  /** The worker ended: its maps and pending requests went with it; whoever shows a map opens it again. */
  private lost(crash: TesseraWorkerCrash): void {
    const hadMaps = this.handles.size > 0;
    this.fail(crash);
    if (!hadMaps) return;
    for (const listener of [...this.restartListeners]) {
      try {
        listener();
      } catch (error) {
        console.error('[Atlas] A map tessera listener failed:', error);
      }
    }
  }

  /** Fails every pending request (those about an open map as closed) and forgets every handle. */
  private fail(reason: Error): void {
    this.handles.clear();
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) request.reject(request.handle === undefined ? reason : new MapClosedError());
  }

  private failure(reply: TesseraReply): Error {
    return new Error(reply.type === 'error' ? reply.message : `Unexpected reply from the map tessera worker: ${reply.type}`);
  }
}
