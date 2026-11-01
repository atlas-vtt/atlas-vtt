import { afterEach, describe, expect, it } from 'vitest';
import { OpusCache, opusCacheBudget, opusCacheDatabaseName } from '@/app/sound/codec/opusCache';

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

  it('asks the browser for its budget, within a limit', async () => {
    expect(await opusCacheBudget({ estimate: () => Promise.resolve({ quota: 1000 }) })).toBe(200);
    expect(await opusCacheBudget({ estimate: () => Promise.resolve({ quota: 1e15 }) })).toBe(4 * 1024 ** 3);
    expect(await opusCacheBudget({ estimate: () => Promise.reject(new Error('no')) })).toBe(4 * 1024 ** 3);
  });
});
