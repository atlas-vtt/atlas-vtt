// @vitest-environment node
// Reading an image header needs Blob.arrayBuffer, which jsdom lacks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scenesApi } from '../../src/api/scenes';
import type { SavedMapInput } from '../../src/api/types/scenes';
import { AssetService } from '../../src/app/services/AssetService';
import { assetFilePath } from '../../src/app/services/vault-sync/assetFiles';
import { fakeView, trackerWith } from './apiFakes';
import { emptyMap, MAP_PATH, withScene, type Fixture } from './scenesFixture';

const FOLDER = 'atlas-vtt/collections/Imported/Cave';
const image = (path: string, text = path): { path: string; data: ArrayBuffer } => ({ path, data: new TextEncoder().encode(text).buffer });
const withToken = (imagePath: string, fields: Partial<SavedMapInput> = {}): SavedMapInput => emptyMap({
  ...fields, objects: { tokens: { t1: { kind: 'token', id: 't1', x: 0, y: 0, imagePath } }, texts: {}, drawings: {}, fog: {} },
});

/** A scene this extension added: background bg.webp, one token drawn with tok.png. */
async function added(fixture: Fixture): Promise<{ sceneId: string; mapPath: string }> {
  return fixture.scenes.addToCollection({
    collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER,
    map: withToken('tok.png', { background: 'bg.webp' }), images: [image('bg.webp', 'old bg'), image('tok.png', 'old token')],
  });
}

const files = (fixture: Fixture): string[] => [...fixture.vault.files.keys()].filter((path) => path.startsWith(FOLDER)).sort();

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => vi.restoreAllMocks());

