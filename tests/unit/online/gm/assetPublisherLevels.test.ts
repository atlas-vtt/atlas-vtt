import { describe, expect, it } from 'vitest';
import type { AssetRef } from '../../../../src/app/online/protocol/index.ts';
import { ASSET_USES } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { bytesOf, publisherHarness, type PublisherHarness } from './fakeAssetStore.ts';
import { pngOf } from './fakeTileCache.ts';

// Each map 3000 × 2000: the overview is level 1 (6 tiles), then levels 3, 2 and 0 (1, 2 and 24 tiles), a batch each.
const FLOORS = ['maps/ground.png', 'maps/cellar.png', 'maps/vault.png'] as const;
const [GROUND, CELLAR, VAULT] = FLOORS;

/** A publisher whose vault holds three floors' maps; a player is connected, so one request goes at a time. */
async function threeFloors(): Promise<{ store: PublisherHarness; hashes: Map<string, string> }> {
  const store = publisherHarness();
  store.connection = { players: 1, latencyMs: 40 };
  const hashes = new Map<string, string>();
  for (const [n, path] of FLOORS.entries()) {
    const bytes = pngOf(3000, 2000, n + 1);
    store.files.set(path, bytes);
    hashes.set(path, await sha256Hex(bytes));
  }
  return { store, hashes };
}

const mapRef = (store: PublisherHarness, path: string): Promise<AssetRef> => store.publisher.storing.mapRef(store.files.get(path)!, 'image/png', path);

/** The tile batches that went up, as `<map>:<level>` (`*` where it carried the manifest). */
function batchesSent(store: PublisherHarness, names: Map<string, string>): string[] {
  return store.client.batches.map((batch) => {
    const tile = batch.names.find((name) => name !== 'manifest.json') ?? '';
    return `${names.get(batch.id) ?? '?'}:${tile.split('/')[0]}${batch.names[0] === 'manifest.json' ? '*' : ''}`;
  });
}

/** Lets every held upload come back, one by one, until nothing more goes. */
async function drain(store: PublisherHarness): Promise<void> {
  for (let round = 0; round < 200; round += 1) {
    await store.advance(1000);
    if (store.client.waitingCount === 0) return;
    store.client.release(1);
  }
}

