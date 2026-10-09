import { tileKey, type TileRef } from './pyramid';
import type { IdentityRecord, ManifestUpdate, PyramidManifest, StoredTile, TileStoreBackend } from './tileStore';

/**
 * A `TileStoreBackend` that keeps everything in memory for the life of the
 * worker: the cache where IndexedDB cannot be opened (a private profile, a
 * failed upgrade), so maps still open the same way and build once per session.
 */
export class MemoryTileBackend implements TileStoreBackend {
  private readonly manifests = new Map<string, PyramidManifest>();
  private readonly tiles = new Map<string, Map<string, Blob>>();
  private readonly identities = new Map<string, IdentityRecord>();

  getManifest(hash: string): Promise<PyramidManifest | null> {
    const manifest = this.manifests.get(hash);
    return Promise.resolve(manifest ? { ...manifest } : null);
  }

  putManifest(m: PyramidManifest): Promise<void> {
    this.manifests.set(m.hash, { ...m });
    return Promise.resolve();
  }

  listManifests(): Promise<PyramidManifest[]> {
    return Promise.resolve([...this.manifests.values()].map((m) => ({ ...m })));
  }

  getTile(hash: string, t: TileRef): Promise<Blob | null> {
    return Promise.resolve(this.tiles.get(hash)?.get(tileKey(t)) ?? null);
  }

  writeTiles(hash: string, tiles: readonly StoredTile[], update: ManifestUpdate): Promise<boolean> {
    const stored = this.manifests.get(hash);
    const manifest = update(stored ? { ...stored } : null);
    if (!manifest) return Promise.resolve(false);
    let pyramid = this.tiles.get(hash);
    if (!pyramid) {
      pyramid = new Map();
      this.tiles.set(hash, pyramid);
    }
    for (const tile of tiles) pyramid.set(tileKey(tile.ref), tile.bytes);
    this.manifests.set(hash, { ...manifest });
    return Promise.resolve(true);
  }

  hasTiles(hash: string): Promise<Set<string>> {
    return Promise.resolve(new Set(this.tiles.get(hash)?.keys()));
  }

  deletePyramid(hash: string): Promise<void> {
    this.manifests.delete(hash);
    this.tiles.delete(hash);
    return Promise.resolve();
  }

  getIdentity(path: string): Promise<IdentityRecord | null> {
    const record = this.identities.get(path);
    return Promise.resolve(record ? { ...record } : null);
  }

  putIdentity(record: IdentityRecord): Promise<void> {
    this.identities.set(record.path, { ...record });
    return Promise.resolve();
  }

  pruneIdentities(keep: ReadonlySet<string>): Promise<void> {
    for (const [path, record] of this.identities) {
      if (!keep.has(record.hash)) this.identities.delete(path);
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.manifests.clear();
    this.tiles.clear();
    this.identities.clear();
    return Promise.resolve();
  }

  /** Nothing to close: the cache lives as long as the worker. */
  close(): Promise<void> {
    return Promise.resolve();
  }
}
