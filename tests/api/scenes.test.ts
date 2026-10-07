// @vitest-environment node
// Reading an image header needs Blob.arrayBuffer, which jsdom lacks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bundlesApi } from '../../src/api/bundles';
import { DisposerSet } from '../../src/api/disposers';
import { savedMapText } from '../../src/api/savedMap';
import { scenesApi } from '../../src/api/scenes';
import { bundleNoteKeys } from '../../src/app/extensions/bundleNoteKeys';
import { AssetService } from '../../src/app/services/AssetService';
import { DEFAULT_TOKEN_SETTINGS } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { BACKGROUND, emptyMap, MAP_PATH, withScene } from './scenesFixture';

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => vi.restoreAllMocks());

describe('scenes', () => {
  it('lists scene records and finds one by its map', async () => {
    const { scenes, sceneId } = await withScene();
    expect(await scenes.list()).toEqual([{ id: sceneId, name: 'Cave', collectionId: 'source', mapPath: MAP_PATH }]);
    expect(await scenes.findByMap(MAP_PATH)).toMatchObject({ id: sceneId });
    expect(await scenes.findByMap('other.atlasmap')).toBeNull();
    expect(Object.isFrozen((await scenes.list())[0])).toBe(true);
  });

  it('C-scenes-1: setData keeps data under the extension id, re-reads before writing, and null clears it', async () => {
    const { scenes, assets, sceneId } = await withScene();
    await scenes.setData(sceneId, { item: 'abc' });
    expect((await assets.getAssetById(sceneId))!.data).toMatchObject({ extensions: { ext: { item: 'abc' } } });
    await assets.updateAsset(sceneId, { data: { ...(await assets.getAssetById(sceneId) as { data: object }).data, mapPath: 'moved.atlasmap' } });
    await scenes.setData(sceneId, { item: 'def' });
    expect((await assets.getAssetById(sceneId))!.data).toMatchObject({ mapPath: 'moved.atlasmap', extensions: { ext: { item: 'def' } } });
    expect(await scenes.getData(sceneId)).toEqual({ item: 'def' });
    expect(Object.isFrozen(await scenes.getData(sceneId))).toBe(true);
    await scenes.setData(sceneId, null);
    expect((await assets.getAssetById(sceneId))!.data).not.toHaveProperty('extensions');
    expect(await scenes.getData(sceneId)).toBeUndefined();
  });

  it("C-scenes-1: setData leaves other extensions' data alone, copies its value and refuses what is not a scene or not JSON", async () => {
    const { scenes, assets, vault, sceneId } = await withScene();
    await scenesApi(vault.app, { id: 'other' }).setData(sceneId, 'theirs');
    const value = { list: [1] };
    await scenes.setData(sceneId, value);
    value.list.push(2);
    expect(await scenes.getData(sceneId)).toEqual({ list: [1] });
    await scenes.setData(sceneId, null);
    expect((await assets.getAssetById(sceneId))!.data).toMatchObject({ extensions: { other: 'theirs' } });
    await expect(scenes.setData('missing', 1)).rejects.toThrow(/no scene/);
    await expect(scenes.setData(sceneId, undefined as never)).rejects.toThrow(/plain JSON/);
    await expect(scenes.setData(sceneId, 1n as never)).rejects.toThrow(/plain JSON/);
  });

  it('C-scenes-2: addToCollection leaves nothing behind on failure and runs one at a time', async () => {
    const { scenes, vault } = await withScene();
    const { app } = vault;
    const assets = AssetService.getInstance(app);
    const input = { collection: { name: 'Imported' }, name: 'Cave', folder: 'atlas-vtt/collections/Imported/Cave', map: emptyMap({ background: 'bg.webp' }), images: [{ path: 'bg.webp', data: new ArrayBuffer(4) }] };
    vi.spyOn(assets, 'addAsset').mockRejectedValueOnce(new Error('index full'));
    await expect(scenes.addToCollection(input)).rejects.toThrow('index full');
    expect(await app.vault.adapter.exists('atlas-vtt/collections/Imported/Cave/bg.webp')).toBe(false);
    expect(await app.vault.adapter.exists('atlas-vtt/collections/Imported/Cave/Cave.atlasmap')).toBe(false);
    expect(await app.vault.adapter.exists('atlas-vtt/collections/Imported')).toBe(false);
    expect((await assets.getCollections()).map((collection) => collection.id)).not.toContain('Imported');
    expect((await assets.getAssets(undefined, 'scene')).map((scene) => scene.name)).toEqual(['Cave']);

    // Writes are slowed so that overlapping calls would show: at most one runs at a time, and the first finishes before the second starts.
    let running = 0;
    let most = 0;
    const log: string[] = [];
    for (const method of ['createBinary', 'create'] as const) {
      const mock = vi.mocked(app.vault[method]);
      const original = mock.getMockImplementation() as (path: string, data: never) => Promise<unknown>;
      mock.mockImplementation((async (path: string, data: never) => {
        running++;
        most = Math.max(most, running);
        log.push(path);
        for (let tick = 0; tick < 10; tick++) await Promise.resolve();
        try { return await original(path, data); } finally { running--; }
      }) as never);
    }
    const [a, b] = await Promise.all([scenes.addToCollection(input), scenes.addToCollection({ ...input, name: 'Cave 2', folder: `${input.folder} 2` })]);
    expect(a.sceneId).not.toBe(b.sceneId);
    expect(most).toBe(1);
    expect(log.findLastIndex((path) => path.includes('/Cave/'))).toBeLessThan(log.findIndex((path) => path.includes('/Cave 2/')));
    expect((await assets.getCollections()).filter((collection) => collection.id === 'Imported')).toHaveLength(1);
    expect(JSON.parse(await app.vault.adapter.read(a.mapPath)).state).toMatchObject({ mapPath: a.mapPath, background: `${input.folder}/bg.webp` });
    expect(await assets.getAssetById(a.sceneId)).toMatchObject({ collection: 'Imported', data: { mapPath: a.mapPath } });
  });

  it('C-scenes-2: addToCollection refuses paths that leave the folder, and writes nothing', async () => {
    const { scenes, vault } = await withScene();
    const folder = 'atlas-vtt/collections/source/Cave';
    const base = { collection: { id: 'source' }, name: 'Cave', folder, map: emptyMap(), images: [] };
    for (const path of ['../escape.webp', '/abs.webp', 'a/../../b.webp', 'a\\b.webp', '', 'a//b.webp']) {
      await expect(scenes.addToCollection({ ...base, images: [{ path, data: new ArrayBuffer(1) }] })).rejects.toThrow();
    }
    await expect(scenes.addToCollection({ ...base, folder: 'atlas-vtt/collections/other/Cave' })).rejects.toThrow(/inside the collection/);
    await expect(scenes.addToCollection({ ...base, folder: 'atlas-vtt/collections/source/../x' })).rejects.toThrow();
    await expect(scenes.addToCollection({ ...base, collection: { id: 'nope' } })).rejects.toThrow(/no collection/);
    await expect(scenes.addToCollection({ ...base, collection: { name: 'bad/name' } })).rejects.toThrow(/cannot contain/);
    expect(vault.folders.has(folder)).toBe(false);
    expect([...vault.files.keys()].some((path) => path.includes('escape') || path.includes('abs.webp'))).toBe(false);
  });

  it('C-scenes-2: addToCollection reads its input once, as plain data, and wants image data as an ArrayBuffer', async () => {
    const { scenes, vault } = await withScene();
    const folder = 'atlas-vtt/collections/source/Cave';
    const base = { collection: { id: 'source' }, name: 'Cave', folder, map: emptyMap(), images: [] };
    await expect(scenes.addToCollection({ ...base, images: [{ path: 'a.webp', data: new Uint8Array(1) as never }] })).rejects.toThrow(/ArrayBuffer/);
    await expect(scenes.addToCollection({ ...base, map: { ...emptyMap(), extra: () => 1 } as never })).rejects.toThrow(/plain data/);
    let reads = 0;
    const once = { ...base, get name(): string { reads += 1; return reads === 1 ? 'Cave' : ('' as string); } };
    await scenes.addToCollection(once);
    expect(reads).toBe(1);
    expect([...vault.files.keys()].some((path) => path.endsWith('/Cave.atlasmap'))).toBe(true);
  });

  it('C-scenes-2: addToCollection into an existing collection keeps it, numbers a taken map name and does not touch existing files', async () => {
    const { scenes, assets, vault } = await withScene();
    const input = { collection: { id: 'source' }, name: 'Cave', folder: 'atlas-vtt/collections/source/scenes', map: emptyMap(), images: [] };
    const added = await scenes.addToCollection(input);
    expect(added.mapPath).toBe('atlas-vtt/collections/source/scenes/Cave (2).atlasmap');
    expect(vault.files.has(MAP_PATH)).toBe(true);
    await expect(scenes.addToCollection({ ...input, images: [{ path: '../scenes/Cave.atlasmap', data: new ArrayBuffer(1) }] })).rejects.toThrow();
    vi.spyOn(assets, 'addAsset').mockRejectedValueOnce(new Error('nope'));
    await expect(scenes.addToCollection(input)).rejects.toThrow('nope');
    expect(vault.files.has(MAP_PATH)).toBe(true);
    expect(vault.files.has(added.mapPath)).toBe(true);
    expect(vault.files.has('atlas-vtt/collections/source/scenes/Cave (3).atlasmap')).toBe(false);
    expect(vault.folders.has('atlas-vtt/collections/source')).toBe(true);
  });

  it('C-scenes-2: a failed addToCollection removes only the record it added, and never takes a path an index record names', async () => {
    const { scenes, assets, vault } = await withScene();
    const input = { collection: { id: 'source' }, name: 'Cave', folder: 'atlas-vtt/collections/source/scenes', map: emptyMap(), images: [] };
    const ghostPath = 'atlas-vtt/collections/source/scenes/Cave (2).atlasmap';
    const ghost = await assets.addAsset({ type: 'scene', name: 'Ghost', collection: 'source', tags: [], data: { mapPath: ghostPath } });
    const realAdd = assets.addAsset.bind(assets);
    vi.spyOn(assets, 'addAsset').mockImplementationOnce(async (asset) => { await realAdd(asset); throw new Error('index not saved'); });
    await expect(scenes.addToCollection(input)).rejects.toThrow('index not saved');
    expect(await assets.getAssetById(ghost.id)).not.toBeNull();
    expect((await assets.getAssets('source', 'scene')).map((scene) => scene.name).sort()).toEqual(['Cave', 'Ghost']);
    expect(vault.files.has(ghostPath)).toBe(false);
    expect(vault.files.has('atlas-vtt/collections/source/scenes/Cave (3).atlasmap')).toBe(false);
    vi.spyOn(assets, 'addAsset').mockRejectedValueOnce(new Error('again'));
    await expect(scenes.addToCollection(input)).rejects.toThrow('again');
    expect(await assets.getAssetById(ghost.id)).not.toBeNull();
  });

  it('C-scenes-3: readMap returns the migrated map with its size, or null for a missing file', async () => {
    const { scenes, mapPath } = await withScene();
    const map = await scenes.readMap(mapPath);
    expect(map?.objects.tokens).toEqual({});
    expect(map?.background).toBe(BACKGROUND);
    expect(map?.mapSize).toEqual({ width: 320, height: 200 });
    expect(await scenes.readMap('nope.atlasmap')).toBeNull();
    await expect(scenes.readMap('atlas-vtt/assets/bg.png')).rejects.toThrow(/\.atlasmap/);
  });

  it('C-scenes-3: readMap copies nothing private, hands out a frozen copy and sizes a map without a background 0 x 0', async () => {
    const { scenes, mapPath, vault } = await withScene();
    const map = (await scenes.readMap(mapPath))!;
    expect(Object.keys(map).sort()).toEqual([
      'background', 'camera', 'grid', 'initiative', 'initiativeTrackerOpen', 'lightZones', 'lighting', 'lights', 'mapSize', 'objects',
      'pins', 'tokenSettings', 'walls', 'widgets',
    ]);
    expect(Object.keys(map.objects).sort()).toEqual(['drawings', 'fog', 'texts', 'tokens']);
    expect(JSON.stringify(map)).not.toContain('Secret');
    expect(JSON.stringify(map)).not.toContain('mask');
    expect(Object.isFrozen(map)).toBe(true);
    expect(Object.isFrozen(map.objects)).toBe(true);
    expect(Object.isFrozen(map.pins!.p1)).toBe(true);
    expect(Object.isFrozen(map.tokenSettings)).toBe(true);
    const plain = 'atlas-vtt/collections/source/scenes/Plain.atlasmap';
    await vault.app.vault.create(plain, savedMapText(emptyMap(), plain, 'Plain'));
    expect((await scenes.readMap(plain))?.mapSize).toEqual({ width: 0, height: 0 });
  });

  it('C-scenes-3: readMap hands out pins with their note links, walls, lights, camera, token settings and the tracker as saved', async () => {
    const { scenes, mapPath } = await withScene();
    const map = (await scenes.readMap(mapPath))!;
    expect(map.pins).toEqual({ p1: { id: 'p1', kind: 'pin', x: 5, y: 6, notePath: 'Notes/Cave entrance.md' } });
    expect(map.walls).toEqual({ w: { id: 'w' } });
    expect(map.lights).toEqual({});
    expect(map.camera).toEqual({ x: 12, y: 34, scale: 2 });
    expect(map.initiativeTrackerOpen).toBe(true);
    // The file's two bar switches become the hidden resources, as when the map loads; Atlas's defaults fill the rest.
    expect(map.tokenSettings).toEqual({ ...DEFAULT_TOKEN_SETTINGS, showNameplates: true, tokenRingSize: 1.5, hiddenResources: ['hp'] });
  });

  it('C-scenes-3: readMap gives an old file without them empty records, the default camera and settings, and a closed tracker', async () => {
    const { scenes, vault } = await withScene();
    const old = 'atlas-vtt/collections/source/scenes/Old.atlasmap';
    const state = { schema: 'atlas-vtt', version: 3, background: null, grid: null, objects: { tokens: {}, fog: {}, texts: {}, drawings: {} } };
    await vault.app.vault.create(old, JSON.stringify({ state, version: 3 }));
    const map = (await scenes.readMap(old))!;
    expect(map.pins).toEqual({});
    expect(map.walls).toEqual({});
    expect(map.lights).toEqual({});
    expect(map.lightZones).toEqual({});
    expect(map.camera).toEqual({ x: 0, y: 0, scale: 1 });
    expect(map.tokenSettings).toEqual(DEFAULT_TOKEN_SETTINGS);
    expect(map.initiativeTrackerOpen).toBe(false);
    expect(Object.isFrozen(map.camera)).toBe(true);
  });

  it('rejects with a clear error when the asset index failed to load', async () => {
    const vault = createInMemoryApp();
    vi.spyOn(AssetService.getInstance(vault.app), 'initialize').mockRejectedValue(new Error('disk gone'));
    await expect(scenesApi(vault.app, { id: 'ext' }).list()).rejects.toThrow(/asset index is not available: disk gone/);
  });
});