describe('the pyramids of a scene\'s floors', () => {
  it('are handed before a tile of them is cut, and go up level by level as the cache stores them, the manifest first', async () => {
    const { store, hashes } = await threeFloors();
    store.cache.manual = true;
    store.cache.add(GROUND, hashes.get(GROUND)!, 3000, 2000, { stored: [] });
    const ref = await mapRef(store, GROUND);
    expect(ref.tiles).toBe(true);
    await store.advance(5000);
    expect(store.cache.builds).toEqual([GROUND]);
    // Offered at once; nothing goes up before the overview is stored.
    expect(store.client.offers).toHaveLength(1);
    expect(store.client.batches).toEqual([]);
    store.cache.storeLevel(GROUND, 3);
    store.cache.storeLevel(GROUND, 2);
    await store.advance(5000);
    expect(store.client.batches).toEqual([]);
    store.cache.storeLevel(GROUND, 1);
    await store.advance(5000);
    const names = new Map([[ref.id!, 'ground']]);
    // The overview with the manifest, then the coarser levels already stored; level 0 waits for its tiles.
    expect(batchesSent(store, names)).toEqual(['ground:1*', 'ground:3', 'ground:2']);
    expect(store.cache.tileReads.flat().every((tile) => !tile.startsWith('0/'))).toBe(true);
    store.cache.endBuild(GROUND);
    await store.advance(5000);
    expect(batchesSent(store, names)).toEqual(['ground:1*', 'ground:3', 'ground:2', 'ground:0']);
  });

  it('go up a first picture for everyone before polish for anyone: the presented overview, the art players see, the overview of the floor a player stands on, the finer levels, then the floor nobody stands on', async () => {
    const { store, hashes } = await threeFloors();
    for (const path of FLOORS) store.cache.add(path, hashes.get(path)!, 3000, 2000);
    store.client.hold = true;
    store.publisher.storing.floorMaps?.({ presented: GROUND, watched: [CELLAR], rest: [VAULT] });
    const ground = await mapRef(store, GROUND);
    const cellar = await mapRef(store, CELLAR);
    const art = await store.publisher.storing.refOf(bytesOf(60, 5), 'image/png', ASSET_USES.art);
    await drain(store);
    const vault = store.client.offers.flat().find((offered) => offered.kind === 'tiles' && offered.id !== ground.id && offered.id !== cellar.id);
    const names = new Map([[ground.id!, 'ground'], [cellar.id!, 'cellar'], [vault?.id ?? '', 'vault']]);
    const order = store.client.calls.map((call) => (call.kind === 'whole' ? (call.id === art.id ? 'art' : '?') : 'tiles'));
    expect(order.indexOf('art')).toBe(1);
    expect(batchesSent(store, names)).toEqual([
      'ground:1*', 'cellar:1*',
      'ground:3', 'ground:2', 'ground:0',
      'cellar:3', 'cellar:2', 'cellar:0',
      'vault:1*', 'vault:3', 'vault:2', 'vault:0',
    ]);
  });

  it('are ranked again when a player moves to another floor or another floor is presented', async () => {
    const { store, hashes } = await threeFloors();
    for (const path of FLOORS) store.cache.add(path, hashes.get(path)!, 3000, 2000);
    store.client.hold = true;
    store.publisher.storing.floorMaps?.({ presented: GROUND, watched: [CELLAR], rest: [VAULT] });
    const ground = await mapRef(store, GROUND);
    const cellar = await mapRef(store, CELLAR);
    await store.advance(1000);
    // The ground's overview is on its way; then the player on the cellar walks down to the vault.
    store.publisher.storing.floorMaps?.({ presented: GROUND, watched: [VAULT], rest: [CELLAR] });
    await drain(store);
    const vault = store.client.offers.flat().find((offered) => offered.kind === 'tiles' && offered.id !== ground.id && offered.id !== cellar.id);
    const names = new Map([[ground.id!, 'ground'], [cellar.id!, 'cellar'], [vault?.id ?? '', 'vault']]);
    expect(batchesSent(store, names)).toEqual([
      'ground:1*', 'vault:1*',
      'ground:3', 'ground:2', 'ground:0',
      'vault:3', 'vault:2', 'vault:0',
      'cellar:1*', 'cellar:3', 'cellar:2', 'cellar:0',
    ]);
  });

  it('put a newly presented floor\'s overview before the finer levels of the floor presented before', async () => {
    const { store, hashes } = await threeFloors();
    for (const path of [GROUND, CELLAR]) store.cache.add(path, hashes.get(path)!, 3000, 2000);
    store.client.hold = true;
    store.publisher.storing.floorMaps?.({ presented: GROUND, watched: [], rest: [] });
    const ground = await mapRef(store, GROUND);
    await store.advance(1000);
    store.client.release(1);
    await store.advance(1000);
    store.publisher.storing.floorMaps?.({ presented: CELLAR, watched: [GROUND], rest: [] });
    const cellar = await mapRef(store, CELLAR);
    await drain(store);
    const names = new Map([[ground.id!, 'ground'], [cellar.id!, 'cellar']]);
    expect(batchesSent(store, names).slice(0, 2)).toEqual(['ground:1*', 'ground:3']);
    expect(batchesSent(store, names).slice(2, 7)).toEqual(['cellar:1*', 'cellar:3', 'cellar:2', 'cellar:0', 'ground:2']);
  });

  it('build one floor at a time, the presented one first, and a floor nobody stands on only once the floors players look at are built', async () => {
    const { store, hashes } = await threeFloors();
    store.cache.manual = true;
    for (const path of FLOORS) store.cache.add(path, hashes.get(path)!, 3000, 2000, { stored: [] });
    store.publisher.storing.floorMaps?.({ presented: GROUND, watched: [CELLAR], rest: [VAULT] });
    await mapRef(store, GROUND);
    await mapRef(store, CELLAR);
    await store.advance(1000);
    // One at a time, the presented floor first.
    expect(store.cache.builds).toEqual([GROUND]);
    store.cache.endBuild(GROUND);
    await store.advance(1000);
    expect(store.cache.builds).toEqual([GROUND, CELLAR]);
    store.cache.endBuild(CELLAR);
    await store.advance(1000);
    expect(store.cache.builds).toEqual([GROUND, CELLAR, VAULT]);
  });

  it('waits for its levels again in the next worker when the tile worker stops', async () => {
    const { store, hashes } = await threeFloors();
    store.cache.manual = true;
    store.cache.add(GROUND, hashes.get(GROUND)!, 3000, 2000, { stored: [] });
    const ref = await mapRef(store, GROUND);
    await store.advance(1000);
    expect(store.cache.waiting).toBe(1);
    store.cache.crash();
    await store.advance(5000);
    // Asked again, and answered once the build stored its levels.
    expect(store.cache.waiting).toBe(1);
    store.cache.endBuild(GROUND);
    await store.advance(5000);
    expect(batchesSent(store, new Map([[ref.id!, 'ground']]))).toEqual(['ground:1*', 'ground:3', 'ground:2', 'ground:0']);
    expect(store.withdrawn).toBe(0);
  });

  it('is withdrawn and handed again as one image where it was built at a reduced scale, or cannot be built', async () => {
    const { store, hashes } = await threeFloors();
    store.cache.add(GROUND, hashes.get(GROUND)!, 3000, 2000, { decodedScale: 2 });
    const scaled = await mapRef(store, GROUND);
    expect(scaled.tiles).toBe(true);
    await store.advance(1000);
    expect(store.withdrawn).toBe(1);
    expect(await mapRef(store, GROUND)).not.toHaveProperty('tiles');
    // The cellar's file is no image the tile worker can build.
    const unbuildable = await mapRef(store, CELLAR);
    expect(unbuildable.tiles).toBe(true);
    await store.advance(1000);
    expect(store.withdrawn).toBe(2);
    const again = await mapRef(store, CELLAR);
    expect(again).not.toHaveProperty('tiles');
    expect(again.size).toBe(store.files.get(CELLAR)!.length);
    expect(store.client.batches).toEqual([]);
  });
});
