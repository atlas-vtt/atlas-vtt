import { tileKey, type TileRef } from './pyramid';
import type { PyramidManifest, TileStoreBackend } from './tileStore';

/**
 * The tile cache in IndexedDB, one database per vault and device. It runs in
 * the tile worker, so it takes its `IDBFactory` from the caller and imports
 * nothing of Obsidian.
 *
 * Stores: `manifests` (key: hash), `tiles` (key: [hash, level, col, row], so
 * a pyramid is one key range), `identities` (key: `path|size|mtime` → hash).
 */

const DB_VERSION = 1;
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

  async putTiles(hash: string, tiles: Array<{ ref: TileRef; bytes: Blob }>): Promise<void> {
    await this.write([TILES], (tx) => {
      const store = tx.objectStore(TILES);
      for (const tile of tiles) store.put(tile.bytes, storeKey(hash, tile.ref));
    });
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

  async getIdentity(key: string): Promise<string | null> {
    const value = await this.read<unknown>(IDENTITIES, (store) => store.get(key));
    return typeof value === 'string' ? value : null;
  }

  async putIdentity(key: string, hash: string): Promise<void> {
    await this.write([IDENTITIES], (tx) => tx.objectStore(IDENTITIES).put(hash, key));
  }

  async clear(): Promise<void> {
    await this.write(ALL_STORES, (tx) => {
      for (const name of ALL_STORES) tx.objectStore(name).clear();
    });
  }

  /** Closes the connection; the next call opens it again. */
  async close(): Promise<void> {
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
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) db.createObjectStore(MANIFESTS, { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(TILES)) db.createObjectStore(TILES);
      if (!db.objectStoreNames.contains(IDENTITIES)) db.createObjectStore(IDENTITIES);
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
