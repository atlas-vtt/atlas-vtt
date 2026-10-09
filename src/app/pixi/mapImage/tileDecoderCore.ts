import { DecodeBudget } from './decodeBudget';
import { DecodedLevels, decodeSource, decodedLevelsCost, decodedSizeCost, OpenError } from './decodedLevels';
import { PyramidBuild, type BuildOutcome } from './pyramidBuilder';
import { pyramidOf, type Pyramid, type TileRef } from './pyramid';
import type { TileGraphics } from './tileGraphics';
import type { FileIdentity, OpenedPyramid, OpenFailure, TileEvent } from './tileProtocol';
import { TileServer, type MapSource } from './tileServer';
import type { TileStore } from './tileStore';

/**
 * The tile worker's router (decisions 7 and 10 of the tiled map images plan):
 * finds a map's pyramid by its file identity or content hash, serves it from
 * the cache when complete, otherwise decodes the source once and builds the
 * pyramid while serving crops of the decoded levels. One entry per hash,
 * shared by every open of it and counted. Runs in the worker, or on the main
 * thread where no worker starts.
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

interface MapEntry extends MapSource {
  ready: Promise<void>;
  refs: number;
  build: PyramidBuild | null;
  /** Settles when the running build has ended; null without one. */
  built: Promise<BuildOutcome> | null;
  releaseBudget: (() => void) | null;
}

const PENDING_PYRAMID: Pyramid = pyramidOf(1, 1);

/** A bitmap decoded on the main thread, until a build takes it over. */
interface HeldBitmap {
  bitmap: ImageBitmap | null;
}

/** Thrown by an entry that found no complete pyramid and was given no bytes. */
class NeedBytes extends Error {}

function failureOf(error: unknown): OpenFailure {
  if (error instanceof OpenError) return error.failure;
  return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
}

export class TileDecoderCore {
  private readonly entries = new Map<string, MapEntry>();
  private readonly handles = new Map<number, MapEntry>();
  private readonly budget: DecodeBudget;
  private readonly server: TileServer;
  private nextHandle = 1;

  constructor(private readonly deps: TileCoreDeps) {
    this.budget = new DecodeBudget(deps.decodedBudget, () => this.giveWay());
    this.server = new TileServer(deps.store, deps.graphics);
  }

  /**
   * Opens a map for serving; `need-bytes` when only its bytes can tell or build it. `decoded`
   * (the image decoded on the main thread) is built from instead of the bytes, which still give
   * the hash; the core takes it over and closes it when it is not needed.
   */
  async open(identity: FileIdentity | null, bytes: ArrayBuffer | null, decoded: ImageBitmap | null = null): Promise<OpenOutcome> {
    const found = await this.acquire(identity, bytes, decoded);
    if (found.kind !== 'entry') return found;
    const { entry } = found;
    entry.refs += 1; // keeps the pin `acquire` took until `close`
    const handle = this.nextHandle++;
    this.handles.set(handle, entry);
    return { kind: 'opened', opened: { handle, hash: entry.hash, pyramid: entry.pyramid } };
  }

  /** Builds a map's pyramid without serving it; resolves once the build has ended. */
  async prebuild(identity: FileIdentity | null, bytes: ArrayBuffer | null, decoded: ImageBitmap | null = null): Promise<PrebuildOutcome> {
    const found = await this.acquire(identity, bytes, decoded);
    if (found.kind !== 'entry') return found;
    const { entry } = found;
    const complete = entry.built ? (await entry.built) === 'complete' : entry.complete;
    this.deps.store.unpin(entry.hash);
    this.dropIfUnused(entry);
    return { kind: 'prebuilt', hash: entry.hash, complete };
  }

  /** A tile's bitmap, or null when the request was cancelled meanwhile. */
  async tile(id: number, handle: number, ref: TileRef): Promise<ImageBitmap | null> {
    return this.server.tile(id, handle, this.entryOf(handle), ref);
  }

  async overview(id: number, handle: number, maxSide: number): Promise<ImageBitmap | null> {
    return this.server.overview(id, handle, this.entryOf(handle), maxSide);
  }

  cancel(id: number): void {
    this.server.cancel(id);
  }

  /** Ends an open: its requests are cancelled, its pyramid unpinned, and its levels released once nothing needs them. */
  close(handle: number): void {
    const entry = this.handles.get(handle);
    if (!entry) return;
    this.handles.delete(handle);
    this.server.cancelHandle(handle);
    entry.refs -= 1;
    this.deps.store.unpin(entry.hash);
    this.dropIfUnused(entry);
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
  ): Promise<{ kind: 'entry'; entry: MapEntry } | { kind: 'need-bytes' } | { kind: 'failed'; failure: OpenFailure }> {
    const { store } = this.deps;
    const held: HeldBitmap = { bitmap: decoded };
    let pinned: string | null = null;
    try {
      let hash = identity ? await store.lookupIdentity(identity.path, identity.size, identity.mtime) : null;
      if (!hash && !bytes) return { kind: 'need-bytes' };
      if (!hash && bytes) {
        hash = await this.deps.sha256(bytes);
        if (identity) await store.rememberIdentity(identity.path, identity.size, identity.mtime, hash);
      }
      pinned = hash!;
      store.pin(pinned);
      return { kind: 'entry', entry: await this.readyEntry(pinned, bytes, held) };
    } catch (error) {
      if (pinned) store.unpin(pinned);
      return error instanceof NeedBytes ? { kind: 'need-bytes' } : { kind: 'failed', failure: failureOf(error) };
    } finally {
      // Not built from: the cache served the map, or another open of it was under way.
      held.bitmap?.close();
    }
  }

