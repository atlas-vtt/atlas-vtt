import { describe, expect, it } from 'vitest';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import { pyramidKey } from '../../../../src/app/online/gm/assets/assetRefs.ts';
import { pyramidBound } from '../../../../src/app/online/gm/assets/pyramidPlan.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import { publisherHarness, SALT, type PublisherHarness } from './fakeAssetStore.ts';
import { pngOf } from './fakeTileCache.ts';

const PATH = 'maps/keep.png';

/** A publisher whose vault holds a 3000 × 2000 map; its cache holds what `add` says. */
async function withMap(add: (store: PublisherHarness, hash: string) => void): Promise<{ store: PublisherHarness; hash: string; bytes: Uint8Array<ArrayBuffer> }> {
  const store = publisherHarness();
  const bytes = pngOf(3000, 2000);
  store.files.set(PATH, bytes);
  const hash = await sha256Hex(bytes);
  add(store, hash);
  return { store, hash, bytes };
}

describe('a map\'s pyramid', () => {
  it('goes up where the image was turned by its EXIF data, with the sides it was built with', async () => {
    const { store, bytes } = await withMap((store, hash) => store.cache.add(PATH, hash, 2000, 3000));
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(5000);
    expect(ref.tiles).toBe(true);
    expect(store.withdrawn).toBe(0);
    expect(store.client.batches[0]?.text).toContain('{"width":2000,"height":3000,');
    expect(store.client.batches).toHaveLength(4);
  });

  it('is handed again under the new hash where the file changed between hashing and building', async () => {
    const { store, hash, bytes } = await withMap((store) => store.cache.add(PATH, 'f'.repeat(64), 3000, 2000));
    const first = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    expect(first.id).toBe(await assetIdOf(SALT, pyramidKey(hash, 2)));
    await store.advance(1000);
    expect(store.withdrawn).toBe(1);
    // What handed it reads the file again, as it is now.
    const changed = pngOf(3000, 2000, 2);
    const newHash = await sha256Hex(changed);
    store.files.set(PATH, changed);
    store.stats.set(PATH, { mtime: 2, size: changed.length });
    store.cache.add(PATH, newHash, 3000, 2000);
    const again = await store.publisher.storing.mapRef(changed, 'image/png', PATH);
    expect(again).toMatchObject({ hash: newHash, id: await assetIdOf(SALT, pyramidKey(newHash, 2)), tiles: true });
    await store.advance(5000);
    expect(store.client.batches.every((batch) => batch.id === again.id)).toBe(true);
    expect(store.client.batches).toHaveLength(4);
  });

  it('is given up at once where the cache holds another pyramid than its header says, without waiting again', async () => {
    const { store, bytes } = await withMap((store, hash) => store.cache.add(PATH, hash, 300, 200));
    await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(500);
    expect(store.withdrawn).toBe(1);
    expect(store.cache.builds).toEqual([PATH]);
    expect(store.cache.waiting).toBe(0);
  });

  it('releases what the store reserved for it once given up, once', async () => {
    const { store, bytes } = await withMap((store, hash) => store.cache.add(PATH, hash, 3000, 2000, { decodedScale: 2, stored: [] }));
    store.cache.manual = true;
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(1000);
    // Offered and wanted: then the first level stored shows a pyramid built at a reduced scale.
    store.cache.endBuild(PATH);
    await store.advance(1000);
    expect(store.withdrawn).toBe(1);
    expect(store.client.removed).toEqual([ref.id]);
    await store.advance(60_000);
    expect(store.client.removed).toEqual([ref.id]);
  });

  it('is released once the store answers an offer that was on its way when its build failed', async () => {
    const { store, bytes } = await withMap((store, hash) => store.cache.add(PATH, hash, 3000, 2000, { stored: [] }));
    store.cache.manual = true;
    store.client.holdOffers = true;
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(300);
    expect(store.client.offers).toHaveLength(1);
    store.cache.endBuild(PATH, 'failed');
    await store.advance(100);
    expect(store.withdrawn).toBe(1);
    expect(store.client.removed).toEqual([]);
    store.client.releaseOffers();
    await store.advance(1000);
    expect(store.client.removed).toEqual([ref.id]);
    expect(store.client.batches).toEqual([]);
  });

  it('is released and goes no further where its build fails after its overview went up', async () => {
    const { store, bytes } = await withMap((store, hash) => store.cache.add(PATH, hash, 3000, 2000, { stored: [] }));
    store.cache.manual = true;
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    store.cache.storeLevel(PATH, 3);
    store.cache.storeLevel(PATH, 2);
    store.cache.storeLevel(PATH, 1);
    await store.advance(2000);
    expect(store.client.batches.map((batch) => batch.names[0])).toEqual(['manifest.json', '3/0_0', '2/0_0']);
    store.cache.endBuild(PATH, 'failed');
    await store.advance(5000);
    expect(store.withdrawn).toBe(1);
    expect(store.client.removed).toEqual([ref.id]);
    expect(store.client.batches).toHaveLength(3);
    expect(await store.publisher.storing.mapRef(bytes, 'image/png', PATH)).not.toHaveProperty('tiles');
  });

  it('is offered at its bound while it is cut, then once more at its true size, and never at more after that', async () => {
    const { store, bytes } = await withMap((store, hash) => store.cache.add(PATH, hash, 3000, 2000, { stored: [] }));
    store.cache.manual = true;
    store.client.hold = true;
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(1000);
    const bound = pyramidBound(pyramidOf(3000, 2000));
    expect(store.client.offers.flat().map((offered) => offered.size)).toEqual([bound]);
    store.cache.endBuild(PATH);
    await store.advance(1000);
    const sizes = store.client.offers.flat().filter((offered) => offered.id === ref.id).map((offered) => offered.size);
    expect(sizes).toHaveLength(2);
    expect(sizes[1]).toBeLessThan(bound);
    store.publisher.welcome();
    await store.advance(1000);
    const later = store.client.offers.flat().slice(2).map((offered) => offered.size);
    expect(later.every((size) => size === sizes[1])).toBe(true);
  });
});
