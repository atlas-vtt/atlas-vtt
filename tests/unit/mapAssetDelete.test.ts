import { afterEach, beforeEach, expect, it } from 'vitest';
import { AssetService, type MapAsset } from '../../src/app/services/AssetService';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const IMAGE = 'atlas-vtt/assets/region.webp';
const THUMB = 'atlas-vtt/assets/thumbnails/region-abc.webp';
const SCENE_MAP = 'atlas-vtt/collections/default/scenes/Cave.atlasmap';

let vault: InMemoryApp;
let assets: AssetService;

const sceneFile = (state: Record<string, unknown>): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, background: null, grid: null, camera: { x: 0, y: 0, scale: 1 },
    objects: { tokens: {}, pins: {}, fog: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    ...state,
  },
});

const addMap = (thumbnailPath?: string): Promise<MapAsset> => assets.addAsset({
  type: 'map', name: 'Region', collection: AssetService.defaultCollectionId(), tags: [], mapFilePath: IMAGE, thumbnailPath,
}) as Promise<MapAsset>;

beforeEach(async () => {
  vault = createInMemoryApp({ files: { [IMAGE]: 'IMG', [THUMB]: 'THUMB' } });
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
});

afterEach(() => AssetService.resetInstance());

it('trashes a map\'s image and thumbnail with it', async () => {
  const map = await addMap(THUMB);
  await assets.deleteAsset(map.id);
  expect(vault.files.has(IMAGE)).toBe(false);
  expect(vault.files.has(THUMB)).toBe(false);
});

it('keeps the image and thumbnail a copy of the map still shows', async () => {
  const map = await addMap(THUMB);
  const copy = await addMap(THUMB);
  await assets.deleteAsset(map.id);
  expect(vault.files.has(IMAGE)).toBe(true);
  expect(vault.files.has(THUMB)).toBe(true);
  expect(await assets.getAssetById(copy.id)).toMatchObject({ mapFilePath: IMAGE, thumbnailPath: THUMB });

  await assets.deleteAsset(copy.id);
  expect(vault.files.has(IMAGE)).toBe(false);
  expect(vault.files.has(THUMB)).toBe(false);
});

it.each([
  ['background', { background: IMAGE }],
  ['level map', { levels: [{ id: 'l1', name: 'Ground', background: 'atlas-vtt/assets/other.webp' }, { id: 'l2', name: 'Upper', background: IMAGE }] }],
  ['level roof', { levels: [{ id: 'l1', name: 'Ground', background: null, foreground: IMAGE }] }],
])('keeps the image a scene uses as its %s', async (_, state) => {
  await vault.app.vault.create(SCENE_MAP, sceneFile(state));
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: AssetService.defaultCollectionId(), tags: [], data: { mapPath: SCENE_MAP } });
  const map = await addMap(THUMB);
  await assets.deleteAsset(map.id);
  expect(vault.files.has(IMAGE)).toBe(true);
  expect(vault.files.has(THUMB)).toBe(false);
});

it('keeps the image while a scene\'s map cannot be read, as it may use it', async () => {
  await vault.app.vault.create(SCENE_MAP, '{ half written');
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: AssetService.defaultCollectionId(), tags: [], data: { mapPath: SCENE_MAP } });
  const map = await addMap(THUMB);
  await assets.deleteAsset(map.id);
  expect(vault.files.has(IMAGE)).toBe(true);
  expect(vault.files.has(THUMB)).toBe(true);
});

it('keeps an image a note links to', async () => {
  await vault.app.vault.create('Notes/Region.md', '![[region.webp]]');
  const map = await addMap(THUMB);
  await assets.deleteAsset(map.id);
  expect(vault.files.has(IMAGE)).toBe(true);
  expect(vault.files.has(THUMB)).toBe(false);
});

it('never trashes an image outside Atlas\'s folder that a map record names', async () => {
  await vault.app.vault.create('Art/my-map.png', 'PNG');
  const map = await assets.addAsset({ type: 'map', name: 'Mine', collection: AssetService.defaultCollectionId(), tags: [], mapFilePath: 'Art/my-map.png' });
  await assets.deleteAsset(map.id);
  expect(vault.files.has('Art/my-map.png')).toBe(true);
});
