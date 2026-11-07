import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODEC_VERSION, OpusCache, opusCacheBudget, opusCacheDatabaseName } from '@/app/sound/codec/opusCache';
import type { SoundRecord } from '@/app/sound/soundTypes';
import { SoundCopies, type CopyMaker } from '@/app/soundDirector/soundCopies';

const copy = (bytes: number): { bytes: Blob; frames: number; channels: number; lufs: number; truePeakDb: number } => ({ bytes: new Blob([new Uint8Array(bytes).fill(7)]), frames: 480, channels: 2, lufs: -20, truePeakDb: -3 });

describe('the Opus cache', () => {
  const opened: OpusCache[] = [];
  let clock = 1_000_000;
  let names = 0;

  function cache(budget: number): OpusCache {
    const made = new OpusCache(indexedDB, opusCacheDatabaseName(`test-${Date.now()}-${names++}`), () => budget, () => clock);
    opened.push(made);
    return made;
  }

  afterEach(async () => {
    for (const made of opened.splice(0)) {
      await made.clear();
      await made.close();
    }
  });

  it('keeps a copy and reads ranges of it', async () => {
    const store = cache(1 << 20);
    await store.put('h1', { ...copy(0), bytes: new Blob([Uint8Array.of(1, 2, 3, 4, 5)]) });
    const bytes = await store.bytes('h1');
    expect(bytes?.byteLength).toBe(5);
    expect([...((await bytes?.read(1, 4)) ?? [])]).toEqual([2, 3, 4]);
    expect(await store.bytes('nothing')).toBeNull();
    expect((await store.get('h1'))?.lufs).toBe(-20);
  });

  it('keeps loudness a silent sound lacks', async () => {
    const store = cache(1 << 20);
    await store.put('quiet', { ...copy(4), lufs: -Infinity, truePeakDb: -Infinity });
    expect((await store.get('quiet'))?.lufs).toBe(-Infinity);
  });

  it('remembers a file by path, size and time', async () => {
    const store = cache(1 << 20);
    await store.remember({ path: 'a.mp3', size: 10, mtime: 5, hash: 'h1' });
    expect(await store.hashOf('a.mp3', 10, 5)).toBe('h1');
    expect(await store.hashOf('a.mp3', 11, 5)).toBeNull();
    expect(await store.hashOf('a.mp3', 10, 6)).toBeNull();
    expect(await store.hashOf('b.mp3', 10, 5)).toBeNull();
    await store.remember({ path: 'a.mp3', size: 12, mtime: 7, hash: 'h2' });
    expect(await store.hashOf('a.mp3', 12, 7)).toBe('h2');
  });

  it('evicts the least recently used, whole, under its budget', async () => {
    const store = cache(250);
    await store.put('old', copy(100));
    clock += 10 * 60_000;
    await store.put('middle', copy(100));
    clock += 10 * 60_000;
    await store.bytes('old');
    clock += 10 * 60_000;
    await store.put('new', copy(100));
    expect(await store.bytes('middle')).toBeNull();
    expect(await store.get('middle')).toBeNull();
    expect(await store.bytes('old')).not.toBeNull();
    expect(await store.bytes('new')).not.toBeNull();
  });

  it('never evicts what plays or what was just stored', async () => {
    const store = cache(150);
    store.pin('playing');
    await store.put('playing', copy(100));
    clock += 60_000;
    await store.put('other', copy(100));
    clock += 60_000;
    await store.put('huge', copy(1000));
    expect(await store.get('playing')).not.toBeNull();
    expect(await store.get('huge')).not.toBeNull();
    expect(await store.get('other')).toBeNull();
    store.unpin('playing');
    clock += 60_000;
    await store.put('more', copy(10));
    expect(await store.get('playing')).toBeNull();
  });

  describe('a copy of another codec version', () => {
    /** Puts a copy as older code wrote it: without a version, or with another one. */
    async function writtenBefore(databaseName: string, hash: string, codec?: number): Promise<void> {
      const request = indexedDB.open(databaseName);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = (): void => resolve(request.result);
        request.onerror = (): void => reject(request.error ?? new Error('open failed'));
      });
      const tx = db.transaction(['sounds', 'bytes'], 'readwrite');
      tx.objectStore('sounds').put({ hash, byteLength: 100, frames: 480, channels: 2, lufs: -20, truePeakDb: -3, lastUsed: clock, ...(codec !== undefined && { codec }) });
      tx.objectStore('bytes').put(new Blob([new Uint8Array(100)]), hash);
      await new Promise((resolve) => { tx.oncomplete = resolve; });
      db.close();
    }

    function named(budget: number): { store: OpusCache; databaseName: string } {
      const databaseName = opusCacheDatabaseName(`test-${Date.now()}-${names++}`);
      const store = new OpusCache(indexedDB, databaseName, () => budget, () => clock);
      opened.push(store);
      return { store, databaseName };
    }

    it('is absent to whoever asks, and a new copy takes its place', async () => {
      const { store, databaseName } = named(1 << 20);
      await store.put('warm', copy(4));
      await writtenBefore(databaseName, 'old');
      await writtenBefore(databaseName, 'other', CODEC_VERSION + 1);
      for (const hash of ['old', 'other']) {
        expect(await store.get(hash)).toBeNull();
        expect(await store.bytes(hash)).toBeNull();
        expect(await store.blob(hash)).toBeNull();
      }
      await store.put('old', copy(7));
      expect((await store.get('old'))?.codec).toBe(CODEC_VERSION);
      expect((await store.bytes('old'))?.byteLength).toBe(7);
    });

    it('makes the director convert the file again', async () => {
      const { store, databaseName } = named(1 << 20);
      await store.remember({ path: 'a.ogg', size: 5, mtime: 1, hash: 'source' });
      await writtenBefore(databaseName, 'source');
      const run = vi.fn(async () => ({ ...copy(9), durationSeconds: 0.01 }));
      const copies = new SoundCopies(
        { statOf: () => ({ size: 5, mtime: 1 }), read: async () => new Blob(['AUDIO']) },
        store,
        { run: run as unknown as CopyMaker['run'] },
        async (source) => ({ hash: 'source', source: source as Blob }),
        () => undefined,
        async () => new Uint8Array(1),
      );
      const record = { id: 's', name: 'A', kind: 'music', filePath: 'a.ogg' } as SoundRecord;
      copies.stateOf(record);
      await vi.waitFor(async () => expect(await store.hashOf('a.ogg', 5, 1)).toBe('source'));
      copies.request([record]);
      await vi.waitFor(() => expect(copies.stateOf(record).state).toBe('ready'));
      expect(run).toHaveBeenCalledTimes(1);
      expect((await store.bytes('source'))?.byteLength).toBe(9);
      copies.dispose();
    });

    it('holds no room past the next eviction, even with room to spare', async () => {
      const { store, databaseName } = named(1 << 20);
      await store.put('warm', copy(4));
      await writtenBefore(databaseName, 'stale');
      expect((await store.list()).map((sound) => sound.hash).sort()).toEqual(['stale', 'warm']);
      await store.put('next', copy(4));
      expect((await store.list()).map((sound) => sound.hash).sort()).toEqual(['next', 'warm']);
    });

    it('is left alone while it plays', async () => {
      const { store, databaseName } = named(1 << 20);
      await store.put('warm', copy(4));
      await writtenBefore(databaseName, 'stale');
      store.pin('stale');
      await store.put('next', copy(4));
      expect((await store.list()).map((sound) => sound.hash)).toContain('stale');
    });
  });

  it('asks the browser for its budget, within a limit', async () => {
    expect(await opusCacheBudget({ estimate: () => Promise.resolve({ quota: 1000 }) })).toBe(200);
    expect(await opusCacheBudget({ estimate: () => Promise.resolve({ quota: 1e15 }) })).toBe(4 * 1024 ** 3);
    expect(await opusCacheBudget({ estimate: () => Promise.reject(new Error('no')) })).toBe(4 * 1024 ** 3);
  });
});
