import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { folderIdOf, readTabFolders, tabFolderPath } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import { assetFolderId, isTabAsset } from '../../src/app/packages/components/asset-manager/utils/assetFormatters';
import { moveAssetsIntoFolder } from '../../src/app/packages/components/asset-manager/utils/assetFolderMove';
import {
  createSubfolder, folderContents, foldersMoveProblem, moveFoldersIntoFolder,
} from '../../src/app/packages/components/asset-manager/utils/assetFolderTree';
import type { Tab } from '../../src/app/packages/components/asset-manager/types';
import { t } from '../../src/app/i18n';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const TOKENS = tabFolderPath('camp', 'tokens');
const MAPS = tabFolderPath('camp', 'maps');
const SCENES = tabFolderPath('camp', 'scenes');
const MAP_IMAGE = 'atlas-vtt/assets/forest_123.webp';
const NOTHING_MOVED = { moved: [], nameClashes: [], intoItself: [], failed: [] };

interface Vault { vault: InMemoryApp; assets: AssetService; mapId: string; sceneId: string; orcId: string; lichId: string }

/** A scene in "Act 1", a map in "Wilderness", an orc in "Villains" and a lich in "Villains/Bosses". */
async function seededVault(): Promise<Vault> {
  const vault = createInMemoryApp({
    folders: [`${MAPS}/Wilderness`, `${MAPS}/Atlas`, `${SCENES}/Act 1`, `${SCENES}/Campaign`, `${TOKENS}/Villains/Bosses`, `${TOKENS}/Heroes`],
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('camp');
  await vault.app.vault.create(MAP_IMAGE, 'IMG');
  await vault.app.vault.create(`${SCENES}/Act 1/Forest.atlasmap`, '{}');
  await vault.app.vault.create(`${TOKENS}/Villains/orc.webp`, 'IMG');
  await vault.app.vault.create(`${TOKENS}/Villains/Bosses/lich.webp`, 'IMG');
  await assets.addAsset({ type: 'map', name: 'Forest', collection: 'camp', tags: [], mapFilePath: MAP_IMAGE });
  await assets.addAsset({ type: 'scene', name: 'Forest', collection: 'camp', tags: [], data: { mapPath: `${SCENES}/Act 1/Forest.atlasmap` } });
  await assets.addAsset({ type: 'token', name: 'Orc', collection: 'camp', tags: [], imagePath: `${TOKENS}/Villains/orc.webp` });
  await assets.addAsset({ type: 'token', name: 'Lich', collection: 'camp', tags: [], imagePath: `${TOKENS}/Villains/Bosses/lich.webp` });
  const [map] = await assets.getAssets('camp', 'map');
  const [scene] = await assets.getAssets('camp', 'scene');
  const tokens = await assets.getAssets('camp', 'token');
  const idOf = (name: string): string => tokens.find((token) => token.name === name)!.id;
  await moveAssetsIntoFolder(vault.app, assets, [map!.id], MAPS, folderIdOf(`${MAPS}/Wilderness`));
  return { vault, assets, mapId: map!.id, sceneId: scene!.id, orcId: idOf('Orc'), lichId: idOf('Lich') };
}

async function folderOf(assets: AssetService, id: string, tabBase: string): Promise<string | null> {
  const asset: Asset | null = await assets.getAssetById(id);
  if (!asset || !isTabAsset(asset)) throw new Error(`No asset ${id}`);
  return assetFolderId(asset, tabBase);
}

/** A tab's folders as the asset manager reads them when the tab is shown again. */
const folderPaths = (vault: InMemoryApp, tab: Tab): string[] => readTabFolders(vault.app, 'camp', tab).map((folder) => folder.path).sort();

beforeEach(() => { AssetService.resetInstance(); });

describe('a folder made inside an asset manager folder', () => {
  it('is a vault folder, read with its parent when the tab is shown again', async () => {
    const { vault } = await seededVault();

    const id = await createSubfolder(vault.app, folderIdOf(`${TOKENS}/Villains/Bosses`), ' Liches ');

    expect(id).toBe(folderIdOf(`${TOKENS}/Villains/Bosses/Liches`));
    expect(readTabFolders(vault.app, 'camp', 'tokens').find((folder) => folder.id === id)).toMatchObject({
      name: 'Liches', path: 'Villains/Bosses/Liches', parentId: folderIdOf(`${TOKENS}/Villains/Bosses`),
    });
  });

  it('is not made under a name the folder already holds', async () => {
    const { vault } = await seededVault();

    await expect(createSubfolder(vault.app, folderIdOf(`${TOKENS}/Villains`), 'BOSSES')).rejects.toThrow(t('am.folder.subfolderExists', { name: 'BOSSES' }));
    await expect(createSubfolder(vault.app, folderIdOf(`${TOKENS}/Villains`), 'orc.webp')).rejects.toThrow(t('am.folder.subfolderExists', { name: 'orc.webp' }));

    expect(folderPaths(vault, 'tokens')).toEqual(['Heroes', 'Villains', 'Villains/Bosses']);
  });
});

describe('moving asset manager folders into a folder', () => {
  it('moves the vault folder, and keeps the tokens in it and in its subfolders by their records', async () => {
    const { vault, assets, orcId, lichId } = await seededVault();
    const villains = folderIdOf(`${TOKENS}/Villains`);

    const result = await moveFoldersIntoFolder(vault.app, assets, [villains], TOKENS, folderIdOf(`${TOKENS}/Heroes`));

    expect(result).toEqual({ ...NOTHING_MOVED, moved: [{ from: villains, to: folderIdOf(`${TOKENS}/Heroes/Villains`) }] });
    expect(folderPaths(vault, 'tokens')).toEqual(['Heroes', 'Heroes/Villains', 'Heroes/Villains/Bosses']);
    expect(vault.files.has(`${TOKENS}/Heroes/Villains/Bosses/lich.webp`)).toBe(true);
    expect(await folderOf(assets, orcId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Heroes/Villains`));
    expect(await folderOf(assets, lichId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Heroes/Villains/Bosses`));
  });

  it('keeps a scene and a map in a moved folder', async () => {
    const { vault, assets, sceneId, mapId } = await seededVault();

    await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${SCENES}/Act 1`)], SCENES, folderIdOf(`${SCENES}/Campaign`));
    await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${MAPS}/Wilderness`)], MAPS, folderIdOf(`${MAPS}/Atlas`));

    expect(await assets.getAssetById(sceneId)).toMatchObject({ data: { mapPath: `${SCENES}/Campaign/Act 1/Forest.atlasmap` } });
    expect(await assets.getAssetById(mapId)).toMatchObject({ filePath: `${MAPS}/Atlas/Wilderness/${mapId}.json`, mapFilePath: MAP_IMAGE });
    expect(vault.files.has(MAP_IMAGE)).toBe(true);
  });

  it('moves a folder out to the tab\'s top level', async () => {
    const { vault, assets, lichId } = await seededVault();
    const bosses = folderIdOf(`${TOKENS}/Villains/Bosses`);

    const result = await moveFoldersIntoFolder(vault.app, assets, [bosses], TOKENS, null);

    expect(result.moved).toEqual([{ from: bosses, to: folderIdOf(`${TOKENS}/Bosses`) }]);
    expect(folderPaths(vault, 'tokens')).toEqual(['Bosses', 'Heroes', 'Villains']);
    expect(await folderOf(assets, lichId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Bosses`));
  });

  it('keeps the folders and their assets where they went through the vault check', async () => {
    const { vault, assets, sceneId, orcId, lichId } = await seededVault();
    await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${TOKENS}/Villains`)], TOKENS, folderIdOf(`${TOKENS}/Heroes`));
    await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${SCENES}/Act 1`)], SCENES, folderIdOf(`${SCENES}/Campaign`));

    await assets.reconcileWithVault();

    expect(folderPaths(vault, 'tokens')).toEqual(['Heroes', 'Heroes/Villains', 'Heroes/Villains/Bosses']);
    expect(folderPaths(vault, 'scenes')).toEqual(['Campaign', 'Campaign/Act 1']);
    expect((await assets.getAssets('camp', 'token')).map((token) => token.id).sort()).toEqual([orcId, lichId].sort());
    expect(await folderOf(assets, lichId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Heroes/Villains/Bosses`));
    expect(await assets.getAssets('camp', 'scene')).toEqual([expect.objectContaining({ id: sceneId, data: { mapPath: `${SCENES}/Campaign/Act 1/Forest.atlasmap` } })]);
  });

  it('leaves a folder where it is for itself and for a folder inside it', async () => {
    const { vault, assets, lichId } = await seededVault();
    const villains = folderIdOf(`${TOKENS}/Villains`);

    expect(await moveFoldersIntoFolder(vault.app, assets, [villains], TOKENS, villains)).toEqual({ ...NOTHING_MOVED, intoItself: ['Villains'] });
    expect(await moveFoldersIntoFolder(vault.app, assets, [villains], TOKENS, folderIdOf(`${TOKENS}/Villains/Bosses`))).toEqual({ ...NOTHING_MOVED, intoItself: ['Villains'] });

    expect(folderPaths(vault, 'tokens')).toEqual(['Heroes', 'Villains', 'Villains/Bosses']);
    expect(await folderOf(assets, lichId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Villains/Bosses`));
  });

  it('is not misled by a folder whose name only begins like the moved one\'s', async () => {
    const { vault, assets } = await seededVault();
    await vault.app.vault.createFolder(`${TOKENS}/Villains of old`);

    const result = await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${TOKENS}/Villains`)], TOKENS, folderIdOf(`${TOKENS}/Villains of old`));

    expect(result.moved).toHaveLength(1);
    expect(folderPaths(vault, 'tokens')).toEqual(['Heroes', 'Villains of old', 'Villains of old/Villains', 'Villains of old/Villains/Bosses']);
  });

  it('leaves a folder where it is when the target holds one of its name, in any letter case', async () => {
    const { vault, assets, lichId } = await seededVault();
    await vault.app.vault.createFolder(`${TOKENS}/Heroes/bosses`);

    const result = await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${TOKENS}/Villains/Bosses`)], TOKENS, folderIdOf(`${TOKENS}/Heroes`));

    expect(result).toEqual({ ...NOTHING_MOVED, nameClashes: ['Bosses'] });
    expect(await folderOf(assets, lichId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Villains/Bosses`));
  });

  it('does nothing for a folder that is already there, and for one that is gone', async () => {
    const { vault, assets } = await seededVault();
    const renames = vi.mocked(vault.app.fileManager.renameFile);
    const before = renames.mock.calls.length;

    expect(await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${TOKENS}/Villains`)], TOKENS, null)).toEqual(NOTHING_MOVED);
    expect(await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${TOKENS}/Gone`)], TOKENS, folderIdOf(`${TOKENS}/Heroes`))).toEqual(NOTHING_MOVED);

    expect(renames).toHaveBeenCalledTimes(before);
  });

  it('moves the folders it can and names the others', async () => {
    const { vault, assets } = await seededVault();
    await vault.app.vault.createFolder(`${TOKENS}/Beasts`);
    await vault.app.vault.createFolder(`${TOKENS}/Heroes/Beasts`);
    const ids = [folderIdOf(`${TOKENS}/Villains`), folderIdOf(`${TOKENS}/Beasts`), folderIdOf(`${TOKENS}/Heroes`)];

    const result = await moveFoldersIntoFolder(vault.app, assets, ids, TOKENS, folderIdOf(`${TOKENS}/Heroes`));

    expect(result).toEqual({
      moved: [{ from: ids[0], to: folderIdOf(`${TOKENS}/Heroes/Villains`) }], nameClashes: ['Beasts'], intoItself: ['Heroes'], failed: [],
    });
    expect(foldersMoveProblem(result)).toBe(`${t('am.folder.moveNameClash', { names: 'Beasts' })} ${t('am.folder.moveIntoItself', { names: 'Heroes' })}`);
    expect(foldersMoveProblem(NOTHING_MOVED)).toBeNull();
  });

  it('names a folder the vault would not move, with the reason', async () => {
    const { vault, assets, orcId } = await seededVault();
    vault.app.fileManager.renameFile = (): Promise<void> => Promise.reject(new Error('The folder is locked'));

    const result = await moveFoldersIntoFolder(vault.app, assets, [folderIdOf(`${TOKENS}/Villains`)], TOKENS, folderIdOf(`${TOKENS}/Heroes`));

    expect(result).toEqual({ ...NOTHING_MOVED, failed: [{ name: 'Villains', reason: 'The folder is locked' }] });
    expect(foldersMoveProblem(result)).toBe(t('am.move.failed', { name: 'Villains', reason: 'The folder is locked' }));
    expect(await folderOf(assets, orcId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Villains`));
    // The index is free again for the vault check and for the next edit.
    await expect(assets.runExclusive(async () => 'free')).resolves.toBe('free');
  });
});

describe('what leaves a folder when its contents move', () => {
  it('is the assets it holds itself and the folders in it', async () => {
    const { vault, assets, orcId } = await seededVault();
    await vault.app.vault.createFolder(`${TOKENS}/Villains/Minions`);
    const villains = folderIdOf(`${TOKENS}/Villains`);

    const contents = await folderContents(vault.app, assets, villains, TOKENS, folderIdOf(`${TOKENS}/Heroes`));

    expect(contents.assetIds).toEqual([orcId]);
    expect(contents.folderIds.sort()).toEqual([folderIdOf(`${TOKENS}/Villains/Bosses`), folderIdOf(`${TOKENS}/Villains/Minions`)]);
  });

  it('leaves out the folder the contents go to, and a folder that holds it', async () => {
    const { vault, assets } = await seededVault();
    await vault.app.vault.createFolder(`${TOKENS}/Villains/Minions`);
    await vault.app.vault.createFolder(`${TOKENS}/Villains/Bosses/Liches`);
    const villains = folderIdOf(`${TOKENS}/Villains`);

    const intoChild = await folderContents(vault.app, assets, villains, TOKENS, folderIdOf(`${TOKENS}/Villains/Bosses`));
    const intoGrandchild = await folderContents(vault.app, assets, villains, TOKENS, folderIdOf(`${TOKENS}/Villains/Bosses/Liches`));

    expect(intoChild.folderIds).toEqual([folderIdOf(`${TOKENS}/Villains/Minions`)]);
    expect(intoGrandchild.folderIds).toEqual([folderIdOf(`${TOKENS}/Villains/Minions`)]);
  });

  it('holds no asset of another tab', async () => {
    const { vault, assets, mapId } = await seededVault();

    const contents = await folderContents(vault.app, assets, folderIdOf(`${MAPS}/Wilderness`), MAPS, null);

    expect(contents).toEqual({ assetIds: [mapId], folderIds: [] });
  });
});
