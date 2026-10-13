import { DecodeBudget } from './decodeBudget';
import { checkDecodable, DecodedLevels, decodeSource, decodedLevelsCost, decodedSizeCost } from './decodedLevels';
import { PyramidBuild, type BuildOutcome } from './pyramidBuilder';
import { pyramidOf, type Pyramid } from './pyramid';
import type { TileGraphics } from './tileGraphics';
import type { TileEvent } from './tileProtocol';
import type { MapSource } from './tileServer';
import type { TileStore } from './tileStore';

/**
 * The maps the tile worker knows, one entry per content hash, shared by every
 * open of it and counted (decisions 7 and 10 of the tiled map images plan):
 * an entry serves from the cache when its pyramid is complete, otherwise it
 * decodes the source once within the decode budget and builds the pyramid.
 * Builds of maps nobody shows give way to maps being opened.
 */

export interface MapEntry extends MapSource {
  ready: Promise<void>;
  /** Opens of it that have not been closed. */
  refs: number;
  /** Opens of it under way: they count as shown, so its build and budget request do not give way. */
  opening: number;
  build: PyramidBuild | null;
  /** Settles when the running build has ended; null without one. */
  built: Promise<BuildOutcome> | null;
  releaseBudget: (() => void) | null;
}

/** A bitmap decoded on the main thread, until a build takes it over. */
export interface HeldBitmap {
  bitmap: ImageBitmap | null;
}

/** Thrown by an entry that found no complete pyramid and was given no bytes. */
export class NeedBytes extends Error {}

export interface MapEntriesDeps {
  store: TileStore;
  graphics: TileGraphics;
  emit: (event: TileEvent) => void;
  /** Resolves once pending requests had their turn. */
  yieldToRequests: () => Promise<void>;
  /** Bytes of decoded levels all builds may hold together. */
  decodedBudget?: number | undefined;
}

const PENDING_PYRAMID: Pyramid = pyramidOf(1, 1);

export class MapEntries {
  private readonly entries = new Map<string, MapEntry>();
  private readonly budget: DecodeBudget;
  private disposed = false;

  constructor(private readonly deps: MapEntriesDeps) {
    this.budget = new DecodeBudget(deps.decodedBudget, { onPressure: () => this.giveWay(), yielding: () => this.yielding() });
  }

  /**
   * The entry of `hash` once it can serve, referenced once more for an open (`opens`); an entry
   * that waited without bytes is tried again with them.
   */
  async ready(hash: string, bytes: ArrayBuffer | null, held: HeldBitmap, opens: boolean): Promise<MapEntry> {
    try {
      return await this.join(this.entryFor(hash, bytes, held), opens);
    } catch (error) {
      if (!(error instanceof NeedBytes) || !bytes) throw error;
      return this.join(this.entryFor(hash, bytes, held), opens);
    }
  }

  /** Ends one open of `entry`; under pressure a build nobody shows any more gives way now. */
  closed(entry: MapEntry): void {
    entry.refs -= 1;
    if (this.budget.pressured) this.giveWay();
    this.dropIfUnused(entry);
  }

  /** Forgets `entry` once nothing shows or builds it. */
  dropIfUnused(entry: MapEntry): void {
    if (this.shown(entry) || entry.build) return;
    this.releaseLevels(entry);
    if (this.entries.get(entry.hash) === entry) this.entries.delete(entry.hash);
  }

  /** Stops every build and releases every level; no build starts afterwards. */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      if (entry.build) entry.build.stop();
      else this.releaseLevels(entry);
    }
  }

  /** Waits for `entry` to serve; an open counts as showing it from the start, so nothing of it gives way meanwhile. */
  private async join(entry: MapEntry, opens: boolean): Promise<MapEntry> {
    if (!opens) {
      await entry.ready;
      return entry;
    }
    entry.opening += 1;
    // Its budget request may have become urgent.
    this.budget.reconsider();
    try {
      await entry.ready;
      entry.refs += 1;
      return entry;
    } finally {
      entry.opening -= 1;
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
      opening: 0,
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
    try {
      if (decoded) checkDecodable(decoded);
      const cost = decoded ? decodedSizeCost(decoded.width, decoded.height) : await decodedLevelsCost(blob);
      // Held from here, so an open waiting for memory knows this decode gives way when nobody shows it.
      entry.releaseBudget = await this.budget.acquire({ bytes: cost, urgent: () => this.shown(entry) });
    } catch (error) {
      decoded?.close();
      throw error;
    }
    try {
      const source = decoded ? { pyramid: pyramidOf(decoded.width, decoded.height), bitmap: decoded } : await decodeSource(blob, this.deps.graphics);
      entry.pyramid = source.pyramid;
      entry.levels = new DecodedLevels(source.pyramid, source.bitmap, this.deps.graphics);
    } catch (error) {
      this.releaseLevels(entry);
      throw error;
    }
    this.startBuild(entry, entry.levels);
  }

  private startBuild(entry: MapEntry, levels: DecodedLevels): void {
    // Nobody shows it and an open waits for memory (or the core stopped): it gives way before it starts.
    if (this.disposed || (!this.shown(entry) && this.budget.pressured)) {
      this.releaseLevels(entry);
      if (this.entries.get(entry.hash) === entry) this.entries.delete(entry.hash);
      return;
    }
    const build = new PyramidBuild(entry.hash, entry.pyramid, levels, {
      store: this.deps.store,
      graphics: this.deps.graphics,
      yieldToRequests: this.deps.yieldToRequests,
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
   * Every ended build releases its levels and its share of the budget. One that could not write
   * (`failed`, `lost`) leaves a map that shows what the cache holds of it: tiles missing there
   * fail, and its overview comes from the finest level the cache holds whole. Holding the levels
   * instead would keep up to the whole budget for as long as the map is open and make every
   * other map wait for it.
   */
  private buildEnded(entry: MapEntry, outcome: BuildOutcome): void {
    entry.build = null;
    entry.built = null;
    if (outcome === 'stopped' && this.shown(entry) && entry.levels && !this.disposed) {
      // Opened again while it was giving way: resume, skipping what was written.
      this.startBuild(entry, entry.levels);
      return;
    }
    if (outcome === 'complete') entry.complete = true;
    this.releaseLevels(entry);
    this.dropIfUnused(entry);
  }

  /** Whether a view shows the map or is opening it. */
  private shown(entry: MapEntry): boolean {
    return entry.refs + entry.opening > 0;
  }

  /** Whether some holder of the budget is a map nobody shows, which gives way under pressure. */
  private yielding(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.releaseBudget && !this.shown(entry)) return true;
    }
    return false;
  }

  private releaseLevels(entry: MapEntry): void {
    entry.levels?.releaseAll();
    entry.levels = null;
    entry.releaseBudget?.();
    entry.releaseBudget = null;
  }

  /**
   * A build nobody shows (a closed map, a prebuild) gives way to one that waits for memory; it
   * resumes later. One still decoding gives way when its decode ends (`startBuild`).
   */
  private giveWay(): void {
    for (const entry of this.entries.values()) {
      if (!this.shown(entry)) entry.build?.stop();
    }
  }
}
