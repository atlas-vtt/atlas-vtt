import type { BandDecoder } from '../../imageProcessing/band/bandTypes';
import type { ArtAlpha } from '../../levels/artRaster';
import { roofPieces, type RoofPieces } from '../../levels/roofs';
import { OpenError } from './decodedLevels';
import { MapEntries, NeedBytes, type HeldBitmap, type MapEntry } from './mapEntries';
import type { PixelRect, TesseraRef } from './pyramid';
import type { TesseraGraphics } from './tesseraGraphics';
import type { FileIdentity, OpenedPyramid, OpenFailure, TesseraEvent } from './tesseraProtocol';
import { TesseraServer } from './tesseraServer';
import { readStoredLevel, readTesseraBlobs, type StoredLevel, type TesseraSelection } from './tesseraBlobs';
import { LevelWaits } from './levelWaits';
import type { TesseraStore } from './tesseraStore';

/**
 * The tessera worker's router (decisions 7 and 10 of the tiled map images plan):
 * finds a map's pyramid by its file identity or content hash and hands out
 * handles to it; `MapEntries` serves it from the cache or builds it, and
 * `TesseraServer` answers its tessera and overview requests. Runs in the worker, or
 * on the main thread where no worker starts.
 */

export interface TesseraCoreDeps {
  store: TesseraStore;
  graphics: TesseraGraphics;
  sha256: (bytes: ArrayBuffer) => Promise<string>;
  /** Lets queued messages run before the build goes on: a macrotask. */
  yieldToMessages: () => Promise<void>;
  emit: (event: TesseraEvent) => void;
  /** Bytes of decoded levels all builds may hold together. */
  decodedBudget?: number;
  /** The decoder that reads a source the browser cannot decode in bands, or null; the real lookup when unset. */
  bandDecoderOf?: (blob: Blob) => Promise<BandDecoder | null>;
}

export type OpenOutcome =
  | { kind: 'opened'; opened: OpenedPyramid }
  | { kind: 'need-bytes' }
  | { kind: 'failed'; failure: OpenFailure };

export type PrebuildOutcome =
  | { kind: 'prebuilt'; hash: string; complete: boolean; stored: number }
  | { kind: 'need-bytes' }
  | { kind: 'failed'; failure: OpenFailure };

function failureOf(error: unknown): OpenFailure {
  if (error instanceof OpenError) return error.failure;
  return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
}

export class TesseraDecoderCore {
  private readonly handles = new Map<number, MapEntry>();
  private readonly entries: MapEntries;
  private readonly server: TesseraServer;
  private readonly levelWaits: LevelWaits;
  private nextHandle = 1;
  private disposed = false;

  constructor(private readonly deps: TesseraCoreDeps) {
    this.server = new TesseraServer(deps.store, deps.graphics);
    this.levelWaits = new LevelWaits((hash, level) => this.pinned(hash, () => readStoredLevel(deps.store, hash, level)));
    this.entries = new MapEntries({
      store: deps.store,
      graphics: deps.graphics,
      emit: (event) => {
        deps.emit(event);
        this.levelWaits.heard(event);
      },
      yieldToRequests: () => this.yieldToRequests(),
      decodedBudget: deps.decodedBudget,
      bandDecoderOf: deps.bandDecoderOf,
    });
  }

  /**
   * Opens a map for serving; `need-bytes` when only its bytes can tell or build it. `decoded`
   * (the image decoded on the main thread) is built from instead of the bytes, which still give
   * the hash; the core takes it over and closes it when it is not needed.
   */
  async open(identity: FileIdentity | null, bytes: ArrayBuffer | null, decoded: ImageBitmap | null = null): Promise<OpenOutcome> {
    // The open's reference keeps the pin `acquire` took until `close`.
    const found = await this.acquire(identity, bytes, decoded, true);
    if (found.kind !== 'entry') return found;
    const { entry } = found;
    const handle = this.nextHandle++;
    this.handles.set(handle, entry);
    return { kind: 'opened', opened: { handle, hash: entry.hash, pyramid: entry.pyramid } };
  }

  /** Builds a map's pyramid without serving it; resolves once the build has ended. */
  async prebuild(identity: FileIdentity | null, bytes: ArrayBuffer | null, decoded: ImageBitmap | null = null): Promise<PrebuildOutcome> {
    const found = await this.acquire(identity, bytes, decoded, false);
    if (found.kind !== 'entry') return found;
    const { entry } = found;
    const complete = entry.built ? (await entry.built) === 'complete' : entry.complete;
    // How far it came, so a build that gave way after storing tesserae is not taken for one that stores nothing.
    const stored = (await this.deps.store.existingTesserae(entry.hash).catch(() => new Set<string>())).size;
    this.deps.store.unpin(entry.hash);
    this.entries.dropIfUnused(entry);
    return { kind: 'prebuilt', hash: entry.hash, complete, stored };
  }

  /** A tessera's bitmap, or null when the request was cancelled meanwhile; rejects once its map closes. */
  async tessera(id: number, handle: number, ref: TesseraRef): Promise<ImageBitmap | null> {
    return this.server.tessera(id, handle, this.entryOf(handle), ref);
  }

