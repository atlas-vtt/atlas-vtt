import { TILE_SPEC, type TileRef } from './pyramid';
import type { FileIdentity } from './tileProtocol';

/**
 * The device's cache of map tile pyramids (decision 6 of the tiled map images
 * plan): manifests, tiles, the path identities that spare hashing an unchanged
 * file, and LRU eviction of whole pyramids within a budget. Storage is a
 * `TileStoreBackend` (IndexedDB in the worker, memory where that is missing),
 * so this logic runs anywhere and is tested without a browser.
 */

export interface PyramidManifest {
  hash: string;
  spec: number;
  width: number;
  height: number;
  decodedScale: number;
  complete: boolean;
  bytes: number;
  lastUsed: number;
}

/** The hash of a file's content as it was when last read: one per path, the latest. */
export interface IdentityRecord extends FileIdentity {
  hash: string;
}

export interface StoredTile {
  ref: TileRef;
  bytes: Blob;
}

/** Given a pyramid's stored manifest, the manifest to store with new tiles, or null to store nothing. */
export type ManifestUpdate = (stored: PyramidManifest | null) => PyramidManifest | null;

export interface TileStoreBackend {
  getManifest(hash: string): Promise<PyramidManifest | null>;
  putManifest(m: PyramidManifest): Promise<void>;
  listManifests(): Promise<PyramidManifest[]>;
  getTile(hash: string, t: TileRef): Promise<Blob | null>;
  /**
   * In one transaction: reads the pyramid's manifest, and when `update` answers one, stores it
   * with the tiles, so a crash never leaves tiles the manifest does not count. Answers whether
   * the tiles were stored.
   */
  writeTiles(hash: string, tiles: readonly StoredTile[], update: ManifestUpdate): Promise<boolean>;
  /** Keys (`tileKey`, "level/col/row") of the tiles stored for a pyramid. */
  hasTiles(hash: string): Promise<Set<string>>;
  /** Removes the manifest and every tile of a pyramid. */
  deletePyramid(hash: string): Promise<void>;
  getIdentity(path: string): Promise<IdentityRecord | null>;
  /** Replaces the path's identity: a path keeps only its latest. */
  putIdentity(record: IdentityRecord): Promise<void>;
  /** Deletes every identity whose hash is not in `keep`. */
  pruneIdentities(keep: ReadonlySet<string>): Promise<void>;
  clear(): Promise<void>;
  /** Closes the storage for good; later calls reject. */
  close(): Promise<void>;
}

export interface PyramidSpec {
  hash: string;
  width: number;
  height: number;
  decodedScale: number;
}

export interface TileStoreOptions {
  backend: TileStoreBackend;
  /** The origin's storage quota in bytes, or null where it cannot be read. */
  estimateQuota: () => Promise<number | null>;
  now?: () => number;
}

/** The cache never grows past this, whatever the quota. */
export const TILE_CACHE_MAX_BYTES = 2 * 1024 ** 3;
/** Share of the origin's quota the cache may take. */
export const TILE_CACHE_QUOTA_SHARE = 0.1;

export function tileCacheBudget(quota: number | null): number {
  if (quota === null || !Number.isFinite(quota) || quota <= 0) return TILE_CACHE_MAX_BYTES;
  return Math.min(TILE_CACHE_MAX_BYTES, Math.floor(quota * TILE_CACHE_QUOTA_SHARE));
}

export class TileStore {
  private readonly backend: TileStoreBackend;
  private readonly estimateQuota: () => Promise<number | null>;
  private readonly now: () => number;
  private readonly pins = new Map<string, number>();
  /** Manifest updates run one after another, so concurrent writes never lose bytes. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: TileStoreOptions) {
    this.backend = options.backend;
    this.estimateQuota = options.estimateQuota;
    this.now = options.now ?? Date.now;
  }

  /** The hash recorded for a file with this path, size and modification time. */
  async lookupIdentity(path: string, size: number, mtime: number): Promise<string | null> {
    const record = await this.backend.getIdentity(path);
    return record && record.size === size && record.mtime === mtime ? record.hash : null;
  }

  /** Records the file's hash, replacing what was recorded for its path. */
  rememberIdentity(path: string, size: number, mtime: number, hash: string): Promise<void> {
    return this.backend.putIdentity({ path, size, mtime, hash });
  }

  /** The pyramid's manifest; one written under another `TILE_SPEC` is deleted and reads as absent. */
  readManifest(hash: string): Promise<PyramidManifest | null> {
    return this.serial(() => this.currentManifest(hash));
  }

  /**
   * The manifest to build into: the stored one when it has this spec and
   * source (an incomplete one resumes, keeping its tiles), else a new empty one.
   */
  beginPyramid(spec: PyramidSpec): Promise<PyramidManifest> {
    return this.serial(async () => {
      const stored = await this.currentManifest(spec.hash);
      if (stored && sameSource(stored, spec)) {
        const touched = { ...stored, lastUsed: this.now() };
        await this.backend.putManifest(touched);
        return touched;
      }
      if (stored) await this.backend.deletePyramid(spec.hash);
      const fresh: PyramidManifest = { ...spec, spec: TILE_SPEC, complete: false, bytes: 0, lastUsed: this.now() };
      await this.backend.putManifest(fresh);
      return fresh;
    });
  }

