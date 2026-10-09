import { afterEach, describe, expect, it } from 'vitest';
import {
  IndexedDbTileBackend,
  indexedDbTileBackend,
  tileDatabaseName,
} from '../../src/app/pixi/mapImage/indexedDbTileBackend';
import { TILE_SPEC } from '../../src/app/pixi/mapImage/pyramid';
import type { PyramidManifest } from '../../src/app/pixi/mapImage/tileStore';

const APP_ID = `tile-backend-test-${Date.now()}`;
const opened: IndexedDbTileBackend[] = [];

function backend(): IndexedDbTileBackend {
  const created = indexedDbTileBackend(APP_ID, indexedDB);
  opened.push(created);
  return created;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = (): void => resolve();
    req.onerror = (): void => reject(req.error ?? new Error('delete failed'));
  });
}

function manifest(hash: string, bytes: number): PyramidManifest {
  return { hash, spec: TILE_SPEC, width: 1200, height: 800, decodedScale: 1, complete: false, bytes, lastUsed: 7 };
}

function bytes(...values: number[]): Blob {
  return new Blob([new Uint8Array(values)], { type: 'image/webp' });
}

/** Stores tiles with the manifest as it is, as a build's batch does with its byte count. */
function putTiles(store: IndexedDbTileBackend, hash: string, tiles: Array<{ ref: { level: number; col: number; row: number }; bytes: Blob }>): Promise<boolean> {
  return store.writeTiles(hash, tiles, (stored) => stored);
}

async function text(blob: Blob | null): Promise<number[]> {
  return blob ? [...new Uint8Array(await blob.arrayBuffer())] : [];
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((b) => b.close()));
  await deleteDatabase(tileDatabaseName(APP_ID));
});

describe('IndexedDbTileBackend', () => {
  it('stores manifests, tiles and identities in the vault database', async () => {
    const store = backend();
    await store.putManifest(manifest('a', 3));
    await putTiles(store, 'a', [
      { ref: { level: 0, col: 0, row: 0 }, bytes: bytes(1, 2) },
      { ref: { level: 1, col: 2, row: 3 }, bytes: bytes(9) },
    ]);
    await store.putIdentity({ path: 'maps/a.png', size: 10, mtime: 20, hash: 'a' });

    expect(await store.getManifest('a')).toEqual(manifest('a', 3));
    expect(await store.getManifest('missing')).toBeNull();
    expect(await text(await store.getTile('a', { level: 1, col: 2, row: 3 }))).toEqual([9]);
    expect(await store.getTile('a', { level: 1, col: 0, row: 0 })).toBeNull();
    expect(await store.hasTiles('a')).toEqual(new Set(['0/0/0', '1/2/3']));
    expect(await store.getIdentity('maps/a.png')).toEqual({ path: 'maps/a.png', size: 10, mtime: 20, hash: 'a' });
    expect(await store.getIdentity('maps/b.png')).toBeNull();

    const names = (await indexedDB.databases()).map((db) => db.name);
    expect(names).toContain(`atlas-vtt-map-tiles-${APP_ID}`);
  });

  it('keeps what it stored across connections', async () => {
    const first = backend();
    await first.putManifest(manifest('a', 1));
    await putTiles(first, 'a', [{ ref: { level: 0, col: 1, row: 1 }, bytes: bytes(5) }]);
    await first.close();
    const second = backend();
    expect(await second.listManifests()).toEqual([manifest('a', 1)]);
    expect(await text(await second.getTile('a', { level: 0, col: 1, row: 1 }))).toEqual([5]);
  });

  it('deletes one pyramid by its key range and leaves the others', async () => {
    const store = backend();
    for (const hash of ['a', 'ab', 'b']) {
      await store.putManifest(manifest(hash, 1));
      await putTiles(store, hash, [
        { ref: { level: 0, col: 0, row: 0 }, bytes: bytes(1) },
        { ref: { level: 3, col: 12, row: 40 }, bytes: bytes(2) },
      ]);
    }
    await store.deletePyramid('a');

    expect(await store.getManifest('a')).toBeNull();
    expect((await store.hasTiles('a')).size).toBe(0);
    expect(await store.hasTiles('ab')).toEqual(new Set(['0/0/0', '3/12/40']));
    expect(await store.hasTiles('b')).toEqual(new Set(['0/0/0', '3/12/40']));
    expect((await store.listManifests()).map((m) => m.hash).sort()).toEqual(['ab', 'b']);
  });

  it('clears every store', async () => {
    const store = backend();
    await store.putManifest(manifest('a', 1));
    await putTiles(store, 'a', [{ ref: { level: 0, col: 0, row: 0 }, bytes: bytes(1) }]);
    await store.putIdentity({ path: 'k', size: 1, mtime: 1, hash: 'a' });
    await store.clear();

    expect(await store.listManifests()).toEqual([]);
    expect((await store.hasTiles('a')).size).toBe(0);
    expect(await store.getIdentity('k')).toBeNull();
  });

  it('writes tiles and the manifest that counts them in one transaction', async () => {
    const store = backend();
    await store.putManifest(manifest('a', 3));
    const tiles = [{ ref: { level: 0, col: 0, row: 0 }, bytes: bytes(1, 2) }];

    expect(await store.writeTiles('a', tiles, (stored) => (stored ? { ...stored, bytes: stored.bytes + 2 } : null))).toBe(true);
    expect(await store.getManifest('a')).toEqual(manifest('a', 5));

    // An update that fails takes the tiles of its batch with it.
    const failing = store.writeTiles('a', [{ ref: { level: 1, col: 0, row: 0 }, bytes: bytes(7) }], () => {
      throw new Error('cannot count');
    });
    await expect(failing).rejects.toBeTruthy();
    expect(await store.hasTiles('a')).toEqual(new Set(['0/0/0']));
    // A pyramid that is gone stores nothing.
    expect(await store.writeTiles('gone', tiles, (stored) => stored)).toBe(false);
    expect((await store.hasTiles('gone')).size).toBe(0);
  });

  it('keeps one identity per path and prunes those of pyramids that are gone', async () => {
    const store = backend();
    await store.putIdentity({ path: 'a.png', size: 1, mtime: 1, hash: 'a' });
    await store.putIdentity({ path: 'a.png', size: 2, mtime: 2, hash: 'a2' });
    await store.putIdentity({ path: 'b.png', size: 1, mtime: 1, hash: 'b' });
    await store.pruneIdentities(new Set(['a2']));

    expect(await store.getIdentity('a.png')).toEqual({ path: 'a.png', size: 2, mtime: 2, hash: 'a2' });
    expect(await store.getIdentity('b.png')).toBeNull();
  });

  it('stays closed once closed', async () => {
    const store = backend();
    await store.putManifest(manifest('a', 1));
    await store.close();
    await expect(store.listManifests()).rejects.toThrow(/closed/);
  });

  it('closes for a deletion from elsewhere and reopens on the next call', async () => {
    const store = backend();
    await store.putIdentity({ path: 'k', size: 1, mtime: 1, hash: 'a' });
    await deleteDatabase(tileDatabaseName(APP_ID));
    expect(await store.getIdentity('k')).toBeNull();
    await store.putIdentity({ path: 'k', size: 1, mtime: 1, hash: 'b' });
    expect(await store.getIdentity('k')).toMatchObject({ hash: 'b' });
  });
});
