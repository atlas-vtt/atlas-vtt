import { describe, expect, it } from 'vitest';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import { ASSET_USES, ASSET_RANKS } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { inFlight } from '../../../../src/app/online/gm/assets/uploadPace.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { bytesOf, publisherHarness, SALT, sharesHeard } from './fakeAssetStore.ts';
import { kept } from './fakeStoring.ts';

const MIB = 1024 * 1024;

describe('the asset publisher', () => {
  it('hands players references with their ids and offers a scene\'s new assets in one request', async () => {
    const store = publisherHarness();
    const map = bytesOf(2000, 1);
    const art = [bytesOf(300, 2), bytesOf(300, 3)];
    const refs = (await Promise.all([
      store.publisher.storing.refOf(map, 'image/webp', ASSET_USES.map, 'maps/cave.webp'),
      ...art.map((bytes, n) => store.publisher.storing.refOf(bytes, 'image/png', ASSET_USES.art, `art/${n}.png`)),
    ])).map(kept);
    for (const [n, bytes] of [map, ...art].entries()) {
      const hash = await sha256Hex(bytes);
      expect(refs[n]).toEqual({ hash, size: bytes.length, mime: n === 0 ? 'image/webp' : 'image/png', id: await assetIdOf(SALT, hash) });
    }
    await store.advance(200);
    expect(store.client.offers).toHaveLength(1);
    // Ids are worked out side by side, so the offer may name the three in any order.
    const byId = (a: readonly unknown[], b: readonly unknown[]): number => String(a[0]).localeCompare(String(b[0]));
    expect(store.client.offers[0]?.map((asset) => [asset.id, asset.kind, asset.size]).sort(byId)).toEqual(refs.map((ref) => [ref.id, 'image', ref.size]).sort(byId));
  });

  it('hands no references and offers nothing while it has no salt', async () => {
    const store = publisherHarness();
    store.salt = null;
    expect(await store.publisher.storing.refOf(bytesOf(100), 'image/png', ASSET_USES.art)).toBeNull();
    await store.advance(2000);
    expect(store.client.offers).toEqual([]);
    expect(store.sent).toEqual([]);
  });

  it('uploads the map, then the art players see, the video, texts, and the other open scenes last', async () => {
    const store = publisherHarness();
    store.client.hold = true;
    // One request at a time: players are connected and the keep-alive takes more than twice its resting time.
    store.connection = { players: 1, latencyMs: 40 };
    store.files.set('Scenes/other.webp', bytesOf(500, 9));
    store.files.set('maps/flood.webm', bytesOf(900, 8));
    await store.publisher.storing.stage([{ path: 'Scenes/other.webp', mime: 'image/webp', use: { kind: 'image', rank: ASSET_RANKS.staged } }]);
    const text = kept(await store.publisher.storing.refOf(bytesOf(50, 4), 'text/markdown', ASSET_USES.text));
    const art = kept(await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art));
    const map = kept(await store.publisher.storing.refOf(bytesOf(70, 6), 'image/webp', ASSET_USES.map));
    const video = await store.publisher.storing.fileRef('maps/flood.webm', 'video/webm', ASSET_USES.video);
    store.connection = { players: 1, latencyMs: 200 };
    await store.advance(200);
    const staged = await assetIdOf(SALT, await sha256Hex(bytesOf(500, 9)));
    const order = [map.id, art.id, video?.id, text.id, staged];
    for (const [n] of order.entries()) {
      expect(store.client.waitingCount).toBe(1);
      store.client.release();
      await store.idle();
      expect(store.client.calls.map((call) => call.id)).toEqual(order.slice(0, Math.min(order.length, n + 2)));
    }
  });

  it('keeps four requests in flight while nobody plays, one while players are connected', async () => {
    const alone = publisherHarness();
    alone.client.hold = true;
    for (let n = 0; n < 6; n += 1) await alone.publisher.storing.refOf(bytesOf(100, n + 10), 'image/png', ASSET_USES.art);
    await alone.advance(200);
    expect(alone.client.inFlight).toBe(4);

    const playing = publisherHarness();
    playing.client.hold = true;
    playing.connection = { players: 3, latencyMs: 30 };
    for (let n = 0; n < 6; n += 1) await playing.publisher.storing.refOf(bytesOf(100, n + 20), 'image/png', ASSET_USES.art);
    await playing.advance(200);
    expect(playing.client.inFlight).toBe(1);
    // Players gone: four again.
    playing.connection = { players: 0, latencyMs: 30 };
    playing.client.release();
    await playing.advance(1000);
    expect(playing.client.inFlight).toBe(4);
    expect(inFlight(3, 70, 30)).toBe(1);
    expect(inFlight(3, 31, 30)).toBe(1);
    expect(inFlight(0, 70, 30)).toBe(4);
  });

  it('resumes a multipart upload where it stopped: parts that arrived never go again', async () => {
    const store = publisherHarness();
    store.client.answer = () => ({ answer: 'need', upload: 'multipart', partBytes: 16 * MIB });
    const video = bytesOf(40 * MIB, 3);
    store.files.set('maps/river.webm', video);
    const ref = await store.publisher.storing.fileRef('maps/river.webm', 'video/webm', ASSET_USES.video);
    expect(ref?.id).toBeDefined();
    store.hand(ref ?? {});
    store.client.arrived.set(ref?.id ?? '', [1, 3]);
    store.connection = { players: 1, latencyMs: 20 };
    await store.advance(200);
    await store.idle();
    expect(store.client.calls.map((call) => [call.kind, call.part ?? null])).toEqual([['start', null], ['part', 2], ['complete', null]]);
    expect(store.client.calls[1]?.bytes).toBe(16 * MIB);
    await store.advance(500);
    expect(sharesHeard(store.sent).get(ref?.id ?? '')).toBe(1);
  });

  it('tries a failed upload again after 1, 2, 4 seconds', async () => {
    const store = publisherHarness();
    let tries = 0;
    store.client.result = () => (tries += 1) <= 3 ? { ok: false, trouble: 'retry' } : { ok: true, value: null };
    await store.publisher.storing.refOf(bytesOf(100), 'image/png', ASSET_USES.art);
    await store.advance(200);
    expect(tries).toBe(1);
    await store.advance(999);
    expect(tries).toBe(1);
    await store.advance(1);
    expect(tries).toBe(2);
    await store.advance(2000);
    expect(tries).toBe(3);
    await store.advance(4000);
    expect(tries).toBe(4);
    expect(store.settledCount).toBe(1);
  });

  it('offers again after a reconnect and after a sign-in', async () => {
    const store = publisherHarness();
    store.client.offerTrouble = 'retry';
    await store.publisher.storing.refOf(bytesOf(100), 'image/png', ASSET_USES.art);
    await store.advance(200);
    expect(store.client.offers).toHaveLength(1);
    store.client.offerTrouble = 'signed-out';
    store.publisher.welcome();
    await store.advance(200);
    expect(store.client.offers).toHaveLength(2);
    expect(store.signedOut).toBe(1);
    // Signed out, the queue stands still until the GM signs in again.
    await store.advance(120_000);
    expect(store.client.offers).toHaveLength(2);
    store.client.offerTrouble = null;
    store.publisher.signedIn();
    await store.advance(200);
    expect(store.client.offers).toHaveLength(3);
    expect(store.client.calls.map((call) => call.kind)).toEqual(['whole']);
  });

  it('shows players no map larger than the store keeps, tells the GM once in plain words, and goes on with everything else', async () => {
    const store = publisherHarness();
    const big = kept(await store.publisher.storing.refOf(bytesOf(100, 1), 'image/png', ASSET_USES.map));
    const art = kept(await store.publisher.storing.refOf(bytesOf(100, 2), 'image/png', ASSET_USES.art));
    store.client.answer = (asset) => (asset.id === big.id ? { answer: 'refused', reason: 'too-large' } : { answer: 'need', upload: 'single', partBytes: 95 * MIB });
    await store.advance(200);
    expect(store.notices).toEqual(['This map is too large to share with players.']);
    expect(store.withdrawn).toBe(1);
    expect(store.client.calls.map((call) => call.id)).toEqual([art.id]);
    expect(await store.publisher.storing.refOf(bytesOf(100, 1), 'image/png', ASSET_USES.map)).toBeNull();
    // New assets are still stored, and a reconnect neither offers the map again nor tells the GM twice.
    expect(kept(await store.publisher.storing.refOf(bytesOf(100, 3), 'image/png', ASSET_USES.art)).id).toBeDefined();
    store.publisher.welcome();
    await store.advance(200);
    expect(store.client.offers.flat().filter((offered) => offered.id === big.id)).toHaveLength(1);
    expect(store.notices).toHaveLength(1);
  });

  it('says nothing of other assets too large for the store, nor of a map the store has no room for', async () => {
    const store = publisherHarness();
    store.client.answer = (asset) => ({ answer: 'refused', reason: asset.size === 100 ? 'too-large' : 'quota' });
    await store.publisher.storing.refOf(bytesOf(100, 1), 'image/png', ASSET_USES.art);
    const map = kept(await store.publisher.storing.refOf(bytesOf(200, 2), 'image/png', ASSET_USES.map));
    await store.advance(200);
    expect(store.notices).toEqual([]);
    expect(store.withdrawn).toBe(1);
    // Handed again, the map is still shown to no one, and the store is not asked again.
    expect(await store.publisher.storing.refOf(bytesOf(200, 2), 'image/png', ASSET_USES.map)).toBeNull();
    store.publisher.welcome();
    await store.advance(200);
    expect(store.client.offers.flat().filter((offered) => offered.id === map.id)).toHaveLength(1);
  });

  it('offers again, after a while and at the next welcome, an asset the store said it would make room for, without a word to the GM', async () => {
    const store = publisherHarness();
    let room = false;
    store.client.answer = () => (room ? { answer: 'need', upload: 'single', partBytes: 95 * MIB } : { answer: 'refused', reason: 'quota', retry: true });
    const map = kept(await store.publisher.storing.refOf(bytesOf(100, 1), 'image/png', ASSET_USES.map));
    await store.advance(200);
    expect(store.withdrawn).toBe(1);
    // Players are not shown it meanwhile.
    expect(await store.publisher.storing.refOf(bytesOf(100, 1), 'image/png', ASSET_USES.map)).toBeNull();
    await store.advance(4 * 60_000);
    expect(store.client.offers).toHaveLength(1);
    await store.advance(61_000);
    expect(store.client.offers).toHaveLength(2);
    // Still no room: the next wait is longer; a welcome asks at once.
    await store.advance(9 * 60_000);
    expect(store.client.offers).toHaveLength(2);
    room = true;
    store.publisher.welcome();
    await store.advance(1000);
    expect(store.client.offers).toHaveLength(3);
    expect(store.client.calls.map((call) => call.id)).toEqual([map.id]);
    expect(store.notices).toEqual([]);
  });

  it('sends players nothing but how far the assets they were handed have come', async () => {
    const store = publisherHarness();
    store.connection = { players: 2, latencyMs: 20 };
    store.files.set('Scenes/other.webp', bytesOf(500, 9));
    await store.publisher.storing.stage([{ path: 'Scenes/other.webp', mime: 'image/webp', use: { kind: 'image', rank: ASSET_RANKS.staged } }]);
    const map = kept(await store.publisher.storing.refOf(bytesOf(4000, 1), 'image/webp', ASSET_USES.map));
    store.client.answer = (asset) => (asset.id === map.id ? { answer: 'need', upload: 'single', partBytes: 95 * MIB } : { answer: 'have' });
    const art = kept(await store.publisher.storing.refOf(bytesOf(100, 2), 'image/png', ASSET_USES.art));
    store.hand(map);
    store.hand(art);
    await store.advance(2000);
    expect(store.sent.every(({ body }) => body.t === 'asset-progress')).toBe(true);
    expect(store.sent.some(({ live }) => live)).toBe(true);
    const heard = sharesHeard(store.sent);
    expect([...heard.keys()].sort()).toEqual([map.id, art.id].sort());
    expect(heard.get(map.id ?? '')).toBe(1);
    expect(heard.get(art.id ?? '')).toBe(1);
    // A player who joins hears every share, whole.
    store.sent.length = 0;
    store.publisher.resend('p1');
    expect(store.sent).toEqual([{ body: { t: 'asset-progress', shares: { [map.id ?? '']: 1, [art.id ?? '']: 1 } }, to: 'p1', live: false }]);
  });

  it('reads a vault file again for its upload and gives it up where it changed meanwhile', async () => {
    const store = publisherHarness();
    store.files.set('art/a.png', bytesOf(100, 1));
    await store.publisher.storing.refOf(bytesOf(100, 1), 'image/png', ASSET_USES.art, 'art/a.png');
    // Written again: its time changed, so it is hashed again before it goes.
    store.files.set('art/a.png', bytesOf(100, 2));
    store.stats.set('art/a.png', { mtime: 2, size: 100 });
    await store.advance(200);
    expect(store.reads.get('art/a.png')).toBe(1);
    expect(store.client.calls).toEqual([]);
    expect(store.notices).toHaveLength(1);
  });

  it('forgets the account at a 401 and stands still', async () => {
    const store = publisherHarness();
    store.client.result = () => ({ ok: false, trouble: 'signed-out' });
    await store.publisher.storing.refOf(bytesOf(100), 'image/png', ASSET_USES.art);
    await store.advance(200);
    expect(store.signedOut).toBe(1);
    await store.advance(120_000);
    expect(store.client.calls).toHaveLength(1);
  });

});
