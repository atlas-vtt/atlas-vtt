import { describe, expect, it } from 'vitest';
import type { AssetRef } from '../../../../src/app/online/protocol/index.ts';
import { ASSET_RANKS, ASSET_USES } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { bytesOf, publisherHarness, type PublisherHarness } from './fakeAssetStore.ts';
import { pngOf } from './fakeTileCache.ts';

const MIB = 1024 * 1024;

/** A publisher with a player connected (one request at a time) and every upload held until released. */
function held(): PublisherHarness {
  const store = publisherHarness();
  store.connection = { players: 1, latencyMs: 40 };
  store.client.hold = true;
  return store;
}

/** A map image at `path` whose pyramid the cache holds whole. */
async function cachedMap(store: PublisherHarness, path: string, seed: number): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = pngOf(3000, 2000, seed);
  store.files.set(path, bytes);
  store.cache.add(path, await sha256Hex(bytes), 3000, 2000);
  return bytes;
}

const callOf = (store: PublisherHarness, index: number): { kind: string; id: string } | undefined => store.client.calls[index];

describe('the order uploads go in, reviewed', () => {
  it('lets an urgent asset go next however many pyramids of scenes nobody looks at are going up', async () => {
    const store = held();
    const staged = Array.from({ length: 6 }, (_, n) => `Scenes/other-${n}.png`);
    for (const [n, path] of staged.entries()) await cachedMap(store, path, n + 10);
    await store.publisher.storing.stage(staged.map((path) => ({ path, mime: 'image/png', use: { kind: 'image', rank: ASSET_RANKS.staged }, map: true })));
    await store.advance(1000);
    expect(store.client.waitingCount).toBe(1);
    const art = await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art);
    await store.advance(1000);
    store.client.release(1);
    await store.advance(1000);
    expect(callOf(store, 1)).toMatchObject({ kind: 'whole', id: art.id });
  });

  it('ranks a map sent as one image by its floor: one a player stands on goes after the art and the presented overview', async () => {
    const store = held();
    await cachedMap(store, 'maps/ground.png', 1);
    const cellar = bytesOf(500, 3);
    store.files.set('maps/cellar.webp', cellar);
    store.publisher.storing.floorMaps?.({ presented: 'maps/ground.png', watched: ['maps/cellar.webp'], rest: [] });
    const ground = await store.publisher.storing.mapRef(store.files.get('maps/ground.png')!, 'image/png', 'maps/ground.png');
    const cellarRef = await store.publisher.storing.mapRef(cellar, 'image/webp', 'maps/cellar.webp');
    const art = await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art);
    expect(cellarRef).not.toHaveProperty('tiles');
    for (let n = 0; n < 4; n += 1) {
      await store.advance(1000);
      store.client.release(1);
    }
    await store.advance(1000);
    expect(store.client.calls.slice(0, 4).map((call) => call.id)).toEqual([ground.id, art.id, cellarRef.id, ground.id]);
    // Once its floor is no longer looked at, it waits behind what is.
    store.publisher.storing.floorMaps?.({ presented: 'maps/ground.png', watched: [], rest: [] });
  });

  it('keeps a map sent as one image from staying first once another floor is presented', async () => {
    const store = held();
    const ground = bytesOf(500, 1);
    const cellar = bytesOf(500, 2);
    store.files.set('maps/ground.webp', ground);
    store.files.set('maps/cellar.webp', cellar);
    store.publisher.storing.floorMaps?.({ presented: 'maps/ground.webp', watched: [], rest: [] });
    const blocker = await store.publisher.storing.refOf(bytesOf(400, 9), 'video/webm', ASSET_USES.video);
    await store.advance(1000);
    const groundRef = await store.publisher.storing.mapRef(ground, 'image/webp', 'maps/ground.webp');
    const cellarRef = await store.publisher.storing.mapRef(cellar, 'image/webp', 'maps/cellar.webp');
    store.publisher.storing.floorMaps?.({ presented: 'maps/cellar.webp', watched: [], rest: ['maps/ground.webp'] });
    const art = await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art);
    await store.advance(1000);
    for (let n = 0; n < 4; n += 1) {
      store.client.release(1);
      await store.advance(1000);
    }
    expect(store.client.calls.map((call) => call.id)).toEqual([blocker.id, cellarRef.id, art.id, groundRef.id]);
  });

  it('puts the manifest and overview first again when the store lost a pyramid\'s upload after its overview went', async () => {
    const store = held();
    const bytes = await cachedMap(store, 'maps/ground.png', 1);
    let batch = 0;
    store.client.tilesResult = () => ((batch += 1) === 2 ? { ok: false, trouble: 'missing' } : { ok: true, value: { stored: false, pieces: batch, of: 34 } });
    const map = await store.publisher.storing.mapRef(bytes, 'image/png', 'maps/ground.png');
    await store.advance(1000);
    store.client.release(1);
    await store.advance(1000);
    // The second batch comes back missing: the upload starts again from the manifest.
    store.client.release(1);
    await store.advance(100);
    const blocker = await store.publisher.storing.refOf(bytesOf(400, 9), 'video/webm', ASSET_USES.video);
    await store.advance(5000);
    const art = await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art);
    await store.advance(1000);
    const before = store.client.batches.length;
    expect(store.client.calls.at(-1)).toMatchObject({ id: blocker.id });
    store.client.release(1);
    await store.advance(1000);
    expect(store.client.batches[before]?.names[0]).toBe('manifest.json');
    expect(store.client.calls.at(-1)).toMatchObject({ kind: 'tiles', id: map.id });
    expect(store.client.calls.some((call) => call.id === art.id)).toBe(false);
  });

  it('drops an asset nobody was handed that the store has no room for, and goes on with the rest without a word', async () => {
    const store = publisherHarness();
    await cachedMap(store, 'maps/vault.png', 4);
    store.client.answer = (asset) => (asset.kind === 'tiles' ? { answer: 'refused', reason: 'quota' } : { answer: 'need', upload: 'single', partBytes: 95 * MIB });
    store.publisher.storing.floorMaps?.({ presented: null, watched: [], rest: ['maps/vault.png'] });
    await store.advance(1000);
    const art = await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art);
    await store.advance(1000);
    expect(store.client.calls.map((call) => call.id)).toEqual([art.id]);
    expect(store.notices).toEqual([]);
    expect(store.withdrawn).toBe(0);
  });

  it('never names a floor nobody stands on to a player', async () => {
    const store = publisherHarness();
    await cachedMap(store, 'maps/vault.png', 4);
    const ground = await cachedMap(store, 'maps/ground.png', 1);
    store.publisher.storing.floorMaps?.({ presented: 'maps/ground.png', watched: [], rest: ['maps/vault.png'] });
    const ref: AssetRef = await store.publisher.storing.mapRef(ground, 'image/png', 'maps/ground.png');
    store.hand(ref);
    await store.advance(5000);
    const vault = store.client.offers.flat().find((offered) => offered.id !== ref.id);
    expect(vault).toBeDefined();
    expect(JSON.stringify(store.sent)).not.toContain(vault?.id);
  });
});