describe('scenes.replaceMap', () => {
  it('C-scenes-5: replaces the map and images of a scene the extension added, keeping its id, name and collection', async () => {
    const fixture = await withScene();
    const { sceneId, mapPath } = await added(fixture);
    // Another asset still draws the old token image: it stays.
    await fixture.assets.addTokenAsset({ name: 'Goblin', imagePath: `${FOLDER}/tok.png`, collection: 'Imported', tags: [] });
    const pins = { p: { id: 'p', kind: 'pin' as const, x: 1, y: 2, notePath: 'Notes/Cave.md' } };
    const result = await fixture.scenes.replaceMap!(sceneId, { map: emptyMap({ background: 'bg.webp', pins, camera: { x: 3, y: 4, scale: 2 } }), images: [image('bg.webp', 'new bg')] });
    expect(result).toEqual({ sceneId, mapPath });
    const map = (await fixture.scenes.readMap(mapPath))!;
    expect(map.background).toBe(`${FOLDER}/bg (2).webp`);
    expect(map.pins).toEqual(pins);
    expect(map.camera).toEqual({ x: 3, y: 4, scale: 2 });
    expect(map.objects.tokens).toEqual({});
    expect(files(fixture)).toEqual([`${FOLDER}/Cave.atlasmap`, `${FOLDER}/bg (2).webp`, `${FOLDER}/tok.png`]);
    expect(fixture.vault.files.get(`${FOLDER}/bg (2).webp`)).toBe('new bg');
    expect(await fixture.assets.getAssetById(sceneId)).toMatchObject({ name: 'Cave', collection: 'Imported', data: { mapPath } });
  });

  it('C-scenes-5: keeps who added a scene in the index only, never in its record file or its extension data', async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    const scene = (await fixture.assets.getAssetById(sceneId))!;
    expect(scene.data).toMatchObject({ createdBy: 'ext' });
    const record = assetFilePath(scene);
    expect(fixture.vault.files.get(record)).toContain(scene.data!.mapPath!);
    expect(fixture.vault.files.get(record)).not.toContain('createdBy');
    expect(await fixture.scenes.getData(sceneId)).toBeUndefined();
  });

  it("C-scenes-5: refuses the GM's own scene and another extension's, changing nothing", async () => {
    const fixture = await withScene();
    const { sceneId, mapPath } = await added(fixture);
    const before = new Map(fixture.vault.files);
    const input = { map: emptyMap(), images: [image('new.webp')] };
    await expect(fixture.scenes.replaceMap!(fixture.sceneId, input)).rejects.toThrow(/only a scene this extension added/);
    const other = scenesApi(fixture.vault.app, { id: 'other' });
    await expect(other.replaceMap!(sceneId, input)).rejects.toThrow(/only a scene this extension added/);
    await expect(fixture.scenes.replaceMap!('nope', input)).rejects.toThrow(/no scene/);
    expect(new Map(fixture.vault.files)).toEqual(before);
    expect(fixture.vault.files.get(MAP_PATH)).toBe(before.get(MAP_PATH));
    expect(fixture.vault.files.get(mapPath)).toBe(before.get(mapPath));
  });

  it("C-scenes-5: refuses a scene whose map file lies outside its collection's folder", async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    // The index says this extension added it, but the record now names a map elsewhere (the GM's own Cave).
    const record = (await fixture.assets.getAssetById(sceneId))!;
    await fixture.assets.updateAsset(sceneId, { data: { ...(record as { data: object }).data, mapPath: MAP_PATH } } as never);
    const before = await fixture.vault.app.vault.adapter.read(MAP_PATH);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [] })).rejects.toThrow(/not inside its collection's folder/);
    expect(await fixture.vault.app.vault.adapter.read(MAP_PATH)).toBe(before);
  });

  it('C-scenes-5: an image whose write fails is not undone, so a file another wrote at that path stays', async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    const createBinary = fixture.vault.app.vault.createBinary;
    vi.mocked(createBinary).mockImplementationOnce(async (path: string) => {
      await fixture.vault.app.vault.create(path, 'someone else');
      throw new Error('taken');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [image('new.webp')] })).rejects.toThrow('taken');
    expect(await fixture.vault.app.vault.adapter.read(`${FOLDER}/new.webp`)).toBe('someone else');
  });

  it('C-scenes-5: malformed input, or a write that fails, leaves the map and its folder as they were', async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    const before = new Map(fixture.vault.files);
    for (const input of [
      { map: emptyMap({ camera: { x: 0, y: 0, scale: -1 } }), images: [image('new.webp')] },
      { map: emptyMap({ pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: '/abs.md' } } }), images: [] },
      { map: emptyMap(), images: [image('../out.webp')] },
      { map: emptyMap({ grid: { enabled: true, size: -1, offsetX: 0, offsetY: 0, opacity: 1 } }), images: [] },
      { map: emptyMap({ grid: { enabled: true, size: 38.52, offsetX: 5.53816e87, offsetY: 0, opacity: 1 } }), images: [] },
      { map: emptyMap({ grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, lineType: 'wavy' as never } }), images: [] },
      { map: null, images: [] },
    ]) {
      await expect(fixture.scenes.replaceMap!(sceneId, input as never)).rejects.toThrow(/\[Atlas API\]/);
      expect(new Map(fixture.vault.files)).toEqual(before);
    }
    vi.mocked(fixture.vault.app.vault.process).mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [image('new.webp')] })).rejects.toThrow('disk full');
    expect(new Map(fixture.vault.files)).toEqual(before);
  });

  it('C-scenes-5: refuses a scene open in a map view, also as a tab not shown, so no open view saves over it', async () => {
    const view = fakeView('v1');
    const fixture = await withScene(trackerWith([view]).tracker);
    const { sceneId, mapPath } = await added(fixture);
    view.tabMetaStore.getState().addTab(mapPath, 'Cave');
    const before = fixture.vault.files.get(mapPath);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [] })).rejects.toThrow(/open in a map view/);
    expect(fixture.vault.files.get(mapPath)).toBe(before);
    view.close();
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [] })).resolves.toEqual({ sceneId, mapPath });
  });
  it('C-scenes-5: removes only images Atlas wrote for the scene, and keeps the list to the live ones', async () => {
    const fixture = await withScene();
    const { sceneId, mapPath } = await added(fixture);
    // The GM drew a token with their own art from the same folder: the old map names it, Atlas never wrote it.
    await fixture.vault.app.vault.create(`${FOLDER}/gm-art.png`, 'gm art');
    const file = JSON.parse(fixture.vault.files.get(mapPath)!) as { state: { objects: { tokens: Record<string, { imagePath: string }> } } };
    file.state.objects.tokens.t1!.imagePath = `${FOLDER}/gm-art.png`;
    fixture.vault.files.set(mapPath, JSON.stringify(file));
    await fixture.scenes.replaceMap!(sceneId, { map: emptyMap({ background: 'one.webp' }), images: [image('one.webp')] });
    expect(files(fixture)).toEqual([`${FOLDER}/Cave.atlasmap`, `${FOLDER}/gm-art.png`, `${FOLDER}/one.webp`]);
    const created = async (): Promise<string[] | undefined> => (await fixture.assets.getAssetById(sceneId))?.data?.createdImages;
    expect(await created()).toEqual([`${FOLDER}/one.webp`]);
    await fixture.scenes.replaceMap!(sceneId, { map: withToken('two.png', { background: 'one.webp' }), images: [image('one.webp', 'again'), image('two.png')] });
    expect(files(fixture)).toEqual([`${FOLDER}/Cave.atlasmap`, `${FOLDER}/gm-art.png`, `${FOLDER}/one (2).webp`, `${FOLDER}/two.png`]);
    expect((await created())?.sort()).toEqual([`${FOLDER}/one (2).webp`, `${FOLDER}/two.png`]);
  });

  it("C-scenes-5: keeps the GM's note link, dice log, pinned previews and loot roller, and resets explored memory", async () => {
    const fixture = await withScene();
    const { sceneId, mapPath } = await added(fixture);
    const play = { dmNotePath: 'DM/Cave.md', diceLog: [{ id: 'r1' }], pinnedNotePreviews: [{ path: 'Notes/a.md' }], lootRoller: { open: true } };
    const file = JSON.parse(fixture.vault.files.get(mapPath)!) as { state: Record<string, unknown> };
    Object.assign(file.state, play, { exploredMask: 'mask' });
    fixture.vault.files.set(mapPath, JSON.stringify(file));
    await fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [] });
    const state = (JSON.parse(fixture.vault.files.get(mapPath)!) as { state: Record<string, unknown> }).state;
    expect(state).toMatchObject(play);
    expect(state).not.toHaveProperty('exploredMask');
  });

  it('C-scenes-5: checks again just before writing, so a tab opened meanwhile refuses the replace', async () => {
    const view = fakeView('v1');
    const fixture = await withScene(trackerWith([view]).tracker);
    const { sceneId, mapPath } = await added(fixture);
    const before = new Map(fixture.vault.files);
    const write = vi.mocked(fixture.vault.app.vault.createBinary);
    const original = write.getMockImplementation()!;
    write.mockImplementationOnce(async (path, data) => {
      view.tabMetaStore.getState().addTab(mapPath, 'Cave');
      return original(path, data);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(fixture.scenes.replaceMap!(sceneId, { map: emptyMap(), images: [image('new.webp')] })).rejects.toThrow(/open in a map view/);
    expect(new Map(fixture.vault.files)).toEqual(before);
  });
  it('C-scenes-5: a change to the scene record during the call survives; only the image list is updated', async () => {
    const fixture = await withScene();
    const { sceneId } = await added(fixture);
    const moved = 'atlas-vtt/collections/Imported/Moved.atlasmap';
    const write = vi.mocked(fixture.vault.app.vault.process);
    const original = write.getMockImplementation()!;
    write.mockImplementationOnce(async (file, fn) => {
      const result = await original(file, fn);
      const scene = (await fixture.assets.getAssetById(sceneId))!;
      await fixture.assets.updateAsset(sceneId, { data: { ...scene.data, mapPath: moved } });
      return result;
    });
    await fixture.scenes.replaceMap!(sceneId, { map: emptyMap({ background: 'new.webp' }), images: [image('new.webp')] });
    const scene = (await fixture.assets.getAssetById(sceneId))!;
    expect(scene.data).toMatchObject({ mapPath: moved, createdBy: 'ext', createdImages: [`${FOLDER}/new.webp`] });
  });
});
