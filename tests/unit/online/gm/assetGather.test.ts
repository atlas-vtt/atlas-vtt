import type { SharedScene } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { stagedAssets } from '../../../../src/app/online/gm/assets/assetGather.ts';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import { ASSET_RANKS } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { bytesOf, publisherHarness, SALT } from './fakeAssetStore.ts';
import { pngOf } from './fakeTileCache.ts';
import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import { pyramidKey } from '../../../../src/app/online/gm/assets/assetRefs.ts';
import { pyramidBound } from '../../../../src/app/online/gm/assets/pyramidPlan.ts';
import { sceneState, sequenced, shareHarness, token, type Sent } from './shareHarness.ts';

const scenes = (sent: readonly Sent[]): (SharedScene | null)[] => sent.flatMap(({ body }) => (body.t === 'scene' ? [body.scene] : []));
const EXPLORED = `data:image/png;base64,${btoa('explored')}`;

describe('what a scene open beside the presented one offers', () => {
  it('is the map of every level and the art of the tokens on the map that are not hidden', () => {
    const staged = stagedAssets({
      background: 'maps/ground.webp',
      levels: [{ background: 'maps/ground.webp' }, { background: 'maps/cellar.png' }, { background: null }],
      objects: {
        tokens: {
          a: { imagePath: 'art/a.webp' },
          b: { imagePath: 'art/b.png', isHidden: true },
          c: { imagePath: 'art/c.png', offMap: true },
          d: { imagePath: 'art/a.webp' },
          e: {},
        },
      },
    });
    expect(staged).toEqual([
      { path: 'maps/ground.webp', mime: 'image/webp', use: { kind: 'image', rank: ASSET_RANKS.staged }, map: true },
      { path: 'maps/cellar.png', mime: 'image/png', use: { kind: 'image', rank: ASSET_RANKS.staged }, map: true },
      { path: 'art/a.webp', mime: 'image/webp', use: { kind: 'image', rank: ASSET_RANKS.staged } },
    ]);
  });

  it('leaves out an animated map and the explored memory', () => {
    const scene = { background: 'maps/falls.webm', exploredMask: EXPLORED, objects: { tokens: {} } };
    expect(stagedAssets(scene)).toEqual([]);
  });
});

describe('what the presented scene offers', () => {
  it('is its map, the art of the tokens players see, and an animated map\'s video, by id', async () => {
    const store = publisherHarness();
    const video = bytesOf(4096, 5);
    store.files.set('maps/falls.webm', video);
    const poster = bytesOf(400, 1);
    const art = bytesOf(200, 2);
    const table = shareHarness(sceneState({ background: 'maps/falls.webm', exploredMask: EXPLORED, objects: { ...sceneState().objects, tokens: { t1: token('t1') } } }), new Map([['maps/falls.webm', poster], ['art/t1.webp', art]]), undefined, undefined, store.publisher.storing);
    table.share.start();
    await table.settle();
    await store.idle();
    await table.advance(1000);
    await store.advance(200);
    const scene = scenes(table.sent).at(-1);
    const videoHash = await sha256Hex(video);
    const posterHash = await sha256Hex(poster);
    expect(scene?.video).toEqual({ hash: videoHash, size: video.length, mime: 'video/webm', id: await assetIdOf(SALT, videoHash) });
    expect(scene?.map).toEqual({ hash: posterHash, size: poster.length, mime: 'image/png', id: await assetIdOf(SALT, posterHash) });
    const offered = store.client.offers.flat().map((asset) => [asset.kind, asset.size]);
    expect(offered).toEqual(expect.arrayContaining([['image', poster.length], ['image', art.length], ['video', video.length]]));
    expect(offered).toHaveLength(3);
    // The video is read from the vault to be hashed and again to go up, never kept in memory or sent through the table.
    expect(store.reads.get('maps/falls.webm')).toBe(2);
    expect(store.client.calls.filter((call) => call.bytes === video.length)).toHaveLength(1);
  });

  it('shows players no map and no video while the store cannot name them', async () => {
    const store = publisherHarness();
    store.salt = null;
    store.files.set('maps/falls.webm', bytesOf(4096, 5));
    const table = shareHarness(sceneState({ background: 'maps/falls.webm' }), new Map([['maps/falls.webm', bytesOf(400, 1)]]), undefined, undefined, store.publisher.storing);
    table.share.start();
    await table.settle();
    await store.idle();
    await table.settle();
    expect(scenes(table.sent).at(-1)).not.toHaveProperty('video');
    expect(scenes(table.sent).at(-1)?.map).toBeNull();
  });

  it('is taken from players once the store will not keep it', async () => {
    const store = publisherHarness();
    store.client.answer = () => ({ answer: 'refused', reason: 'quota' });
    const table = shareHarness(sceneState({ objects: { ...sceneState().objects, tokens: { t1: token('t1') } } }), new Map([['maps/cave.webp', bytesOf(400, 1)], ['art/t1.webp', bytesOf(200, 2)]]), undefined, undefined, store.publisher.storing);
    table.share.start();
    await table.settle();
    await store.idle();
    await table.advance(1000);
    await store.advance(200);
    expect(scenes(table.sent).at(-1)?.map?.id).toBeDefined();
    expect(store.withdrawn).toBe(1);
    table.share.refreshAssets();
    await table.settle();
    await store.idle();
    await table.advance(1000);
    expect(scenes(table.sent).at(-1)?.map).toBeNull();
    expect(sequenced(table.sent, 'tokens').at(-1)?.tokens[0]?.art).toBeNull();
  });

  it('names a map as its tile pyramid at once, before a tile of it is cut, and its video beside it as before', async () => {
    const store = publisherHarness();
    const map = pngOf(3000, 2000);
    const hash = await sha256Hex(map);
    store.cache.manual = true;
    store.cache.add('maps/cave.webp', hash, 3000, 2000, { stored: [] });
    const table = shareHarness(sceneState(), new Map([['maps/cave.webp', map]]), undefined, undefined, store.publisher.storing);
    table.share.start();
    await table.settle();
    await store.idle();
    await table.settle();
    const bound = pyramidBound(pyramidOf(3000, 2000));
    // Sent while the build has not stored a level yet.
    expect(store.cache.building('maps/cave.webp')).toBe(true);
    expect(scenes(table.sent).at(-1)?.map).toEqual({ hash, size: bound, mime: 'image/webp', id: await assetIdOf(SALT, pyramidKey(hash, 2)), tiles: true });
    await store.advance(200);
    expect(store.client.offers.flat()).toEqual([{ id: await assetIdOf(SALT, pyramidKey(hash, 2)), kind: 'tiles', size: bound, tiles: { levels: 4, count: 33 } }]);
    expect(store.client.batches).toEqual([]);
    store.cache.endBuild('maps/cave.webp');
    await store.advance(5000);
    expect(store.client.batches[0]?.names[0]).toBe('manifest.json');
  });
});