  async overview(id: number, handle: number, maxSide: number): Promise<ImageBitmap | null> {
    return this.server.overview(id, handle, this.entryOf(handle), maxSide);
  }

  /** A part of the map fit within `maxSide` (`TesseraServer.window`), or null when the request was cancelled meanwhile. */
  async window(id: number, handle: number, rect: PixelRect, maxSide: number): Promise<ImageBitmap | null> {
    return this.server.window(id, handle, this.entryOf(handle), rect, maxSide);
  }

  /** Which pixels of the overview fit within `maxSide` hold art (`opaquePixels`), or null when the request was cancelled meanwhile. */
  async alphaRaster(id: number, handle: number, maxSide: number, threshold: number): Promise<ArtAlpha | null> {
    const overview = await this.overview(id, handle, maxSide);
    if (!overview) return null;
    try {
      return { width: overview.width, height: overview.height, opaque: this.deps.graphics.opaquePixels(overview, threshold) };
    } finally {
      overview.close();
    }
  }

  /** The pieces of a roof image (`roofPieces`) over its overview fit within `maxSide`, or null when the request was cancelled meanwhile. */
  async roofPieces(id: number, handle: number, maxSide: number): Promise<RoofPieces | null> {
    const overview = await this.overview(id, handle, maxSide);
    if (!overview) return null;
    try {
      return roofPieces(this.deps.graphics.alphaBytes(overview), overview.width, overview.height);
    } finally {
      overview.close();
    }
  }

  cancel(id: number): void {
    this.server.cancel(id);
    this.levelWaits.cancel(id);
  }

  /**
   * A level of a pyramid once the cache holds all its tesserae (a build stores the coarsest level first),
   * with each tessera's stored size; null once cancelled. Waits across builds that stop and resume.
   */
  levelReady(id: number, hash: string, level: number): Promise<StoredLevel | null> {
    return this.levelWaits.wait(id, hash, level);
  }

  /** Ends an open: its requests reject, its pyramid is unpinned, and its levels released once nothing needs them. */
  close(handle: number): void {
    const entry = this.handles.get(handle);
    if (!entry) return;
    this.handles.delete(handle);
    this.server.cancelHandle(handle);
    this.deps.store.unpin(entry.hash);
    this.entries.closed(entry);
  }

  /** Stops every build and closes the cache once the writes under way are done; nothing is served afterwards. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of this.handles.keys()) this.server.cancelHandle(handle);
    this.handles.clear();
    this.levelWaits.dispose();
    this.entries.dispose();
    await this.deps.store.close();
  }

  /** The stored bytes of a cached pyramid's tesserae, as they are; null for a tessera the cache misses. */
  tesseraBlobs(hash: string, tesserae: TesseraSelection): Promise<(ArrayBuffer | null)[]> {
    return this.pinned(hash, () => readTesseraBlobs(this.deps.store, hash, tesserae));
  }

  cacheSize(): Promise<number> {
    return this.deps.store.totalBytes();
  }

  /** Deletes every pyramid no open map or running build uses; returns the bytes left. */
  clearCache(): Promise<number> {
    return this.deps.store.clear();
  }

  /** Runs a read of a pyramid with it pinned, so no eviction or clear takes it meanwhile. */
  private async pinned<T>(hash: string, read: () => Promise<T>): Promise<T> {
    this.deps.store.pin(hash);
    try {
      return await read();
    } finally {
      this.deps.store.unpin(hash);
    }
  }

  private entryOf(handle: number): MapEntry {
    const entry = this.handles.get(handle);
    if (!entry) throw new Error(`No open map image has handle ${handle}.`);
    return entry;
  }

  /** The entry once it can serve, its hash pinned before the manifest is read (no clear or eviction comes between); the caller unpins. */
  private async acquire(
    identity: FileIdentity | null,
    bytes: ArrayBuffer | null,
    decoded: ImageBitmap | null,
    opens: boolean,
  ): Promise<{ kind: 'entry'; entry: MapEntry } | { kind: 'need-bytes' } | { kind: 'failed'; failure: OpenFailure }> {
    const { store } = this.deps;
    const held: HeldBitmap = { bitmap: decoded };
    let pinned: string | null = null;
    try {
      if (this.disposed) throw new Error('Map tesserae have stopped.');
      let hash = identity ? await store.lookupIdentity(identity.path, identity.size, identity.mtime) : null;
      if (!hash && !bytes) return { kind: 'need-bytes' };
      if (!hash && bytes) {
        hash = await this.deps.sha256(bytes);
        if (identity) await store.rememberIdentity(identity.path, identity.size, identity.mtime, hash);
      }
      pinned = hash!;
      store.pin(pinned);
      return { kind: 'entry', entry: await this.entries.ready(pinned, bytes, held, opens, identity?.path ?? null) };
    } catch (error) {
      if (pinned) store.unpin(pinned);
      return error instanceof NeedBytes ? { kind: 'need-bytes' } : { kind: 'failed', failure: failureOf(error) };
    } finally {
      // Not built from: the cache served the map, or another open of it was under way.
      held.bitmap?.close();
    }
  }

  private async yieldToRequests(): Promise<void> {
    await this.deps.yieldToMessages();
    await this.server.idle();
  }
}
