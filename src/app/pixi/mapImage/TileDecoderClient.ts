import type { App } from 'obsidian';
import type { TileRef } from './pyramid';
import { inThreadPort, workerPort, type PortFactory, type TilePort } from './tilePorts';
import {
  isTileEvent,
  type FileIdentity,
  type OpenedPyramid,
  type OpenFailure,
  type TileEvent,
  type TileMessage,
  type TileReply,
  type TileRequest,
} from './tileProtocol';
import TileWorker from './tileWorker?worker&inline';

/**
 * The main thread's side of the map tile worker: one worker per app, shared
 * by every view and the player window. Opens maps by file identity first, so
 * a map whose pyramid is cached opens without its file being read; tiles and
 * overviews come back as transferred `ImageBitmap`s.
 */

export type OpenedMap = OpenedPyramid;

/**
 * The file's bytes, or how to read them (`vault.readBinary`; never a fetch of
 * a resource URL). They are transferred to the worker, so the caller's buffer
 * is empty afterwards. A reader is called only when the cache cannot serve the map.
 */
export type BytesSource = ArrayBuffer | (() => Promise<ArrayBuffer>);

/** Decodes a file's bytes on the main thread, for images a worker cannot decode. */
export type MainThreadDecode = (bytes: ArrayBuffer) => Promise<ImageBitmap>;

/** A map image that cannot be shown; reported once per open. */
export class TileOpenError extends Error {
  constructor(readonly failure: OpenFailure) {
    super(failure.kind === 'too-large' ? `The image is too large to decode (${failure.width} × ${failure.height}).` : failure.message);
  }
}

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

  private port: TilePort | null = null;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: TileEvent) => void>();
  private nextId = 1;
  private disposed = false;

  constructor(private readonly options: TileDecoderClientOptions) {}

  /**
   * Opens a map image for tiles; rejects with `TileOpenError` when it cannot be shown. `decode`
   * decodes the bytes on this thread for images a worker cannot decode (SVG); it runs only when
   * the bytes are read, and its bitmap is transferred along with them.
   */
  async open(source: BytesSource, identity: FileIdentity | null, decode?: MainThreadDecode): Promise<OpenedMap> {
    const reply = await this.openLike('open', source, identity, decode);
    if (reply.type !== 'opened') throw new Error(`Unexpected reply to open: ${reply.type}`);
    return reply.opened;
  }

  /** Builds a map's pyramid into the cache without opening it; true once it is complete. */
  async prebuild(source: BytesSource, identity: FileIdentity | null): Promise<boolean> {
    const reply = await this.openLike('prebuild', source, identity);
    if (reply.type !== 'prebuilt') throw new Error(`Unexpected reply to prebuild: ${reply.type}`);
    return reply.complete;
  }

  tile(handle: number, ref: TileRef, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.bitmap({ type: 'tile', id: this.nextId++, handle, ref }, signal);
  }

  /** The whole map fit within `maxSide` pixels, composed in the worker. */
  overview(handle: number, maxSide: number, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.bitmap({ type: 'overview', id: this.nextId++, handle, maxSide }, signal);
  }

  /** Ends an open; requests still pending for it are cancelled and never answered. */
  close(handle: number): void {
    if (this.port) this.port.post({ type: 'close', handle }, []);
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

  /** Called with a pyramid's hash once it is complete in the cache. */
  onPyramidComplete(listener: (hash: string) => void): () => void {
    return this.onEvent((event) => {
      if (event.type === 'complete') listener(event.hash);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.stop(new Error(STOPPED));
  }

  private async openLike(
    type: 'open' | 'prebuild',
    source: BytesSource,
    identity: FileIdentity | null,
    decode?: MainThreadDecode,
  ): Promise<TileReply> {
    const id = this.nextId++;
    const read = (): Promise<ArrayBuffer> => (typeof source === 'function' ? source() : Promise.resolve(source));
    const send = async (bytes: ArrayBuffer | null): Promise<TileReply> => {
      // Decoded before the bytes are transferred, which empties their buffer.
      const decoded = bytes && decode ? await decode(bytes) : null;
      if (!decoded) return this.request({ type, id, identity, bytes }, bytes ? [bytes] : []);
      return this.request({ type, id, identity, bytes, decoded }, bytes ? [bytes, decoded] : [decoded]);
    };
    // Bytes in hand go along at once; a reader waits until the worker asks, unless no identity can stand for them.
    let bytes = typeof source !== 'function' || !identity ? await read() : null;
    let reply = await send(bytes);
    if (reply.type === 'need-bytes' && !bytes) {
      bytes = await read();
      reply = await send(bytes);
    }
    if (reply.type === 'open-failed') throw new TileOpenError(reply.failure);
    if (reply.type === 'error' || reply.type === 'need-bytes') throw this.failure(reply);
    return reply;
  }

  private async bitmap(message: Extract<TileRequest, { type: 'tile' | 'overview' }>, signal: AbortSignal | undefined): Promise<ImageBitmap> {
    signal?.throwIfAborted();
    const onAbort = (): void => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      this.port?.post({ type: 'cancel', id: message.id }, []);
      pending.reject(abortReason(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const reply = await this.request(message, []);
      if (reply.type !== 'bitmap') throw this.failure(reply);
      return reply.bitmap;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private request(message: Extract<TileRequest, { id: number }>, transfer: Transferable[]): Promise<TileReply> {
    if (this.disposed) return Promise.reject(new Error(STOPPED));
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      try {
        this.ensurePort().post(message, transfer);
      } catch (error) {
        this.pending.delete(message.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private ensurePort(): TilePort {
    if (this.port) return this.port;
    const receive = (message: TileMessage): void => this.receive(message);
    const crash = (reason: string): void => this.stop(new Error(reason));
    let port: TilePort;
    try {
      port = this.options.worker(receive, crash);
    } catch {
      port = (this.options.inThread ?? inThreadPort())(receive, crash);
    }
    port.post({ type: 'init', appId: this.options.appId }, []);
    this.port = port;
    return port;
  }

  private receive(message: TileMessage): void {
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

  /** Fails every pending request and drops the worker; the next request starts a new one, whose handles are new. */
  private stop(reason: Error): void {
    this.port?.terminate();
    this.port = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const { reject } of pending) reject(reason);
  }

  private failure(reply: TileReply): Error {
    return new Error(reply.type === 'error' ? reply.message : `Unexpected reply from the map tile worker: ${reply.type}`);
  }
}
