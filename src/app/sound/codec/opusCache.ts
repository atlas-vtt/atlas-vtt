import { committed, request } from '../../utils/indexedDbPromises';
import type { SoundBytes } from '../soundTypes';

/**
 * The converted copies of a vault's sounds on this device, in IndexedDB: never in the vault, as a copy is
 * something every device can make from the file. Keyed by the source file's hash; `path|size|mtime` is
 * remembered so an unchanged file need not be hashed again. Takes its `IDBFactory` from the caller, so it
 * runs anywhere and imports nothing of Obsidian.
 *
 * Stores: `sounds` (what is known of a copy), `bytes` (the copy, one Blob, so a range read touches only its
 * range), `identities` (key: the file's path, one record per path).
 */

/**
 * Raise this whenever conversion gives other bytes for the same file (a new loop wrap, another encoder
 * setting). A copy of another version counts as absent, so its file is converted again, and what it holds
 * goes at the next eviction: it can never be read again.
 */
export const CODEC_VERSION = 1;

const DB_VERSION = 1;
const SOUNDS = 'sounds';
const BYTES = 'bytes';
const IDENTITIES = 'identities';
const ALL_STORES = [SOUNDS, BYTES, IDENTITIES];
const WRITE_OPTIONS: IDBTransactionOptions = { durability: 'relaxed' };
/** A library is worth more room than map tiles: a copy takes long to make, and takes no time to keep. */
const MAX_BUDGET_BYTES = 4 * 1024 ** 3;
const QUOTA_SHARE = 0.2;
const USE_RECORD_MS = 60_000;

export interface CachedSound {
  hash: string;
  byteLength: number;
  frames: number;
  channels: number;
  lufs: number;
  truePeakDb: number;
  lastUsed: number;
  /** The `CODEC_VERSION` that made the copy; a copy made before versions were kept has none. */
  codec?: number;
  /** How the sound goes over its length, once worked out (`soundPeaks`). */
  peaks?: Uint8Array<ArrayBuffer>;
}

export interface SoundIdentity {
  path: string;
  size: number;
  mtime: number;
  hash: string;
}

/** The room copies may take on a device. */
export async function opusCacheBudget(storage: Pick<StorageManager, 'estimate'>): Promise<number> {
  const { quota } = await storage.estimate().catch(() => ({ quota: undefined }));
  return quota ? Math.min(MAX_BUDGET_BYTES, quota * QUOTA_SHARE) : MAX_BUDGET_BYTES;
}

export function opusCacheDatabaseName(appId: string): string {
  return `atlas-vtt-sound-copies-${appId}`;
}

function isCachedSound(value: unknown): value is CachedSound {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  // Loudness may be -Infinity, which IndexedDB keeps; these only have to be numbers.
  return typeof v.hash === 'string' && typeof v.byteLength === 'number' && typeof v.frames === 'number' && typeof v.channels === 'number' && typeof v.lufs === 'number' && typeof v.truePeakDb === 'number' && typeof v.lastUsed === 'number';
}

function isIdentity(value: unknown): value is SoundIdentity {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.path === 'string' && typeof v.size === 'number' && typeof v.mtime === 'number' && typeof v.hash === 'string';
}

export class OpusCache {
  private connection: Promise<IDBDatabase> | null = null;
  private closed = false;
  /** Sounds playing: never evicted under them. */
  private readonly pinned = new Map<string, number>();

