import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { folderIdOf, readTabFolders, tabFolderPath } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import { assetFolderId, isTabAsset } from '../../src/app/packages/components/asset-manager/utils/assetFormatters';
import { moveAssetsIntoFolder } from '../../src/app/packages/components/asset-manager/utils/assetFolderMove';
import { folderRenameProblem, renameAssetFolder } from '../../src/app/packages/components/asset-manager/utils/assetFolderRename';
import { buildFolderContextMenuEntries, type FolderContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/folderContextMenu';
import type { Folder, InputModalState, Tab } from '../../src/app/packages/components/asset-manager/types';
import { t } from '../../src/app/i18n';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const TOKENS = tabFolderPath('camp', 'tokens');
const MAPS = tabFolderPath('camp', 'maps');
const SCENES = tabFolderPath('camp', 'scenes');
const MAP_IMAGE = 'atlas-vtt/assets/forest_123.webp';

interface Vault { vault: InMemoryApp; assets: AssetService; mapId: string; sceneId: string; tokenId: string }

/** A scene in "Act 1", a map in "Wilderness" and a token two folders deep, in "Villains/Bosses". */
async function seededVault(): Promise<Vault> {
  const vault = createInMemoryApp({ folders: [`${MAPS}/Wilderness`, `${SCENES}/Act 1`, `${SCENES}/Empty`, `${TOKENS}/Villains/Bosses`] });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('camp');
  await vault.app.vault.create(MAP_IMAGE, 'IMG');
  await vault.app.vault.create(`${SCENES}/Act 1/Forest.atlasmap`, '{}');
  await vault.app.vault.create(`${TOKENS}/Villains/Bosses/lich.webp`, 'IMG');
  await assets.addAsset({ type: 'map', name: 'Forest', collection: 'camp', tags: [], mapFilePath: MAP_IMAGE });
  await assets.addAsset({ type: 'scene', name: 'Forest', collection: 'camp', tags: [], data: { mapPath: `${SCENES}/Act 1/Forest.atlasmap` } });
  await assets.addAsset({ type: 'token', name: 'Lich', collection: 'camp', tags: [], imagePath: `${TOKENS}/Villains/Bosses/lich.webp` });
  const [map] = await assets.getAssets('camp', 'map');
  const [scene] = await assets.getAssets('camp', 'scene');
  const [token] = await assets.getAssets('camp', 'token');
  await moveAssetsIntoFolder(vault.app, assets, [map!.id], MAPS, folderIdOf(`${MAPS}/Wilderness`));
  return { vault, assets, mapId: map!.id, sceneId: scene!.id, tokenId: token!.id };
}

async function folderOf(assets: AssetService, id: string, tabBase: string): Promise<string | null> {
  const asset: Asset | null = await assets.getAssetById(id);
  if (!asset || !isTabAsset(asset)) throw new Error(`No asset ${id}`);
  return assetFolderId(asset, tabBase);
}

/** The names of a tab's folders as the asset manager reads them when the tab is shown again. */
const folderNames = (vault: InMemoryApp, tab: Tab): string[] => readTabFolders(vault.app, 'camp', tab).map((folder) => folder.path).sort();

const folderOfTab = (vault: InMemoryApp, tab: Tab, path: string): Folder => {
  const folder = readTabFolders(vault.app, 'camp', tab).find((candidate) => candidate.path === path);
  if (!folder) throw new Error(`No folder ${path}`);
  return folder;
};

beforeEach(() => { AssetService.resetInstance(); });

describe('renaming a folder from its menu in the asset manager', () => {
  /** Opens the folder's menu, picks Rename and returns the dialog it asks for. */
  function renameDialog(vault: InMemoryApp, assets: AssetService, folder: Folder, deps: Partial<FolderContextMenuDeps> = {}): InputModalState {
    const setInputModalState = vi.fn<(state: InputModalState) => void>();
    const entries = buildFolderContextMenuEntries(folder, {
      app: vault.app,
      assetService: assets,
      folders: readTabFolders(vault.app, 'camp', folder.type),
      assets: [],
      setInputModalState,
      setFolders: vi.fn(),
      setAssets: vi.fn(),
      setSelectedFolderIds: vi.fn(),
      handleFolderDoubleClick: vi.fn(),
      deleteFolderFromVault: vi.fn(async () => {}),
      loadFoldersForActiveTab: vi.fn(async () => {}),
      loadAssetsForActiveTab: vi.fn(async () => {}),
      ...deps,
    });
    const rename = entries.find((entry) => entry.type === 'item' && entry.label === t('am.menu.rename'));
    if (rename?.type !== 'item') throw new Error('No Rename entry');
    void rename.onClick();
    return setInputModalState.mock.calls[0]![0];
  }

  it('gives the folder its new name in the vault, so it keeps it when the tab is shown again', async () => {
    const { vault, assets, sceneId } = await seededVault();
    const loadFoldersForActiveTab = vi.fn(async () => {});
    const loadAssetsForActiveTab = vi.fn(async () => {});
    const dialog = renameDialog(vault, assets, folderOfTab(vault, 'scenes', 'Act 1'), { loadFoldersForActiveTab, loadAssetsForActiveTab });

    dialog.onConfirm('Prologue');
    await vi.waitFor(() => expect(loadAssetsForActiveTab).toHaveBeenCalled());

    expect(folderNames(vault, 'scenes')).toEqual(['Empty', 'Prologue']);
    expect(vault.files.has(`${SCENES}/Prologue/Forest.atlasmap`)).toBe(true);
    expect(await folderOf(assets, sceneId, SCENES)).toBe(folderIdOf(`${SCENES}/Prologue`));
    expect(loadFoldersForActiveTab).toHaveBeenCalled();
  });

  it('keeps a selected folder selected under its new id', async () => {
    const { vault, assets } = await seededVault();
    const folder = folderOfTab(vault, 'scenes', 'Act 1');
    const setSelectedFolderIds = vi.fn<FolderContextMenuDeps['setSelectedFolderIds']>();
    const loadAssetsForActiveTab = vi.fn(async () => {});
    const dialog = renameDialog(vault, assets, folder, { setSelectedFolderIds, loadAssetsForActiveTab });

    dialog.onConfirm('Prologue');
    await vi.waitFor(() => expect(loadAssetsForActiveTab).toHaveBeenCalled());

    const update = setSelectedFolderIds.mock.calls[0]![0];
    if (typeof update !== 'function') throw new Error('Expected an update of the selection as it is');
    expect(update([folder.id, 'folder-other'])).toEqual([folderIdOf(`${SCENES}/Prologue`), 'folder-other']);
  });

  it('says in the dialog why a name cannot be used', async () => {
    const { vault, assets } = await seededVault();
    const dialog = renameDialog(vault, assets, folderOfTab(vault, 'scenes', 'Act 1'));

    expect(dialog.validation?.('empty')).toBe(t('am.folder.exists', { name: 'empty' }));
    expect(dialog.validation?.('Act 1/Part 2')).toBe(t('names.invalidFolder'));
    expect(dialog.validation?.('.hidden')).toBe(t('names.folderDot'));
    expect(dialog.validation?.('Prologue')).toBeNull();
    // Its own name in another letter case is no other folder's name.
    expect(dialog.validation?.('ACT 1')).toBeNull();
  });
});

describe('renaming an asset manager folder', () => {
  it('keeps a map in the renamed folder by its record', async () => {
    const { vault, assets, mapId } = await seededVault();

    const renamed = await renameAssetFolder(vault.app, assets, folderIdOf(`${MAPS}/Wilderness`), 'Wilds');

    expect(renamed).toBe(folderIdOf(`${MAPS}/Wilds`));
    expect(folderNames(vault, 'maps')).toEqual(['Wilds']);
    expect(await assets.getAssetById(mapId)).toMatchObject({ filePath: `${MAPS}/Wilds/${mapId}.json`, mapFilePath: MAP_IMAGE });
    expect(vault.files.has(MAP_IMAGE)).toBe(true);
  });

  it('takes the folders inside along, with what they hold', async () => {
    const { vault, assets, tokenId } = await seededVault();

    await renameAssetFolder(vault.app, assets, folderIdOf(`${TOKENS}/Villains`), 'Foes');

    expect(folderNames(vault, 'tokens')).toEqual(['Foes', 'Foes/Bosses']);
    expect(await assets.getAssetById(tokenId)).toMatchObject({ imagePath: `${TOKENS}/Foes/Bosses/lich.webp` });
    expect(await folderOf(assets, tokenId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Foes/Bosses`));
  });

  it('renames a folder inside another without moving it', async () => {
    const { vault, assets, tokenId } = await seededVault();

    await renameAssetFolder(vault.app, assets, folderIdOf(`${TOKENS}/Villains/Bosses`), 'Lords');

    expect(folderNames(vault, 'tokens')).toEqual(['Villains', 'Villains/Lords']);
    expect(await folderOf(assets, tokenId, TOKENS)).toBe(folderIdOf(`${TOKENS}/Villains/Lords`));
  });

  it('keeps the new name and its assets through the vault check, which brings the old folder back for none', async () => {
    const { vault, assets, sceneId, mapId } = await seededVault();
    await renameAssetFolder(vault.app, assets, folderIdOf(`${SCENES}/Act 1`), 'Prologue');
    await renameAssetFolder(vault.app, assets, folderIdOf(`${MAPS}/Wilderness`), 'Wilds');

    await assets.reconcileWithVault();

    expect(folderNames(vault, 'scenes')).toEqual(['Empty', 'Prologue']);
    expect(folderNames(vault, 'maps')).toEqual(['Wilds']);
    expect(await assets.getAssets('camp', 'scene')).toEqual([expect.objectContaining({ id: sceneId, data: { mapPath: `${SCENES}/Prologue/Forest.atlasmap` } })]);
    expect(await assets.getAssets('camp', 'map')).toEqual([expect.objectContaining({ id: mapId, filePath: `${MAPS}/Wilds/${mapId}.json` })]);
  });

  it('leaves the folder as it is for a name a folder beside it has', async () => {
    const { vault, assets, sceneId } = await seededVault();
    const folder = folderIdOf(`${SCENES}/Act 1`);

    expect(folderRenameProblem(vault.app, folder, 'Empty')).toBe(t('am.folder.exists', { name: 'Empty' }));
    await expect(renameAssetFolder(vault.app, assets, folder, 'Empty')).rejects.toThrow(t('am.folder.exists', { name: 'Empty' }));

    expect(folderNames(vault, 'scenes')).toEqual(['Act 1', 'Empty']);
    expect(await folderOf(assets, sceneId, SCENES)).toBe(folder);
  });

  it('does nothing for the name the folder has, and for a folder that is gone', async () => {
    const { vault, assets } = await seededVault();
    const folder = folderIdOf(`${SCENES}/Act 1`);

    expect(await renameAssetFolder(vault.app, assets, folder, ' Act 1 ')).toBe(folder);
    expect(await renameAssetFolder(vault.app, assets, folderIdOf(`${SCENES}/Gone`), 'Found')).toBeNull();

    expect(vault.app.fileManager.renameFile).toHaveBeenCalledTimes(1); // the map's move in the seed
    expect(folderNames(vault, 'scenes')).toEqual(['Act 1', 'Empty']);
  });
});