describe('scenes-changed', () => {
  it('C-scenes-4: fires when scene records are added, renamed, moved or removed, and not for anything else', async () => {
    const { assets, sceneId } = await withScene();
    const changed = vi.fn();
    const stop = assets.onScenesChanged(changed);
    await assets.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'source', tags: [] });
    await assets.updateAsset(sceneId, { tags: ['x'] });
    expect(changed).not.toHaveBeenCalled();
    const added = await assets.addAsset({ type: 'scene', name: 'Inn', collection: 'source', tags: [], data: { mapPath: 'inn.atlasmap' } });
    expect(changed).toHaveBeenCalledTimes(1);
    await assets.updateAsset(added.id, { name: 'Tavern' });
    expect(changed).toHaveBeenCalledTimes(2);
    await assets.updateAsset(added.id, { data: { mapPath: 'tavern.atlasmap' } });
    expect(changed).toHaveBeenCalledTimes(3);
    await assets.deleteAsset(added.id);
    expect(changed).toHaveBeenCalledTimes(4);
    stop();
    await assets.addAsset({ type: 'scene', name: 'Again', collection: 'source', tags: [], data: { mapPath: 'again.atlasmap' } });
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it('C-scenes-4: a failing listener does not stop the others', async () => {
    const { assets } = await withScene();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const later = vi.fn();
    assets.onScenesChanged(() => { throw new Error('boom'); });
    assets.onScenesChanged(later);
    await assets.addAsset({ type: 'scene', name: 'Inn', collection: 'source', tags: [], data: { mapPath: 'inn.atlasmap' } });
    expect(later).toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
  });
});

