import { tesseraKey, type TesseraRef } from './pyramid';
import type { IdentityRecord, ManifestUpdate, PyramidManifest, StoredTessera, TesseraStoreBackend } from './tesseraStore';

/**
 * A `TesseraStoreBackend` that keeps everything in memory for the life of the
 * worker: the cache where IndexedDB cannot be opened (a private profile, a
 * failed upgrade), so maps still open the same way and build once per session.
 */
export class MemoryTesseraBackend implements TesseraStoreBackend {
  private readonly manifests = new Map<string, PyramidManifest>();
  private readonly tesserae = new Map<string, Map<string, Blob>>();
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

  getTessera(hash: string, t: TesseraRef): Promise<Blob | null> {
    return Promise.resolve(this.tesserae.get(hash)?.get(tesseraKey(t)) ?? null);
  }

  writeTesserae(hash: string, tesserae: readonly StoredTessera[], update: ManifestUpdate): Promise<boolean> {
    const stored = this.manifests.get(hash);
    const manifest = update(stored ? { ...stored } : null);
    if (!manifest) return Promise.resolve(false);
    let pyramid = this.tesserae.get(hash);
    if (!pyramid) {
      pyramid = new Map();
      this.tesserae.set(hash, pyramid);
    }
    for (const tessera of tesserae) pyramid.set(tesseraKey(tessera.ref), tessera.bytes);
    this.manifests.set(hash, { ...manifest });
    return Promise.resolve(true);
  }

  hasTesserae(hash: string): Promise<Set<string>> {
    return Promise.resolve(new Set(this.tesserae.get(hash)?.keys()));
  }

  deletePyramid(hash: string): Promise<void> {
    this.manifests.delete(hash);
    this.tesserae.delete(hash);
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
    this.tesserae.clear();
    this.identities.clear();
    return Promise.resolve();
  }

  /** Nothing to close: the cache lives as long as the worker. */
  close(): Promise<void> {
    return Promise.resolve();
  }
}
