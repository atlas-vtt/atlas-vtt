import { tileKey, type TileRef } from './pyramid';
import type { IdentityRecord, ManifestUpdate, PyramidManifest, StoredTile, TileStoreBackend } from './tileStore';

/**
 * The tile cache in IndexedDB, one database per vault and device. It runs in
 * the tile worker, so it takes its `IDBFactory` from the caller and imports
 * nothing of Obsidian.
 *
 * Stores: `manifests` (key: hash), `tiles` (key: [hash, level, col, row], so
 * a pyramid is one key range), `identities` (key: the file's path, one record per path).
 */

/** 2: identities keyed by path, so a path keeps only its latest. */
const DB_VERSION = 2;
const MANIFESTS = 'manifests';
const TILES = 'tiles';
const IDENTITIES = 'identities';
const ALL_STORES = [MANIFESTS, TILES, IDENTITIES];
const WRITE_OPTIONS: IDBTransactionOptions = { durability: 'relaxed' };

type StoreKey = [string, number, number, number];

export function tileDatabaseName(appId: string): string {
  return `atlas-vtt-map-tiles-${appId}`;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = (): void => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function pyramidRange(hash: string): IDBKeyRange {
  // An array key sorts after every number, so [hash, []] lies above all of the pyramid's tiles.
  return IDBKeyRange.bound([hash], [hash, []]);
}

function storeKey(hash: string, t: TileRef): StoreKey {
  return [hash, t.level, t.col, t.row];
}

function isStoreKey(key: IDBValidKey): key is StoreKey {
  return Array.isArray(key) && key.length === 4 && typeof key[1] === 'number' && typeof key[2] === 'number' && typeof key[3] === 'number';
}

function isIdentityRecord(value: unknown): value is IdentityRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.path === 'string' && typeof r.size === 'number' && typeof r.mtime === 'number' && typeof r.hash === 'string';
}

function isManifest(value: unknown): value is PyramidManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.hash === 'string' &&
    typeof m.spec === 'number' &&
    typeof m.width === 'number' &&
    typeof m.height === 'number' &&
    typeof m.decodedScale === 'number' &&
    typeof m.complete === 'boolean' &&
    typeof m.bytes === 'number' &&
    typeof m.lastUsed === 'number'
  );
}

export class IndexedDbTileBackend implements TileStoreBackend {
  private connection: Promise<IDBDatabase> | null = null;
  private closed = false;

  constructor(
    private readonly factory: IDBFactory,
    private readonly name: string,
  ) {}

  async getManifest(hash: string): Promise<PyramidManifest | null> {
    const value = await this.read<unknown>(MANIFESTS, (store) => store.get(hash));
    return isManifest(value) ? value : null;
  }

  async putManifest(m: PyramidManifest): Promise<void> {
    await this.write([MANIFESTS], (tx) => tx.objectStore(MANIFESTS).put(m));
  }

  async listManifests(): Promise<PyramidManifest[]> {
    const values = await this.read<unknown[]>(MANIFESTS, (store) => store.getAll());
    return values.filter(isManifest);
  }

  async getTile(hash: string, t: TileRef): Promise<Blob | null> {
    const value = await this.read<unknown>(TILES, (store) => store.get(storeKey(hash, t)));
    return value instanceof Blob ? value : null;
  }

  async writeTiles(hash: string, tiles: readonly StoredTile[], update: ManifestUpdate): Promise<boolean> {
    // Set from the transaction's callbacks.
    const outcome: { stored: boolean; failure: Error | null } = { stored: false, failure: null };
    try {
      await this.write([MANIFESTS, TILES], (tx) => {
        const manifests = tx.objectStore(MANIFESTS);
        const read = manifests.get(hash);
        read.onsuccess = (): void => {
          try {
            const manifest = update(isManifest(read.result) ? read.result : null);
            if (!manifest) return;
            const store = tx.objectStore(TILES);
            for (const tile of tiles) store.put(tile.bytes, storeKey(hash, tile.ref));
            manifests.put(manifest);
            outcome.stored = true;
          } catch (error) {
            // Nothing of the batch is written.
            outcome.failure = error instanceof Error ? error : new Error(String(error));
            tx.abort();
          }
        };
      });
    } catch (error) {
      if (outcome.failure) throw outcome.failure;
      throw error;
    }
    return outcome.stored;
  }

