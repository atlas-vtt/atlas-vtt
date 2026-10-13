import type { App } from 'obsidian';
import type { TileRef } from './pyramid';
import { TilePortKeeper, type TileWorkerCrash } from './tilePortKeeper';
import { workerPort, type PortFactory } from './tilePorts';
import { MapClosedError } from './tileErrors';
import { openWithRetry, type BytesSource, type MainThreadDecode, type OpenExchange } from './tileOpenRequest';
import {
  isTileEvent,
  type FileIdentity,
  type OpenedPyramid,
  type TileEvent,
  type TileReply,
  type TileRequest,
} from './tileProtocol';
import TileWorker from './tileWorker?worker&inline';

/**
 * The main thread's side of the map tile worker: one worker per app, shared
 * by every view and the player window. Opens maps by file identity first, so
 * a map whose pyramid is cached opens without its file being read; tiles and
 * overviews come back as transferred `ImageBitmap`s. Handles are the client's
 * own: a worker that crashed takes its handles along, and the client's never
 * name a map of the next worker.
 */

export { isMapClosed, MapClosedError, TileOpenError } from './tileErrors';
export type { BytesSource, MainThreadDecode } from './tileOpenRequest';

export type OpenedMap = OpenedPyramid;

export interface TileDecoderClientOptions {
  /** Names the vault's tile cache; null keeps it in memory. */
  appId: string | null;
  worker: PortFactory;
  /** Used when the worker cannot start. */
  inThread?: PortFactory;
}

interface Pending {
  resolve: (reply: TileReply) => void;
  reject: (reason: Error) => void;
  /** The client handle a tile or overview request reads. */
  handle?: number;
}

const STOPPED = 'Map tiles have stopped.';

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The tile request was cancelled.', 'AbortError');
}

export class TileDecoderClient {
  private static readonly instances = new WeakMap<App, TileDecoderClient>();

  static forApp(app: App): TileDecoderClient {
    let client = TileDecoderClient.instances.get(app);
    if (!client) {
      client = new TileDecoderClient({
        appId: app.appId,
        worker: workerPort(() => new TileWorker({ name: 'Atlas map tiles' })),
      });
      TileDecoderClient.instances.set(app, client);
    }
    return client;
  }

  /** Stops the worker; called when the plugin unloads. */
  static release(app: App): void {
    TileDecoderClient.instances.get(app)?.dispose();
    TileDecoderClient.instances.delete(app);
  }

  private readonly ports: TilePortKeeper;
  private readonly pending = new Map<number, Pending>();
  /** Client handle → the worker's handle, for the maps open in the worker that runs now. */
  private readonly handles = new Map<number, number>();
  private readonly listeners = new Set<(event: TileEvent) => void>();
  private readonly restartListeners = new Set<() => void>();
  private nextId = 1;
  private nextHandle = 1;
  private disposed = false;

  constructor(options: TileDecoderClientOptions) {
    this.ports = new TilePortKeeper({
      ...options,
      receive: (message) => this.receive(message),
      lost: (crash) => this.lost(crash),
    });
  }

  /**
   * Opens a map image for tiles; rejects with `TileOpenError` when it cannot be shown. `decode`
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

  /** Builds a map's pyramid into the cache without opening it; true once it is complete. */
  async prebuild(source: BytesSource, identity: FileIdentity | null): Promise<boolean> {
    const reply = await this.openLike('prebuild', source, identity);
    if (reply.type !== 'prebuilt') throw new Error(`Unexpected reply to prebuild: ${reply.type}`);
    return reply.complete;
  }

  /** A tile's bitmap; rejects with `MapClosedError` once its map is closed or was lost with a crashed worker. */
  tile(handle: number, ref: TileRef, signal?: AbortSignal): Promise<ImageBitmap> {
    const target = this.handles.get(handle);
    if (target === undefined) return Promise.reject(new MapClosedError());
    return this.bitmap({ type: 'tile', id: this.nextId++, handle: target, ref }, handle, signal);
  }

  /** The whole map fit within `maxSide` pixels, composed in the worker; rejects as `tile` does. */
  overview(handle: number, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    const target = this.handles.get(handle);
    if (target === undefined) return Promise.reject(new MapClosedError());
    return this.bitmap({ type: 'overview', id: this.nextId++, handle: target, maxSide }, handle, signal);
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
  onEvent(listener: (event: TileEvent) => void): () => void {
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

  private openLike(type: 'open' | 'prebuild', source: BytesSource, identity: FileIdentity | null, decode?: MainThreadDecode): Promise<TileReply> {
    const exchange: OpenExchange = {
      nextId: () => this.nextId++,
      request: (message, transfer) => this.request(message, transfer),
    };
    return openWithRetry(exchange, { type, source, identity, ...(decode && { decode }) });
  }

  private async bitmap(
    message: Extract<TileRequest, { type: 'tile' | 'overview' }>,
    handle: number,
    signal: AbortSignal | undefined,
  ): Promise<ImageBitmap> {
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
      const reply = await this.request(message, [], handle);
      if (reply.type !== 'bitmap') throw this.failure(reply);
      return reply.bitmap;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private request(message: Extract<TileRequest, { id: number }>, transfer: Transferable[], handle?: number): Promise<TileReply> {
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

  private receive(message: TileReply | TileEvent): void {
    if (isTileEvent(message)) {
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
  private lost(crash: TileWorkerCrash): void {
    const hadMaps = this.handles.size > 0;
    this.fail(crash);
    if (!hadMaps) return;
    for (const listener of [...this.restartListeners]) {
      try {
        listener();
      } catch (error) {
        console.error('[Atlas] A map tile listener failed:', error);
      }
    }
  }

  /** Fails every pending request (tile and overview requests as closed) and forgets every handle. */
  private fail(reason: Error): void {
    this.handles.clear();
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) request.reject(request.handle === undefined ? reason : new MapClosedError());
  }

  private failure(reply: TileReply): Error {
    return new Error(reply.type === 'error' ? reply.message : `Unexpected reply from the map tile worker: ${reply.type}`);
  }
}