  constructor(
    private readonly factory: IDBFactory,
    private readonly name: string,
    private readonly budgetBytes: () => Promise<number> | number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(hash: string): Promise<CachedSound | null> {
    const value = await this.read<unknown>(SOUNDS, (store) => store.get(hash));
    return isCachedSound(value) && value.codec === CODEC_VERSION ? value : null;
  }

  /** Stores a copy and makes room for it. A copy larger than the whole budget is still kept while it is the newest. */
  async put(hash: string, copy: { bytes: Blob; frames: number; channels: number; lufs: number; truePeakDb: number }): Promise<void> {
    const record: CachedSound = { hash, byteLength: copy.bytes.size, frames: copy.frames, channels: copy.channels, lufs: copy.lufs, truePeakDb: copy.truePeakDb, lastUsed: this.now(), codec: CODEC_VERSION };
    await this.write([SOUNDS, BYTES], (tx) => {
      tx.objectStore(SOUNDS).put(record);
      tx.objectStore(BYTES).put(copy.bytes, hash);
    });
    await this.evict(hash);
  }

  /** The copy to play or upload from. Null when it is not here. */
  async bytes(hash: string): Promise<SoundBytes | null> {
    const value = await this.blob(hash);
    if (!value) return null;
    await this.touch(hash);
    return {
      byteLength: value.size,
      read: async (start, end) => new Uint8Array(await value.slice(start, end).arrayBuffer()),
    };
  }

  /** The copy whole, as a file that can go to a worker. */
  async blob(hash: string): Promise<Blob | null> {
    if (!(await this.get(hash))) return null;
    const value = await this.read<unknown>(BYTES, (store) => store.get(hash));
    return value instanceof Blob ? value : null;
  }

  /** Keeps a copy's waveform with what is known of it. */
  async setPeaks(hash: string, peaks: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.updateRecord(hash, (sound) => ({ ...sound, peaks }));
  }

  pin(hash: string): void {
    this.pinned.set(hash, (this.pinned.get(hash) ?? 0) + 1);
  }

  unpin(hash: string): void {
    const count = (this.pinned.get(hash) ?? 0) - 1;
    if (count > 0) this.pinned.set(hash, count);
    else this.pinned.delete(hash);
  }

  /** The hash remembered for a file, if it has not changed since. */
  async hashOf(path: string, size: number, mtime: number): Promise<string | null> {
    const value = await this.read<unknown>(IDENTITIES, (store) => store.get(path));
    return isIdentity(value) && value.size === size && value.mtime === mtime ? value.hash : null;
  }

  async remember(identity: SoundIdentity): Promise<void> {
    await this.write([IDENTITIES], (tx) => tx.objectStore(IDENTITIES).put(identity));
  }

  async delete(hash: string): Promise<void> {
    await this.write([SOUNDS, BYTES], (tx) => {
      tx.objectStore(SOUNDS).delete(hash);
      tx.objectStore(BYTES).delete(hash);
    });
  }

  async list(): Promise<CachedSound[]> {
    const values = await this.read<unknown[]>(SOUNDS, (store) => store.getAll());
    return values.filter(isCachedSound);
  }

  async clear(): Promise<void> {
    await this.write(ALL_STORES, (tx) => {
      for (const store of ALL_STORES) tx.objectStore(store).clear();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.then((db) => db.close(), () => undefined);
  }

  private async touch(hash: string): Promise<void> {
    await this.updateRecord(hash, (sound) => (this.now() - sound.lastUsed >= USE_RECORD_MS ? { ...sound, lastUsed: this.now() } : null));
  }

  /** What is known of a copy, changed in one transaction; `change` answers null to leave it. */
  private async updateRecord(hash: string, change: (sound: CachedSound) => CachedSound | null): Promise<void> {
    await this.write([SOUNDS], (tx) => {
      const store = tx.objectStore(SOUNDS);
      const read = store.get(hash);
      read.onsuccess = (): void => {
        const value: unknown = read.result;
        const changed = isCachedSound(value) ? change(value) : null;
        if (changed) store.put(changed);
      };
    });
  }

  /** Copies of another version first, whatever the room, then the least recently used, whole copies, never one that plays or the one just stored. */
  private async evict(keep: string): Promise<void> {
    const budget = await this.budgetBytes();
    const sounds: CachedSound[] = [];
    for (const sound of await this.list()) {
      if (sound.codec === CODEC_VERSION || this.pinned.has(sound.hash)) sounds.push(sound);
      else await this.delete(sound.hash);
    }
    let used = sounds.reduce((sum, sound) => sum + sound.byteLength, 0);
    if (used <= budget) return;
    for (const sound of sounds.sort((a, b) => a.lastUsed - b.lastUsed)) {
      if (used <= budget) return;
      if (sound.hash === keep || this.pinned.has(sound.hash)) continue;
      await this.delete(sound.hash);
      used -= sound.byteLength;
    }
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
    if (this.closed) return Promise.reject(new Error('The sound copies are closed.'));
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
      if (!db.objectStoreNames.contains(SOUNDS)) db.createObjectStore(SOUNDS, { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(BYTES)) db.createObjectStore(BYTES);
      if (!db.objectStoreNames.contains(IDENTITIES)) db.createObjectStore(IDENTITIES, { keyPath: 'path' });
    };
    const db = await request(req);
    db.onversionchange = (): void => {
      db.close();
      lost();
    };
    db.onclose = lost;
    return db;
  }
}
