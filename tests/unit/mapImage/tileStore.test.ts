import { describe, expect, it } from 'vitest';
import { MemoryTileBackend } from '../../../src/app/pixi/mapImage/memoryTileBackend';
import { TILE_SPEC, type TileRef } from '../../../src/app/pixi/mapImage/pyramid';
import {
  TILE_CACHE_MAX_BYTES,
  TileStore,
  tileCacheBudget,
  type PyramidSpec,
  type StoredTile,
} from '../../../src/app/pixi/mapImage/tileStore';

const GIB = 1024 ** 3;

interface Harness {
  store: TileStore;
  backend: MemoryTileBackend;
  clock: { time: number };
}

function harness(quota: number | null = null): Harness {
  const backend = new MemoryTileBackend();
  const clock = { time: 1000 };
  const store = new TileStore({ backend, estimateQuota: () => Promise.resolve(quota), now: () => clock.time });
  return { store, backend, clock };
}

function source(hash: string): PyramidSpec {
  return { hash, width: 2000, height: 1000, decodedScale: 1 };
}

function tile(level: number, col: number, row: number, size: number): StoredTile {
  const ref: TileRef = { level, col, row };
  return { ref, bytes: new Blob([new Uint8Array(size)]) };
}

async function completePyramid(h: Harness, hash: string, bytes: number, lastUsed: number): Promise<void> {
  h.clock.time = lastUsed;
  await h.store.beginPyramid(source(hash));
  await h.store.writeTiles(hash, [tile(0, 0, 0, bytes)]);
  await h.backend.putManifest({ ...(await h.backend.getManifest(hash))!, complete: true });
}