describe('bundles', () => {
  let saved: Record<string, string[]> = {};
  const attach = (): void => bundleNoteKeys.attach({ read: () => saved, write: (keys) => { saved = keys; } });
  beforeEach(() => { saved = {}; attach(); });
  const sets: DisposerSet[] = [];
  const scope = (id: string): { id: string; disposers: DisposerSet } => { const disposers = new DisposerSet(); sets.push(disposers); return { id, disposers }; };
  afterEach(() => { bundleNoteKeys.detach(); for (const set of sets.splice(0)) set.disposeAll(); });

  it('C-bundles-1: stripNoteProperties adds keys until disposed', () => {
    const stop = bundlesApi(scope('ext')).stripNoteProperties(['ext-share']);
    expect(bundleNoteKeys.keys().has('ext-share')).toBe(true);
    stop();
    expect(bundleNoteKeys.keys().has('ext-share')).toBe(false);
    expect(saved).toEqual({});
  });

  it('C-bundles-2: a key stays stripped after the extension unloads, also after Atlas restarts, and bad input is refused', () => {
    const own = scope('ext');
    const bundles = bundlesApi(own);
    bundles.stripNoteProperties(['Ext-Share', 'secret']);
    expect([...bundleNoteKeys.keys()].sort()).toEqual(['ext-share', 'secret']);
    expect(() => bundles.stripNoteProperties([''])).toThrow(/non-empty/);
    expect(() => bundles.stripNoteProperties('ext-share' as never)).toThrow(/array/);
    own.disposers.disposeAll(); // the extension unloads
    expect([...bundleNoteKeys.keys()].sort()).toEqual(['ext-share', 'secret']);
    expect(saved).toEqual({ ext: ['ext-share', 'secret'] });
    // Atlas restarts with the extension not loaded: the settings bring the keys back
    bundleNoteKeys.detach();
    attach();
    expect([...bundleNoteKeys.keys()].sort()).toEqual(['ext-share', 'secret']);
  });

  it('C-bundles-3: a disposer called twice forgets nothing a later call remembered, and the caller changing its array changes nothing', () => {
    const bundles = bundlesApi(scope('ext'));
    const keys = ['a'];
    const first = bundles.stripNoteProperties(keys);
    keys.push('b');
    expect([...bundleNoteKeys.keys()]).toEqual(['a']);
    first();
    bundles.stripNoteProperties(['a']);
    first();
    expect([...bundleNoteKeys.keys()]).toEqual(['a']);
    expect(saved).toEqual({ ext: ['a'] });
  });

  it('C-bundles-2: refuses more than 100 keys or a key longer than 200 characters', () => {
    const bundles = bundlesApi(scope('ext'));
    expect(() => bundles.stripNoteProperties(Array.from({ length: 101 }, (_, index) => `k${index}`))).toThrow(/at most 100/);
    expect(() => bundles.stripNoteProperties(['x'.repeat(201)])).toThrow(/200 characters/);
    expect(bundleNoteKeys.keys().size).toBe(0);
  });

  it('C-bundles-3: an explicit dispose forgets the key, unless another registration of the extension still holds it', () => {
    const own = scope('ext');
    const bundles = bundlesApi(own);
    const first = bundles.stripNoteProperties(['a', 'b']);
    const second = bundles.stripNoteProperties(['b']);
    first();
    expect([...bundleNoteKeys.keys()].sort()).toEqual(['b']);
    expect(saved).toEqual({ ext: ['b'] });
    second();
    expect(bundleNoteKeys.keys().size).toBe(0);
    expect(saved).toEqual({});
  });

  it('C-bundles-3: another extension keeps its own remembered keys', () => {
    const one = bundlesApi(scope('one'));
    bundlesApi(scope('two')).stripNoteProperties(['x']);
    one.stripNoteProperties(['x'])();
    expect(saved).toEqual({ two: ['x'] });
    expect(bundleNoteKeys.keys().has('x')).toBe(true);
  });

  it('reads remembered keys from settings it cannot trust', () => {
    saved = { good: ['Key', 3, ''], bad: 'nope', empty: [] } as never;
    attach();
    expect([...bundleNoteKeys.keys()]).toEqual(['key']);
  });
});

describe('forgetNoteProperties', () => {
  it('C-bundles-4: forgets what an extension asked for, also from earlier sessions, and nothing of another extension', () => {
    let saved: Record<string, string[]> = { gone: ['old-key'], other: ['x'] };
    bundleNoteKeys.attach({ read: () => saved, write: (keys) => { saved = keys; } });
    const bundles = bundlesApi({ id: 'gone', disposers: new DisposerSet() });
    expect(bundleNoteKeys.keys().has('old-key')).toBe(true);
    bundles.forgetNoteProperties();
    expect(saved).toEqual({ other: ['x'] });
    expect([...bundleNoteKeys.keys()]).toEqual(['x']);
    bundleNoteKeys.detach();
  });
});