  async hasTiles(hash: string): Promise<Set<string>> {
    const keys = await this.read<IDBValidKey[]>(TILES, (store) => store.getAllKeys(pyramidRange(hash)));
    const found = new Set<string>();
    for (const key of keys) {
      if (isStoreKey(key)) found.add(tileKey({ level: key[1], col: key[2], row: key[3] }));
    }
    return found;
  }

  async deletePyramid(hash: string): Promise<void> {
    await this.write([MANIFESTS, TILES], (tx) => {
      tx.objectStore(MANIFESTS).delete(hash);
      tx.objectStore(TILES).delete(pyramidRange(hash));
    });
  }

  async getIdentity(path: string): Promise<IdentityRecord | null> {
    const value = await this.read<unknown>(IDENTITIES, (store) => store.get(path));
    return isIdentityRecord(value) ? value : null;
  }

  async putIdentity(record: IdentityRecord): Promise<void> {
    await this.write([IDENTITIES], (tx) => tx.objectStore(IDENTITIES).put(record));
  }

  async pruneIdentities(keep: ReadonlySet<string>): Promise<void> {
    await this.write([IDENTITIES], (tx) => {
      const cursor = tx.objectStore(IDENTITIES).openCursor();
      cursor.onsuccess = (): void => {
        const current = cursor.result;
        if (!current) return;
        const value: unknown = current.value;
        if (!isIdentityRecord(value) || !keep.has(value.hash)) current.delete();
        current.continue();
      };
    });
  }

  async clear(): Promise<void> {
    await this.write(ALL_STORES, (tx) => {
      for (const name of ALL_STORES) tx.objectStore(name).clear();
    });
  }

  /** Closes the connection for good, once the transactions under way are done; later calls reject. */
  async close(): Promise<void> {
    this.closed = true;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.then((db) => db.close(), () => undefined);
  }

  private async read<T>(storeName: string, query: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return request(query(db.transaction(storeName, 'readonly').objectStore(storeName)));
  }

  private async write(storeNames: string[], fill: (tx: IDBTransaction) => void): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(storeNames, 'readwrite', WRITE_OPTIONS);
    const done = committed(tx);
    fill(tx);
    await done;
  }

  private open(): Promise<IDBDatabase> {
    if (this.closed) return Promise.reject(new Error('The map tile cache is closed.'));
    if (this.connection) return this.connection;
    const lost = (): void => {
      if (this.connection === opening) this.connection = null;
    };
    const opening = this.connect(lost);
    this.connection = opening;
    opening.catch(lost);
    return opening;
  }

  private async connect(lost: () => void): Promise<IDBDatabase> {
    const req = this.factory.open(this.name, DB_VERSION);
    req.onupgradeneeded = (event): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) db.createObjectStore(MANIFESTS, { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(TILES)) db.createObjectStore(TILES);
      // Version 1 keyed identities by path, size and time; they are only a shortcut, so they go.
      if (event.oldVersion < 2 && db.objectStoreNames.contains(IDENTITIES)) db.deleteObjectStore(IDENTITIES);
      if (!db.objectStoreNames.contains(IDENTITIES)) db.createObjectStore(IDENTITIES, { keyPath: 'path' });
    };
    const db = await request(req);
    // Another connection wants to upgrade or delete the database: let it, and reopen on the next call.
    db.onversionchange = (): void => {
      db.close();
      lost();
    };
    // The browser closed it (storage cleared, disk error).
    db.onclose = lost;
    return db;
  }
}

/** Opens the tile cache of the vault `appId`. */
export function indexedDbTileBackend(appId: string, factory: IDBFactory): IndexedDbTileBackend {
  return new IndexedDbTileBackend(factory, tileDatabaseName(appId));
}
