import { describe, expect, it } from 'vitest';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import { pyramidKey } from '../../../../src/app/online/gm/assets/assetRefs.ts';
import { ASSET_USES } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { BATCH_TILES, manifestOf, pyramidBound } from '../../../../src/app/online/gm/assets/pyramidPlan.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import { bytesOf, publisherHarness, SALT, sharesHeard } from './fakeAssetStore.ts';
import { kept } from './fakeStoring.ts';
import { pngOf } from './fakeTileCache.ts';

// 3000 × 2000: level 0 is 6 × 4 tiles, level 1 (the overview) 3 × 2, level 2 2 × 1, level 3 one tile.
const MAP = pngOf(3000, 2000);
const PATH = 'maps/keep.png';
const BOUND = pyramidBound(pyramidOf(3000, 2000));

/** A publisher whose cache holds the map's pyramid. */
async function withPyramid(tileBytes = 1000, decodedScale = 1): Promise<{ store: ReturnType<typeof publisherHarness>; hash: string }> {
  const store = publisherHarness();
  const hash = await sha256Hex(MAP);
  store.cache.add(PATH, hash, 3000, 2000, { tileBytes, decodedScale });
  store.files.set(PATH, MAP);
  return { store, hash };
}

const levelOf = (name: string): number => Number(name.split('/')[0]);

describe('a map published as its tile pyramid', () => {
  it('is handed to players as the pyramid, by an id of its own, at the most its tiles can take, and offered as one at its true size where the cache holds it whole', async () => {
    const { store, hash } = await withPyramid();
    const ref = kept(await store.publisher.storing.mapRef(MAP, 'image/png', PATH));
    expect(ref).toEqual({ hash, size: BOUND, mime: 'image/png', id: await assetIdOf(SALT, pyramidKey(hash, 2)), tiles: true });
    expect(ref.id).not.toBe(await assetIdOf(SALT, hash));
    // Every tile's raw pixels with a margin: above the four levels' pixels, within the store's cap.
    expect(BOUND).toBeGreaterThan(3000 * 2000 * 4 * (4 / 3));
    await store.advance(200);
    const real = manifestOf(pyramidOf(3000, 2000)).length + 33 * 1000;
    expect(store.client.offers).toEqual([[{ id: ref.id, kind: 'tiles', size: real, tiles: { levels: 4, count: 33 } }]]);
  });

  it('goes up with the manifest first, then the overview level, then the levels from coarse to fine, nearest the players\' view first', async () => {
    const { store } = await withPyramid();
    store.focus = { x: 1, y: 1 };
    await store.publisher.storing.mapRef(MAP, 'image/png', PATH);
    await store.advance(5000);
    const names = store.client.batches.flatMap((batch) => batch.names);
    expect(store.client.batches[0]?.names[0]).toBe('manifest.json');
    expect(names.slice(1).map(levelOf)).toEqual([...Array<number>(6).fill(1), 3, 2, 2, ...Array<number>(24).fill(0)]);
    // Within a level, the tile nearest the bottom right comes first.
    expect(names[1]).toBe('1/2_1');
    expect(names[10]).toBe('0/5_3');
    expect(store.client.batches.every((batch) => batch.names.length <= BATCH_TILES + 1)).toBe(true);
    // The overview's batch ends with it.
    expect(store.client.batches[0]?.names.slice(1).every((name) => levelOf(name) === 1)).toBe(true);
    // Read from the cache as stored, batch by batch.
    expect(store.tileReads[0]).toEqual(['1/2/1', '1/1/1', '1/2/0', '1/0/1', '1/1/0', '1/0/0']);
  });

  it('lets the art players see go between its overview and its finer levels', async () => {
    const { store } = await withPyramid();
    store.client.hold = true;
    store.connection = { players: 1, latencyMs: 40 };
    const map = kept(await store.publisher.storing.mapRef(MAP, 'image/png', PATH));
    const art = kept(await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art));
    store.connection = { players: 1, latencyMs: 200 };
    await store.advance(200);
    for (let n = 0; n < 4; n += 1) {
      store.client.release();
      await store.idle();
    }
    expect(store.client.calls.slice(0, 3).map((call) => [call.kind, call.id])).toEqual([['tiles', map.id], ['whole', art.id], ['tiles', map.id]]);
  });

  it('tells players how many of its pieces are stored, and 1 once it is whole; nothing else goes to them', async () => {
    const { store } = await withPyramid();
    store.connection = { players: 2, latencyMs: 20 };
    store.client.hold = true;
    const ref = kept(await store.publisher.storing.mapRef(MAP, 'image/png', PATH));
    store.hand(ref);
    await store.advance(200);
    store.client.release(1);
    await store.idle();
    await store.advance(600);
    // The first batch holds the manifest and the overview's six tiles: 7 of 34 pieces.
    expect(sharesHeard(store.sent).get(ref.id ?? '')).toBeCloseTo(7 / 34);
    store.client.hold = false;
    store.client.release();
    await store.advance(5000);
    expect(sharesHeard(store.sent).get(ref.id ?? '')).toBe(1);
    expect(store.sent.every(({ body }) => body.t === 'asset-progress')).toBe(true);
  });

  it('goes as one image where its header cannot be read', async () => {
    const store = publisherHarness();
    const plain = bytesOf(4000, 1);
    const ref = kept(await store.publisher.storing.mapRef(plain, 'image/webp', 'maps/plain.webp'));
    expect(ref).toEqual({ hash: await sha256Hex(plain), size: plain.length, mime: 'image/webp', id: await assetIdOf(SALT, await sha256Hex(plain)) });
    await store.advance(200);
    expect(store.client.offers.flat()).toEqual([{ id: ref.id, kind: 'image', size: plain.length }]);
    expect(store.cache.builds).toEqual([]);
  });

  it('goes as one image once the store takes no pyramids, and what handed it hands it again', async () => {
    const { store } = await withPyramid();
    store.client.answer = (asset) => (asset.kind === 'tiles' ? { answer: 'refused', reason: 'kind' } : { answer: 'need', upload: 'single', partBytes: 95 * 1024 * 1024 });
    const first = kept(await store.publisher.storing.mapRef(MAP, 'image/png', PATH));
    expect(first.tiles).toBe(true);
    await store.advance(200);
    expect(store.withdrawn).toBe(1);
    const again = kept(await store.publisher.storing.mapRef(MAP, 'image/png', PATH));
    expect(again).not.toHaveProperty('tiles');
    expect(again.size).toBe(MAP.length);
    await store.advance(1000);
    expect(store.client.offers.at(-1)).toEqual([{ id: again.id, kind: 'image', size: MAP.length }]);
    // Refused: none of its levels is waited for any more.
    expect(store.cache.waiting).toBe(0);
    expect(store.client.calls.map((call) => call.kind)).toEqual(['whole']);
  });

  it('starts again from the manifest once the store lost its upload', async () => {
    const { store } = await withPyramid();
    let lost = true;
    store.client.tilesResult = () => (lost ? ((lost = false), { ok: false, trouble: 'missing' }) : { ok: true, value: { stored: true, pieces: 34, of: 34 } });
    await store.publisher.storing.mapRef(MAP, 'image/png', PATH);
    await store.advance(5000);
    expect(store.client.offers).toHaveLength(2);
    expect(store.client.batches.map((batch) => batch.names[0])).toEqual(['manifest.json', 'manifest.json']);
  });
});
