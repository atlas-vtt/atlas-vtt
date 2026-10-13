import { OpenError } from './decodedLevels';
import { MapEntries, NeedBytes, type HeldBitmap, type MapEntry } from './mapEntries';
import type { TileRef } from './pyramid';
import type { TileGraphics } from './tileGraphics';
import type { FileIdentity, OpenedPyramid, OpenFailure, TileEvent } from './tileProtocol';
import { TileServer } from './tileServer';
import type { TileStore } from './tileStore';

/**
 * The tile worker's router (decisions 7 and 10 of the tiled map images plan):
 * finds a map's pyramid by its file identity or content hash and hands out
 * handles to it; `MapEntries` serves it from the cache or builds it, and
 * `TileServer` answers its tile and overview requests. Runs in the worker, or
 * on the main thread where no worker starts.
 */

export interface TileCoreDeps {
  store: TileStore;
  graphics: TileGraphics;
  sha256: (bytes: ArrayBuffer) => Promise<string>;
  /** Lets queued messages run before the build goes on: a macrotask. */
  yieldToMessages: () => Promise<void>;
  emit: (event: TileEvent) => void;
  /** Bytes of decoded levels all builds may hold together. */
  decodedBudget?: number;
}

export type OpenOutcome =
  | { kind: 'opened'; opened: OpenedPyramid }
  | { kind: 'need-bytes' }
  | { kind: 'failed'; failure: OpenFailure };

export type PrebuildOutcome =
  | { kind: 'prebuilt'; hash: string; complete: boolean }
  | { kind: 'need-bytes' }
  | { kind: 'failed'; failure: OpenFailure };

function failureOf(error: unknown): OpenFailure {
  if (error instanceof OpenError) return error.failure;
  return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
}

export class TileDecoderCore {
  private readonly handles = new Map<number, MapEntry>();
  private readonly entries: MapEntries;
  private readonly server: TileServer;
  private nextHandle = 1;
  private disposed = false;

  constructor(private readonly deps: TileCoreDeps) {
    this.server = new TileServer(deps.store, deps.graphics);
    this.entries = new MapEntries({
      store: deps.store,
      graphics: deps.graphics,
      emit: deps.emit,
      yieldToRequests: () => this.yieldToRequests(),
      decodedBudget: deps.decodedBudget,
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
    this.deps.store.unpin(entry.hash);
    this.entries.dropIfUnused(entry);
    return { kind: 'prebuilt', hash: entry.hash, complete };
  }

  /** A tile's bitmap, or null when the request was cancelled meanwhile; rejects once its map closes. */
  async tile(id: number, handle: number, ref: TileRef): Promise<ImageBitmap | null> {
    return this.server.tile(id, handle, this.entryOf(handle), ref);
  }

  async overview(id: number, handle: number, maxSide: number): Promise<ImageBitmap | null> {
    return this.server.overview(id, handle, this.entryOf(handle), maxSide);
  }

  cancel(id: number): void {
    this.server.cancel(id);
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
    this.entries.dispose();
    await this.deps.store.close();
  }

  cacheSize(): Promise<number> {
    return this.deps.store.totalBytes();
  }

  /** Deletes every pyramid no open map or running build uses; returns the bytes left. */
  clearCache(): Promise<number> {
    return this.deps.store.clear();
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
      if (this.disposed) throw new Error('Map tiles have stopped.');
      let hash = identity ? await store.lookupIdentity(identity.path, identity.size, identity.mtime) : null;
      if (!hash && !bytes) return { kind: 'need-bytes' };
      if (!hash && bytes) {
        hash = await this.deps.sha256(bytes);
        if (identity) await store.rememberIdentity(identity.path, identity.size, identity.mtime, hash);
      }
      pinned = hash!;
      store.pin(pinned);
      return { kind: 'entry', entry: await this.entries.ready(pinned, bytes, held, opens) };
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