describe('TileStore', () => {
  it('maps a path, size and modification time to a hash', async () => {
    const { store, backend } = harness();
    expect(await store.lookupIdentity('maps/a.webp', 10, 5)).toBeNull();
    await store.rememberIdentity('maps/a.webp', 10, 5, 'abc');
    expect(await store.lookupIdentity('maps/a.webp', 10, 5)).toBe('abc');
    expect(await store.lookupIdentity('maps/a.webp', 11, 5)).toBeNull();
    expect(await backend.getIdentity('maps/a.webp')).toEqual({ path: 'maps/a.webp', size: 10, mtime: 5, hash: 'abc' });
  });

  it('treats a manifest of another spec as absent and deletes its pyramid', async () => {
    const { store, backend } = harness();
    await backend.putManifest({ ...source('old'), spec: TILE_SPEC + 1, complete: true, bytes: 4, lastUsed: 0 });
    await backend.writeTiles('old', [tile(0, 0, 0, 4)], (stored) => stored);
    expect(await store.readManifest('old')).toBeNull();
    expect(await backend.getManifest('old')).toBeNull();
    expect((await backend.hasTiles('old')).size).toBe(0);
  });

  it('starts an empty incomplete pyramid and accumulates the bytes of each batch', async () => {
    const { store, clock } = harness();
    const begun = await store.beginPyramid(source('h'));
    expect(begun).toMatchObject({ hash: 'h', spec: TILE_SPEC, complete: false, bytes: 0, lastUsed: 1000 });
    clock.time = 2000;
    expect(await store.writeTiles('h', [tile(1, 0, 0, 10), tile(1, 1, 0, 20)])).toBe(true);
    expect(await store.writeTiles('h', [tile(0, 0, 0, 5)])).toBe(true);
    const manifest = await store.readManifest('h');
    expect(manifest).toMatchObject({ bytes: 35, complete: false, lastUsed: 2000 });
    expect((await store.getTile('h', { level: 1, col: 1, row: 0 }))?.size).toBe(20);
  });

  it('keeps every byte when batches are written concurrently', async () => {
    const { store } = harness();
    await store.beginPyramid(source('h'));
    await Promise.all([1, 2, 3, 4].map((n) => store.writeTiles('h', [tile(0, n, 0, n)])));
    expect((await store.readManifest('h'))?.bytes).toBe(10);
  });

  it('marks a pyramid complete only on request', async () => {
    const { store } = harness();
    await store.beginPyramid(source('h'));
    await store.writeTiles('h', [tile(0, 0, 0, 1)]);
    expect((await store.readManifest('h'))?.complete).toBe(false);
    expect(await store.markComplete('h')).toBe(true);
    expect((await store.readManifest('h'))?.complete).toBe(true);
  });

  it('resumes an incomplete pyramid with the tiles it already holds', async () => {
    const { store } = harness();
    await store.beginPyramid(source('h'));
    await store.writeTiles('h', [tile(2, 0, 0, 3), tile(1, 1, 0, 4)]);
    const resumed = await store.beginPyramid(source('h'));
    expect(resumed).toMatchObject({ complete: false, bytes: 7 });
    expect(await store.existingTiles('h')).toEqual(new Set(['2/0/0', '1/1/0']));
  });

  it('starts over when the stored pyramid was built from another decoded size', async () => {
    const { store } = harness();
    await store.beginPyramid(source('h'));
    await store.writeTiles('h', [tile(0, 0, 0, 3)]);
    const rebuilt = await store.beginPyramid({ ...source('h'), decodedScale: 2 });
    expect(rebuilt).toMatchObject({ bytes: 0, decodedScale: 2 });
    expect((await store.existingTiles('h')).size).toBe(0);
  });

  it('writes nothing for a pyramid that is gone', async () => {
    const { store, backend } = harness();
    expect(await store.writeTiles('missing', [tile(0, 0, 0, 1)])).toBe(false);
    expect(await store.markComplete('missing')).toBe(false);
    expect((await backend.hasTiles('missing')).size).toBe(0);
  });

  it('records a use with touch', async () => {
    const { store, clock } = harness();
    await store.beginPyramid(source('h'));
    clock.time = 5000;
    await store.touch('h');
    expect((await store.readManifest('h'))?.lastUsed).toBe(5000);
    await store.touch('missing');
    expect(await store.readManifest('missing')).toBeNull();
  });

  it('budgets the smaller of 2 GiB and a tenth of the quota', () => {
    expect(tileCacheBudget(null)).toBe(TILE_CACHE_MAX_BYTES);
    expect(tileCacheBudget(0)).toBe(TILE_CACHE_MAX_BYTES);
    expect(tileCacheBudget(100 * GIB)).toBe(2 * GIB);
    expect(tileCacheBudget(10_000)).toBe(1000);
  });

  it('reads the budget as 2 GiB when the quota cannot be estimated', async () => {
    const store = new TileStore({ backend: new MemoryTileBackend(), estimateQuota: () => Promise.reject(new Error('no')) });
    expect(await store.budget()).toBe(TILE_CACHE_MAX_BYTES);
  });

  it('evicts whole pyramids, least recently used first, until the cache fits', async () => {
    const h = harness(500);
    await completePyramid(h, 'a', 40, 1);
    await completePyramid(h, 'b', 40, 3);
    await completePyramid(h, 'c', 40, 2);
    expect(await h.store.totalBytes()).toBe(120);
    expect(await h.store.evict()).toEqual(['a', 'c']);
    expect(await h.store.totalBytes()).toBe(40);
    expect((await h.backend.hasTiles('a')).size).toBe(0);
    expect(await h.store.readManifest('b')).not.toBeNull();
  });

  it('never evicts a pinned pyramid, and pins are counted', async () => {
    const h = harness(500);
    await completePyramid(h, 'old', 40, 1);
    await completePyramid(h, 'new', 40, 2);
    h.store.pin('old');
    h.store.pin('old');
    h.store.pin('new');
    expect(await h.store.evict()).toEqual([]);
    h.store.unpin('old');
    expect(h.store.isPinned('old')).toBe(true);
    expect(await h.store.evict()).toEqual([]);
    h.store.unpin('old');
    expect(h.store.isPinned('old')).toBe(false);
    expect(await h.store.evict()).toEqual(['old']);
  });

  it('evicts once a build completes, keeping the pinned build', async () => {
    const h = harness(500);
    await completePyramid(h, 'old', 30, 1);
    h.clock.time = 10;
    h.store.pin('built');
    await h.store.beginPyramid(source('built'));
    await h.store.writeTiles('built', [tile(0, 0, 0, 40)]);
    expect(await h.store.totalBytes()).toBe(70);
    await h.store.markComplete('built');
    expect(await h.store.readManifest('old')).toBeNull();
    expect(await h.store.readManifest('built')).toMatchObject({ complete: true, bytes: 40 });
  });

  it('clears pyramids and identities when nothing is pinned, and a lost build stops writing', async () => {
    const { store, backend } = harness();
    await store.rememberIdentity('a.png', 1, 1, 'h');
    await store.beginPyramid(source('h'));
    await store.writeTiles('h', [tile(0, 0, 0, 8)]);
    expect(await store.clear()).toBe(0);
    expect(await store.totalBytes()).toBe(0);
    expect(await store.lookupIdentity('a.png', 1, 1)).toBeNull();
    expect(await store.writeTiles('h', [tile(0, 1, 0, 8)])).toBe(false);
    expect((await backend.hasTiles('h')).size).toBe(0);
  });

  it('keeps pinned pyramids when clearing and reports what they take', async () => {
    const h = harness();
    await completePyramid(h, 'open', 30, 1);
    await completePyramid(h, 'closed', 50, 2);
    await h.store.rememberIdentity('open.png', 1, 1, 'open');
    h.store.pin('open');
    expect(await h.store.clear()).toBe(30);
    expect(await h.store.readManifest('open')).toMatchObject({ complete: true, bytes: 30 });
    expect(await h.store.readManifest('closed')).toBeNull();
    expect((await h.backend.hasTiles('closed')).size).toBe(0);
    expect(await h.store.lookupIdentity('open.png', 1, 1)).toBe('open');
    expect(await h.store.writeTiles('open', [tile(0, 1, 0, 5)])).toBe(true);
  });

  it('keeps one identity per path, the latest', async () => {
    const { store } = harness();
    await store.rememberIdentity('maps/a.webp', 10, 5, 'first');
    await store.rememberIdentity('maps/a.webp', 12, 6, 'edited');

    expect(await store.lookupIdentity('maps/a.webp', 10, 5)).toBeNull();
    expect(await store.lookupIdentity('maps/a.webp', 12, 6)).toBe('edited');
  });

  it('drops the identities of the pyramids it evicts or clears, and keeps those of pinned ones', async () => {
    // A quota of 1000 gives a budget of 100.
    const h = harness(1000);
    await completePyramid(h, 'old', 80, 1);
    await completePyramid(h, 'kept', 60, 2);
    await h.store.rememberIdentity('old.png', 1, 1, 'old');
    await h.store.rememberIdentity('kept.png', 1, 1, 'kept');
    await h.store.rememberIdentity('opening.png', 1, 1, 'opening');
    h.store.pin('opening');

    expect(await h.store.evict()).toEqual(['old']);
    expect(await h.store.lookupIdentity('old.png', 1, 1)).toBeNull();
    expect(await h.store.lookupIdentity('kept.png', 1, 1)).toBe('kept');
    expect(await h.store.lookupIdentity('opening.png', 1, 1)).toBe('opening');

    expect(await h.store.clear()).toBe(0);
    expect(await h.store.lookupIdentity('kept.png', 1, 1)).toBeNull();
    expect(await h.store.lookupIdentity('opening.png', 1, 1)).toBe('opening');
  });

  it('never leaves tiles the manifest does not count when the worker dies between writes', async () => {
    const h = harness();
    await h.store.beginPyramid(source('a'));
    // The backend's first write of the batch lands; the worker dies before anything else is written.
    let writes = 0;
    const dies = <T>(write: () => Promise<T>): Promise<T> => (++writes > 1 ? Promise.reject(new Error('worker died')) : write());
    const backend = h.backend as unknown as Record<string, (...args: never[]) => Promise<unknown>>;
    for (const name of ['putTiles', 'putManifest', 'writeTiles'] as const) {
      const original = backend[name]?.bind(h.backend);
      if (original) backend[name] = (...args: never[]) => dies(() => original(...args));
    }

    await h.store.writeTiles('a', [tile(0, 0, 0, 7), tile(0, 1, 0, 9)]).catch(() => false);

    const stored = (await h.backend.hasTiles('a')).size;
    const counted = (await h.backend.getManifest('a'))!.bytes;
    expect({ stored, counted }).toEqual({ stored: 2, counted: 16 });
  });
});
