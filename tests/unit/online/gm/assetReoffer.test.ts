import { describe, expect, it } from 'vitest';
import type { OfferedAsset } from '../../../../src/app/online/gm/assets/assetRoutes.ts';
import { ASSET_USES } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { manifestOf } from '../../../../src/app/online/gm/assets/pyramidPlan.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import { bytesOf, publisherHarness, sharesHeard, type PublisherHarness } from './fakeAssetStore.ts';
import { pngOf } from './fakeTileCache.ts';

const HOUR = 60 * 60 * 1000;
const MIB = 1024 * 1024;
const PATH = 'maps/keep.png';
/** The true size of a 3000 × 2000 pyramid whose tiles take 1000 bytes each. */
const REAL = manifestOf(pyramidOf(3000, 2000)).length + 33 * 1000;

/** A store that settled a pyramid at its true size: an offer of it at any other size is refused `changed`. */
function settledStore(store: PublisherHarness): void {
  store.client.answer = (asset: OfferedAsset) => {
    if (asset.kind !== 'tiles') return { answer: 'need', upload: 'single', partBytes: 95 * MIB };
    return asset.size === REAL ? { answer: 'need', upload: 'tiles', partBytes: 8 * MIB } : { answer: 'refused', reason: 'changed' };
  };
}

describe('a stored asset handed to players again', () => {
  it('is offered again first once its last offer is half a day old, so the store keeps it; sooner it is not', async () => {
    const store = publisherHarness();
    const art = bytesOf(300, 2);
    store.files.set('art/a.png', art);
    const ref = await store.publisher.storing.refOf(art, 'image/png', ASSET_USES.art, 'art/a.png');
    store.hand(ref);
    await store.advance(1000);
    expect(store.client.calls.map((call) => call.id)).toEqual([ref.id]);
    await store.advance(6 * HOUR);
    store.hand(await store.publisher.storing.refOf(art, 'image/png', ASSET_USES.art, 'art/a.png'));
    await store.advance(1000);
    expect(store.client.offers).toHaveLength(1);
    await store.advance(7 * HOUR);
    store.client.answer = () => ({ answer: 'have' });
    store.hand(await store.publisher.storing.refOf(art, 'image/png', ASSET_USES.art, 'art/a.png'));
    await store.advance(1000);
    expect(store.client.offers).toHaveLength(2);
    expect(store.client.calls).toHaveLength(1);
    expect(sharesHeard(store.sent).get(ref.id ?? '')).toBe(1);
    expect(store.notices).toEqual([]);
  });

  it('goes up again where the store let it go meanwhile', async () => {
    const store = publisherHarness();
    const art = bytesOf(300, 2);
    store.files.set('art/a.png', art);
    const ref = await store.publisher.storing.refOf(art, 'image/png', ASSET_USES.art, 'art/a.png');
    await store.advance(1000);
    await store.advance(13 * HOUR);
    await store.publisher.storing.refOf(art, 'image/png', ASSET_USES.art, 'art/a.png');
    await store.advance(1000);
    expect(store.client.calls.map((call) => call.id)).toEqual([ref.id, ref.id]);
  });
});

describe('a pyramid the store settled at its true size, offered again at its bound after a restart', () => {
  it('is offered at its true size once its levels are cut, instead of being tried blindly again', async () => {
    const store = publisherHarness();
    settledStore(store);
    const bytes = pngOf(3000, 2000);
    store.files.set(PATH, bytes);
    store.cache.manual = true;
    store.cache.add(PATH, await sha256Hex(bytes), 3000, 2000, { stored: [] });
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(60_000);
    // Refused once at its bound, then left alone while it is cut; players keep its id.
    expect(store.client.offers.flat().map((offered) => offered.size)).toHaveLength(1);
    expect(store.withdrawn).toBe(0);
    store.cache.endBuild(PATH);
    await store.advance(1000);
    await store.advance(5000);
    expect(store.client.offers.flat().map((offered) => offered.size).at(-1)).toBe(REAL);
    expect(store.client.batches.every((batch) => batch.id === ref.id)).toBe(true);
    expect(store.client.batches).toHaveLength(4);
  });

  it('is offered at its true size at once where it is known when the refusal comes', async () => {
    const store = publisherHarness();
    settledStore(store);
    const bytes = pngOf(3000, 2000);
    store.files.set(PATH, bytes);
    store.cache.manual = true;
    store.cache.add(PATH, await sha256Hex(bytes), 3000, 2000, { stored: [] });
    store.client.holdOffers = true;
    await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    await store.advance(300);
    // Cut while its first offer, at its bound, is on its way.
    store.cache.endBuild(PATH);
    await store.advance(100);
    store.client.holdOffers = false;
    store.client.releaseOffers();
    await store.advance(5000);
    expect(store.client.offers.flat().map((offered) => offered.size).slice(1)).toEqual([REAL]);
    expect(store.client.batches).toHaveLength(4);
  });

  it('is given up where the store refuses even its true size', async () => {
    const store = publisherHarness();
    store.client.answer = (asset) => (asset.kind === 'tiles' ? { answer: 'refused', reason: 'changed' } : { answer: 'have' });
    const bytes = pngOf(3000, 2000);
    store.files.set(PATH, bytes);
    store.cache.add(PATH, await sha256Hex(bytes), 3000, 2000);
    const ref = await store.publisher.storing.mapRef(bytes, 'image/png', PATH);
    store.hand(ref);
    await store.advance(5000);
    expect(store.withdrawn).toBe(1);
    expect(await store.publisher.storing.mapRef(bytes, 'image/png', PATH)).not.toHaveProperty('tiles');
    expect(store.client.offers).toHaveLength(1);
  });
});
