import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { transferAssets } from '../../src/app/services/assetTransfer/assetTransfer';
import { folderIdOf, tabFolderPath } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import { assetFolderId, isTabAsset } from '../../src/app/packages/components/asset-manager/utils/assetFormatters';
import { folderMoveProblem, moveAssetsIntoFolder } from '../../src/app/packages/components/asset-manager/utils/assetFolderMove';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';


const MAPS = tabFolderPath('camp', 'maps');
const SCENES = tabFolderPath('camp', 'scenes');
const MAP_IMAGE = 'atlas-vtt/assets/forest_123.webp';
const SCENE_FILE = `${SCENES}/Forest.atlasmap`;

interface Vault { vault: InMemoryApp; assets: AssetService; mapId: string; sceneId: string }

const MAP_RECORD = (id: string): string => `${MAPS}/${id}.json`;
const FOLDER_RECORD = (id: string): string => `${MAPS}/Wilderness/${id}.json`;

async function seededVault(): Promise<Vault> {
  const vault = createInMemoryApp({ folders: [`${MAPS}/Wilderness`, `${SCENES}/Act 1`] });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('camp');
  await vault.app.vault.create(MAP_IMAGE, 'IMG');
  await vault.app.vault.create(SCENE_FILE, '{}');
  await assets.addAsset({ type: 'map', name: 'Forest', collection: 'camp', tags: [], mapFilePath: MAP_IMAGE });
  await assets.addAsset({ type: 'scene', name: 'Forest', collection: 'camp', tags: [], data: { mapPath: SCENE_FILE } });
  const [map] = await assets.getAssets('camp', 'map');
  const [scene] = await assets.getAssets('camp', 'scene');
  return { vault, assets, mapId: map!.id, sceneId: scene!.id };
}

async function folderOf(assets: AssetService, id: string, tabBase: string): Promise<string | null> {
  const asset: Asset | null = await assets.getAssetById(id);
  if (!asset || !isTabAsset(asset)) throw new Error(`No asset ${id}`);
  return assetFolderId(asset, tabBase);
}

beforeEach(() => { AssetService.resetInstance(); });

describe('moving assets into asset manager folders', () => {
  it('moves a map by moving its record into the folder, keeping its image in the shared assets folder', async () => {
    const { vault, assets, mapId } = await seededVault();
    const folder = folderIdOf(`${MAPS}/Wilderness`);

    const result = await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, folder);

    expect(result).toEqual({ moved: [mapId], nameClashes: [], failed: [] });
    expect(vault.files.has(FOLDER_RECORD(mapId))).toBe(true);
    expect(vault.files.has(MAP_RECORD(mapId))).toBe(false);
    expect(vault.files.has(MAP_IMAGE)).toBe(true);
    expect(await assets.getAssetById(mapId)).toMatchObject({ filePath: FOLDER_RECORD(mapId), mapFilePath: MAP_IMAGE });
    expect(await folderOf(assets, mapId, MAPS)).toBe(folder);
  });

  it('moves a scene by moving its map file into the folder', async () => {
    const { vault, assets, sceneId } = await seededVault();
    const folder = folderIdOf(`${SCENES}/Act 1`);

    await moveAssetsIntoFolder(vault.app, assets, [sceneId], SCENES, folder);

    expect(vault.files.has(`${SCENES}/Act 1/Forest.atlasmap`)).toBe(true);
    expect(await folderOf(assets, sceneId, SCENES)).toBe(folder);
  });

  it('moves an asset out of a folder to the top level of its tab', async () => {
    const { vault, assets, mapId } = await seededVault();
    await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, folderIdOf(`${MAPS}/Wilderness`));

    await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, null);

    expect(vault.files.has(MAP_RECORD(mapId))).toBe(true);
    expect(await folderOf(assets, mapId, MAPS)).toBeNull();
  });

  it('leaves assets that are already in the target folder alone', async () => {
    const { vault, assets, mapId } = await seededVault();

    const result = await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, null);

    expect(result.moved).toEqual([]);
    expect(vault.files.has(MAP_RECORD(mapId))).toBe(true);
  });

  it('keeps a map in its folder through the vault check', async () => {
    const { vault, assets, mapId } = await seededVault();
    await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, folderIdOf(`${MAPS}/Wilderness`));

    await assets.reconcileWithVault();

    expect(await assets.getAssets('camp', 'map')).toEqual([expect.objectContaining({ id: mapId, filePath: FOLDER_RECORD(mapId) })]);
  });

  it('finds a map whose record was moved into a folder outside Atlas', async () => {
    const { vault, assets, mapId } = await seededVault();
    await vault.app.vault.rename(vault.app.vault.getFileByPath(MAP_RECORD(mapId))!, FOLDER_RECORD(mapId));

    await assets.reconcileWithVault();

    expect(await assets.getAssets('camp', 'map')).toEqual([expect.objectContaining({ id: mapId, filePath: FOLDER_RECORD(mapId) })]);
  });

  it('copies a map in a folder to another collection into the same folder, sharing its image', async () => {
    const { vault, assets, mapId } = await seededVault();
    await assets.createCollection('keep');
    await moveAssetsIntoFolder(vault.app, assets, [mapId], MAPS, folderIdOf(`${MAPS}/Wilderness`));

    await transferAssets(vault.app, assets, { assetIds: [mapId], targetCollectionId: 'keep', mode: 'copy' });

    const [copy] = await assets.getAssets('keep', 'map');
    expect(copy).toMatchObject({ mapFilePath: MAP_IMAGE, filePath: `${tabFolderPath('keep', 'maps')}/Wilderness/${copy!.id}.json` });
    expect(vault.files.has(copy!.filePath!)).toBe(true);
    expect([...vault.files.keys()].filter((path) => path.endsWith('.webp'))).toEqual([MAP_IMAGE]);
  });

  it('keeps an asset in place when the folder already holds a file of the same name', async () => {
    const { vault, assets, sceneId } = await seededVault();
    await vault.app.vault.create(`${SCENES}/Act 1/Forest.atlasmap`, '{}');

    const result = await moveAssetsIntoFolder(vault.app, assets, [sceneId], SCENES, folderIdOf(`${SCENES}/Act 1`));

    expect(result).toEqual({ moved: [], nameClashes: ['Forest'], failed: [] });
    expect(await assets.getAssetById(sceneId)).toMatchObject({ data: { mapPath: SCENE_FILE } });
    expect(folderMoveProblem(result)).toBe('Forest stayed: the folder already holds a file of the same name.');
  });
});
