import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diceLookChoiceFor } from '../../src/api/diceLookChoice';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { buildExtension } from '../../src/api/extension';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { addCustomLook } from '../../src/app/dice3d/customLooks';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { mapDiceLookId } from '../../src/app/services/mapDiceLook';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { fakeApp, fakePlugin, fakeServices } from './apiFakes';

const MAP = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';

async function vault(): Promise<{ memory: InMemoryApp; settings: SettingsService; assets: AssetService }> {
  const memory = createInMemoryApp();
  const settings = new SettingsService(memory.app);
  const assets = AssetService.getInstance(memory.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.createCollection('other');
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP } });
  return { memory, settings, assets };
}

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => vi.restoreAllMocks());

describe('dice.useLook and dice.lookFor', () => {
  it('are there only with dice-look-choice', () => {
    const { app } = fakeApp();
    const host = (capabilities: typeof LANDED_CAPABILITIES): AtlasApiHost => new AtlasApiHost({ app, capabilities, build: (scope) => buildExtension(scope, fakeServices(app)) });
    expect(host(['dice']).api.connect(fakePlugin('ext')).dice.useLook).toBeUndefined();
    expect(host(LANDED_CAPABILITIES).api.connect(fakePlugin('ext')).dice.lookFor).toBeDefined();
  });

  it("sets the GM's default without a collection, and a collection's own choice with one, which its maps throw in", async () => {
    const { memory, settings } = await vault();
    const choice = diceLookChoiceFor(memory.app, 'ext');
    await choice.useLook('wood');
    expect(settings.getDiceLookId()).toBe('ext:wood');
    await choice.useLook('fire', { collectionId: 'source' });
    expect(await choice.lookFor('source')).toEqual({ lookId: 'ext:fire', from: 'collection', loaded: false });
    expect(Object.isFrozen(await choice.lookFor('source'))).toBe(true);
    expect(await choice.lookFor('other')).toEqual({ lookId: 'ext:wood', from: 'default', loaded: false });
    expect(mapDiceLookId(memory.app, MAP)).toBe('ext:fire');
    expect(mapDiceLookId(memory.app, 'atlas-vtt/elsewhere.atlasmap')).toBe('ext:wood');
    expect(mapDiceLookId(memory.app, 'remote:view')).toBe('ext:wood');
    const remove = addCustomLook({ id: 'ext:fire', name: 'Fire', faces: () => Promise.resolve({}), body: null, ink: null, preview: null });
    expect((await choice.lookFor('source')).loaded).toBe(true);
    remove();
    await choice.useLook('', { collectionId: 'source' });
    expect(await choice.lookFor('source')).toEqual({ lookId: '', from: 'collection', loaded: true });
    await choice.useLook(null, { collectionId: 'source' });
    expect(await choice.lookFor('source')).toMatchObject({ lookId: 'ext:wood', from: 'default' });
    await choice.useLook(null);
    expect(settings.getDiceLookId()).toBe('');
    expect(await choice.lookFor()).toEqual({ lookId: '', from: 'default', loaded: true });
  });

  it('keeps the choice out of collection.json, follows a rename, and refuses what it cannot take', async () => {
    const { memory, assets } = await vault();
    const choice = diceLookChoiceFor(memory.app, 'ext');
    const file = 'atlas-vtt/collections/source/collection.json';
    const before = memory.files.get(file);
    await choice.useLook('fire', { collectionId: 'source' });
    expect(memory.files.get(file)).toBe(before);
    await assets.renameCollection('source', 'renamed');
    expect((await choice.lookFor('renamed')).lookId).toBe('ext:fire');
    await expect(choice.useLook('fire', { collectionId: 'gone' })).rejects.toThrow('[Atlas API] dice.useLook: there is no collection with the id "gone".');
    await expect(choice.useLook(7 as never)).rejects.toThrow('"lookId" must be a string or null');
    await expect(choice.useLook('fire', { collectionId: 3 } as never)).rejects.toThrow('the options must be { collectionId?: string }');
  });
});