  /** The entry of `hash` once it can serve; an entry that waited without bytes is tried again with them. */
  private async readyEntry(hash: string, bytes: ArrayBuffer | null, held: HeldBitmap): Promise<MapEntry> {
    const entry = this.entryFor(hash, bytes, held);
    try {
      await entry.ready;
      return entry;
    } catch (error) {
      if (!(error instanceof NeedBytes) || !bytes) throw error;
      const retried = this.entryFor(hash, bytes, held);
      await retried.ready;
      return retried;
    }
  }

  private entryFor(hash: string, bytes: ArrayBuffer | null, held: HeldBitmap): MapEntry {
    const existing = this.entries.get(hash);
    if (existing) return existing;
    const entry: MapEntry = {
      hash,
      // Replaced by `prepare` before the entry serves anything.
      pyramid: PENDING_PYRAMID,
      complete: false,
      levels: null,
      ready: Promise.resolve(),
      refs: 0,
      build: null,
      built: null,
      releaseBudget: null,
    };
    this.entries.set(hash, entry);
    entry.ready = this.prepare(entry, bytes, held);
    entry.ready.catch(() => {
      if (this.entries.get(hash) === entry) this.entries.delete(hash);
    });
    return entry;
  }

  private async prepare(entry: MapEntry, bytes: ArrayBuffer | null, held: HeldBitmap): Promise<void> {
    const manifest = await this.deps.store.readManifest(entry.hash);
    if (manifest?.complete) {
      entry.pyramid = pyramidOf(manifest.width, manifest.height, manifest.decodedScale);
      entry.complete = true;
      await this.deps.store.touch(entry.hash);
      return;
    }
    if (!bytes) throw new NeedBytes('The map image must be read to build its tiles.');
    const decoded = held.bitmap;
    held.bitmap = null;
    const blob = new Blob([bytes]);
    let release: () => void;
    try {
      release = await this.budget.acquire(decoded ? decodedSizeCost(decoded.width, decoded.height) : await decodedLevelsCost(blob));
    } catch (error) {
      decoded?.close();
      throw error;
    }
    try {
      const source = decoded ? { pyramid: pyramidOf(decoded.width, decoded.height), bitmap: decoded } : await decodeSource(blob, this.deps.graphics);
      entry.pyramid = source.pyramid;
      entry.levels = new DecodedLevels(source.pyramid, source.bitmap, this.deps.graphics);
      entry.releaseBudget = release;
    } catch (error) {
      release();
      throw error;
    }
    this.startBuild(entry, entry.levels);
  }

  private startBuild(entry: MapEntry, levels: DecodedLevels): void {
    const build = new PyramidBuild(entry.hash, entry.pyramid, levels, {
      store: this.deps.store,
      graphics: this.deps.graphics,
      yieldToRequests: () => this.yieldToRequests(),
      emit: this.deps.emit,
    });
    entry.build = build;
    entry.built = levels.ready().then(() => build.run(), (error: unknown) => {
      this.deps.emit({ type: 'build-failed', hash: entry.hash, message: error instanceof Error ? error.message : String(error) });
      return 'failed' as const;
    });
    void entry.built.then((outcome) => this.buildEnded(entry, outcome));
  }

  /**
   * A finished build has released its levels; one that could not write keeps
   * them while the map is open, which then shows from crops alone.
   */
  private buildEnded(entry: MapEntry, outcome: BuildOutcome): void {
    entry.build = null;
    entry.built = null;
    if (outcome === 'stopped' && entry.refs > 0 && entry.levels) {
      // Opened again while it was giving way: resume, skipping what was written.
      this.startBuild(entry, entry.levels);
      return;
    }
    if (outcome === 'complete') {
      entry.complete = true;
      this.releaseLevels(entry);
    } else if (outcome === 'stopped') {
      this.releaseLevels(entry);
    }
    this.dropIfUnused(entry);
  }

  private dropIfUnused(entry: MapEntry): void {
    if (entry.refs > 0 || entry.build) return;
    this.releaseLevels(entry);
    if (this.entries.get(entry.hash) === entry) this.entries.delete(entry.hash);
  }

  private releaseLevels(entry: MapEntry): void {
    entry.levels?.releaseAll();
    entry.levels = null;
    entry.releaseBudget?.();
    entry.releaseBudget = null;
  }

  /** A build nobody shows (a closed map, a prebuild) gives way to one that waits for memory; it resumes later. */
  private giveWay(): void {
    for (const entry of this.entries.values()) {
      if (entry.refs === 0) entry.build?.stop();
    }
  }

  private async yieldToRequests(): Promise<void> {
    await this.deps.yieldToMessages();
    await this.server.idle();
  }
}
