import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { collectionsApi } from '../../src/api/collections';
import { buildExtension } from '../../src/api/extension';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { AssetService } from '../../src/app/services/AssetService';
import { serializeCollection } from '../../src/app/services/library/collectionFile';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { fakeApp, fakePlugin, fakeServices } from './apiFakes';

const FILE = 'atlas-vtt/collections/source/collection.json';

async function vault(): Promise<{ vault: InMemoryApp; assets: AssetService }> {
  AssetService.resetInstance();
  const memory = createInMemoryApp();
  const assets = AssetService.getInstance(memory.app);
  await assets.initialize();
  await assets.createCollection('source');
  return { vault: memory, assets };
}

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => vi.restoreAllMocks());

describe('collections', () => {
  it('is there only with the collections capability', () => {
    const { app } = fakeApp();
    const build = (capabilities: typeof LANDED_CAPABILITIES): AtlasApiHost => new AtlasApiHost({ app, capabilities, build: (scope) => buildExtension(scope, fakeServices(app)) });
    expect(build(['ui']).api.connect(fakePlugin('ext')).collections).toBeUndefined();
    expect(build(LANDED_CAPABILITIES).api.connect(fakePlugin('ext')).collections).toBeDefined();
  });

  it('lists collections as frozen copies, and keeps data per extension, frozen, cleared by null', async () => {
    const { vault: memory } = await vault();
    const mine = collectionsApi(memory.app, { id: 'ext' });
    const other = collectionsApi(memory.app, { id: 'other' });
    const list = await mine.list();
    expect(list).toContainEqual({ id: 'source', name: 'source' });
    expect(Object.isFrozen(list[0])).toBe(true);
    const value = { colours: [{ name: 'Fire', color: '#dd3333' }] };
    await mine.setData('source', value);
    value.colours.push({ name: 'Ice', color: '#3333dd' });
    await other.setData('source', 7);
    const read = await mine.getData('source');
    expect(read).toEqual({ colours: [{ name: 'Fire', color: '#dd3333' }] });
    expect(Object.isFrozen(read)).toBe(true);
    expect(await other.getData('source')).toBe(7);
    await mine.setData('source', null);
    expect(await mine.getData('source')).toBeUndefined();
    expect(await other.getData('source')).toBe(7);
  });

  it('refuses what is not JSON and a collection that does not exist', async () => {
    const { vault: memory } = await vault();
    const api = collectionsApi(memory.app, { id: 'ext' });
    await expect(api.setData('source', (() => 1) as never)).rejects.toThrow('[Atlas API] collections.setData: the value must be plain JSON');
    await expect(api.setData('gone', 1)).rejects.toThrow('[Atlas API] collections.setData: there is no collection with the id "gone".');
    expect(await api.getData('gone')).toBeUndefined();
  });

  it('lives in the index only: collection.json and modifiedAt stay as they were, and the record carries nothing', async () => {
    const { vault: memory, assets } = await vault();
    const before = memory.files.get(FILE);
    const modifiedAt = (await assets.getCollections()).find((c) => c.id === 'source')!.modifiedAt;
    await collectionsApi(memory.app, { id: 'ext' }).setData('source', { secret: 1 });
    expect(memory.files.get(FILE)).toBe(before);
    const record = (await assets.getCollections()).find((c) => c.id === 'source')!;
    expect(record.modifiedAt).toBe(modifiedAt);
    expect(serializeCollection(record)).not.toContain('secret');
  });

  it('follows a rename, goes with a deleted collection, and a new collection of that name starts without it', async () => {
    const { vault: memory, assets } = await vault();
    const api = collectionsApi(memory.app, { id: 'ext' });
    await api.setData('source', 'kept');
    await assets.renameCollection('source', 'renamed');
    expect(await api.getData('renamed')).toBe('kept');
    expect(await api.getData('source')).toBeUndefined();
    await assets.deleteCollection('renamed');
    await assets.createCollection('renamed');
    expect(await api.getData('renamed')).toBeUndefined();
  });

  it('keeps the data when collection.json changes outside Atlas', async () => {
    const { vault: memory, assets } = await vault();
    const api = collectionsApi(memory.app, { id: 'ext' });
    await api.setData('source', 'kept');
    const file = JSON.parse(memory.files.get(FILE)!) as Record<string, unknown>;
    await memory.app.vault.adapter.write(FILE, JSON.stringify({ ...file, description: 'edited elsewhere', modifiedAt: Date.now() + 1000 }));
    await assets.reconcileWithVault();
    expect((await assets.getCollections()).find((c) => c.id === 'source')?.description).toBe('edited elsewhere');
    expect(await api.getData('source')).toBe('kept');
  });

  it('tells collections-changed for data, a new collection and a rename, and nothing for an unchanged save', async () => {
    const { vault: memory, assets } = await vault();
    const heard = vi.fn();
    assets.onCollectionsChanged(heard);
    const api = collectionsApi(memory.app, { id: 'ext' });
    await api.setData('source', 1);
    expect(heard).toHaveBeenCalledTimes(1);
    await api.setData('source', 1);
    expect(heard).toHaveBeenCalledTimes(1);
    await assets.createCollection('second');
    expect(heard).toHaveBeenCalledTimes(2);
    await assets.renameCollection('second', 'third');
    expect(heard).toHaveBeenCalledTimes(3);
  });
});