  /** Keys (`tileKey`) of the tiles a pyramid already holds, so a build resumes where it stopped. */
  existingTiles(hash: string): Promise<Set<string>> {
    return this.backend.hasTiles(hash);
  }

  getTile(hash: string, ref: TileRef): Promise<Blob | null> {
    return this.backend.getTile(hash, ref);
  }

  /**
   * Writes one batch and adds its bytes to the manifest, in one transaction. Returns false, and
   * writes nothing, when the pyramid is gone (cleared or evicted meanwhile).
   */
  writeTiles(hash: string, tiles: readonly StoredTile[]): Promise<boolean> {
    const bytes = tiles.reduce((sum, tile) => sum + tile.bytes.size, 0);
    return this.serial(() => this.backend.writeTiles(hash, tiles, (manifest) => (
      manifest && manifest.spec === TILE_SPEC ? { ...manifest, bytes: manifest.bytes + bytes, lastUsed: this.now() } : null
    )));
  }

  /**
   * Marks a pyramid complete. Call it only once the last `writeTiles` has
   * resolved: a reader trusts every tile of a complete pyramid.
   */
  async markComplete(hash: string): Promise<boolean> {
    const marked = await this.serial(async () => {
      const manifest = await this.backend.getManifest(hash);
      if (!manifest || manifest.spec !== TILE_SPEC) return false;
      await this.backend.putManifest({ ...manifest, complete: true, lastUsed: this.now() });
      return true;
    });
    if (marked) await this.evict();
    return marked;
  }

  /** Records a use of the pyramid for the LRU. */
  touch(hash: string): Promise<void> {
    return this.serial(async () => {
      const manifest = await this.backend.getManifest(hash);
      if (manifest) await this.backend.putManifest({ ...manifest, lastUsed: this.now() });
    });
  }

  /** Keeps a pyramid from eviction while a map shows it or a build writes it; counted, so call `unpin` once per `pin`. */
  pin(hash: string): void {
    this.pins.set(hash, (this.pins.get(hash) ?? 0) + 1);
  }

  unpin(hash: string): void {
    const count = this.pins.get(hash) ?? 0;
    if (count <= 1) this.pins.delete(hash);
    else this.pins.set(hash, count - 1);
  }

  isPinned(hash: string): boolean {
    return this.pins.has(hash);
  }

  async budget(): Promise<number> {
    let quota: number | null = null;
    try {
      quota = await this.estimateQuota();
    } catch {
      quota = null;
    }
    return tileCacheBudget(quota);
  }

  /**
   * Deletes whole pyramids, least recently used first, until the cache fits
   * its budget. Pinned pyramids are never evicted, even when the cache stays
   * over budget. Returns the evicted hashes.
   */
  async evict(): Promise<string[]> {
    const budget = await this.budget();
    return this.serial(async () => {
      const manifests = await this.backend.listManifests();
      let total = manifests.reduce((sum, m) => sum + m.bytes, 0);
      const candidates = manifests.filter((m) => !this.pins.has(m.hash)).sort((a, b) => a.lastUsed - b.lastUsed);
      const evicted: string[] = [];
      for (const manifest of candidates) {
        if (total <= budget) break;
        // Pinned since the list was read: an open is about to serve it.
        if (this.pins.has(manifest.hash)) continue;
        await this.backend.deletePyramid(manifest.hash);
        total -= manifest.bytes;
        evicted.push(manifest.hash);
      }
      if (evicted.length > 0) await this.pruneIdentities();
      return evicted;
    });
  }

  async totalBytes(): Promise<number> {
    const manifests = await this.serial(() => this.backend.listManifests());
    return manifests.reduce((sum, m) => sum + m.bytes, 0);
  }

  /**
   * Deletes every pyramid that is not pinned when its turn comes, so open
   * maps, opens under way and running builds keep theirs; with nothing pinned
   * the identities go too. Returns the bytes left in the cache.
   */
  clear(): Promise<number> {
    return this.serial(async () => {
      if (this.pins.size === 0) {
        await this.backend.clear();
        return 0;
      }
      let kept = 0;
      for (const manifest of await this.backend.listManifests()) {
        if (this.pins.has(manifest.hash)) kept += manifest.bytes;
        else await this.backend.deletePyramid(manifest.hash);
      }
      await this.pruneIdentities();
      return kept;
    });
  }

  /** Closes the storage once the writes under way are done; the store is not used afterwards. */
  close(): Promise<void> {
    return this.serial(() => this.backend.close());
  }

  /** Drops the identities of pyramids no longer cached; a pinned hash keeps its own (an open may not have begun its pyramid yet). */
  private async pruneIdentities(): Promise<void> {
    const keep = new Set(this.pins.keys());
    for (const manifest of await this.backend.listManifests()) keep.add(manifest.hash);
    await this.backend.pruneIdentities(keep);
  }

  private async currentManifest(hash: string): Promise<PyramidManifest | null> {
    const manifest = await this.backend.getManifest(hash);
    if (!manifest) return null;
    if (manifest.spec === TILE_SPEC) return manifest;
    await this.backend.deletePyramid(hash);
    return null;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function sameSource(manifest: PyramidManifest, spec: PyramidSpec): boolean {
  return manifest.width === spec.width && manifest.height === spec.height && manifest.decodedScale === spec.decodedScale;
}
