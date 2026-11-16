// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { folderIdOf } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import type { FolderContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/folderContextMenu';
import { useSelectionHandlers, type VisibleIds } from '../../src/app/packages/components/asset-manager/hooks/useSelectionHandlers';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';
import type { ConfirmDialogOptions } from '../../src/app/ui/confirmDialog';
import { t } from '../../src/app/i18n';
import {
  BOSSES, HEROES, TOKENS, VILLAINS, folderMenuDeps, folderOfTab, folderPaths, pickFolderEntry, seededFolderVault,
  useMoveToFolder, type FolderVault,
} from '../helpers/assetManagerFolders';

const toast = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn<(options: ConfirmDialogOptions) => Promise<boolean>>());
vi.mock('../../src/app/react/components/AtlasToast', () => ({ showAtlasToast: toast }));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: confirm }));

beforeEach(() => {
  AssetService.resetInstance();
  toast.mockReset();
  confirm.mockReset().mockResolvedValue(true);
});
afterEach(cleanup);

/** The folder's menu with Move to Folder as the asset manager runs it. */
function menuOf(seed: FolderVault, over: Partial<FolderContextMenuDeps> = {}): FolderContextMenuDeps {
  const { result: moveToFolder } = renderHook(() => useMoveToFolder(seed));
  return folderMenuDeps(seed, { moveAssetsToFolder: (ids, target) => moveToFolder.current(ids, target), ...over });
}

/** Picks Delete folder in the menu of `folderId` and waits until `done` holds. */
async function deleteFolder(seed: FolderVault, deps: FolderContextMenuDeps, folderId: string, done: () => void): Promise<void> {
  await act(async () => {
    pickFolderEntry(folderOfTab(seed.vault, folderId), deps, t('am.folder.delete'));
    await vi.waitFor(done);
  });
}

const trashedPaths = ({ vault }: FolderVault): string[] => vi.mocked(vault.app.fileManager.trashFile).mock.calls.map(([item]) => item.path);
const notices = (): string[] => toast.mock.calls.map((call) => String(call[0]));

describe('Delete folder in a folder\'s menu', () => {
  it('moves the folder\'s assets and subfolders to the parent folder and trashes it, so it is gone when the tab is shown again', async () => {
    const seed = await seededFolderVault();
    const { vault, assets, orcId, lichId } = seed;
    const deps = menuOf(seed);

    await deleteFolder(seed, deps, VILLAINS, () => expect(deps.leaveDeletedFolder).toHaveBeenCalledWith(VILLAINS, null));

    expect(folderPaths(vault)).toEqual(['Bosses', 'Heroes']);
    expect(trashedPaths(seed)).toEqual([`${TOKENS}/Villains`]);
    // The tab is read again once the folder is gone.
    const trashed = vi.mocked(vault.app.fileManager.trashFile).mock.invocationCallOrder[0]!;
    await vi.waitFor(() => expect(vi.mocked(deps.loadFoldersForActiveTab).mock.invocationCallOrder.at(-1)).toBeGreaterThan(trashed));
    await vi.waitFor(() => expect(vi.mocked(deps.loadAssetsForActiveTab).mock.invocationCallOrder.at(-1)).toBeGreaterThan(trashed));
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Bosses/lich.webp` });
    expect(vault.files.has(`${TOKENS}/orc.webp`)).toBe(true);
    expect(vault.files.has(`${TOKENS}/Bosses/lich.webp`)).toBe(true);
    expect(deps.followFolderMoves).toHaveBeenCalledWith([{ from: BOSSES, to: folderIdOf(`${TOKENS}/Bosses`) }]);
    // The cards go the way Move to Folder takes them, which says where they went; nothing stayed behind.
    expect(notices()).toEqual(['Moved “Orc” to the top level']);

    // The vault check finds nothing to put back.
    await assets.reconcileWithVault();
    expect(folderPaths(vault)).toEqual(['Bosses', 'Heroes']);
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Bosses/lich.webp` });
  });

  it('moves the assets of a folder inside a folder into that folder', async () => {
    const seed = await seededFolderVault();
    const deps = menuOf(seed);

    await deleteFolder(seed, deps, BOSSES, () => expect(deps.leaveDeletedFolder).toHaveBeenCalledWith(BOSSES, VILLAINS));

    expect(folderPaths(seed.vault)).toEqual(['Heroes', 'Villains']);
    expect(await seed.assets.getAssetById(seed.lichId)).toMatchObject({ imagePath: `${TOKENS}/Villains/lich.webp` });
  });

  it('trashes an empty folder', async () => {
    const seed = await seededFolderVault();
    const deps = menuOf(seed);

    await deleteFolder(seed, deps, HEROES, () => expect(deps.loadFoldersForActiveTab).toHaveBeenCalled());

    expect(folderPaths(seed.vault)).toEqual(['Villains', 'Villains/Bosses']);
    expect(trashedPaths(seed)).toEqual([`${TOKENS}/Heroes`]);
    expect(deps.leaveDeletedFolder).toHaveBeenCalledWith(HEROES, null);
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps the folder with what the parent folder already holds by name, and says so', async () => {
    const seed = await seededFolderVault();
    const { vault, assets, orcId, lichId } = seed;
    await vault.app.vault.create(`${TOKENS}/orc.webp`, 'OTHER');
    await vault.app.vault.createFolder(`${TOKENS}/bosses`);
    const deps = menuOf(seed);

    await deleteFolder(seed, deps, VILLAINS, () => expect(deps.loadAssetsForActiveTab).toHaveBeenCalled());

    expect(notices()).toEqual([
      t('am.move.nameClash', { names: 'Orc' }),
      t('am.folder.moveNameClash', { names: 'Bosses' }),
      t('am.folder.deleteKept', { name: 'Villains' }),
    ]);
    expect(trashedPaths(seed)).toEqual([]);
    expect(folderPaths(vault)).toEqual(['Heroes', 'Villains', 'Villains/Bosses', 'bosses']);
    expect(vault.files.get(`${TOKENS}/Villains/orc.webp`)).toBe('IMG');
    expect(vault.files.get(`${TOKENS}/orc.webp`)).toBe('OTHER');
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/Villains/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Villains/Bosses/lich.webp` });
    expect(deps.leaveDeletedFolder).not.toHaveBeenCalled();
  });

  it('keeps the folder while it holds a file that is no asset, after moving the rest', async () => {
    const seed = await seededFolderVault();
    const { vault, assets, orcId } = seed;
    await vault.app.vault.create(`${TOKENS}/Villains/Plans.md`, 'Notes of the GM');
    const deps = menuOf(seed);

    await deleteFolder(seed, deps, VILLAINS, () => expect(notices()).toContain(t('am.folder.deleteKept', { name: 'Villains' })));

    expect(trashedPaths(seed)).toEqual([]);
    expect(vault.files.get(`${TOKENS}/Villains/Plans.md`)).toBe('Notes of the GM');
    expect(folderPaths(vault)).toEqual(['Bosses', 'Heroes', 'Villains']);
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/orc.webp` });
  });

  it('changes nothing when the GM does not confirm', async () => {
    const seed = await seededFolderVault();
    confirm.mockResolvedValue(false);
    const deps = menuOf(seed);

    await deleteFolder(seed, deps, VILLAINS, () => expect(confirm).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    expect(folderPaths(seed.vault)).toEqual(['Heroes', 'Villains', 'Villains/Bosses']);
    expect(seed.vault.files.has(`${TOKENS}/Villains/orc.webp`)).toBe(true);
    expect(deps.loadFoldersForActiveTab).not.toHaveBeenCalled();
  });

  it('says before it deletes what moves to the parent folder', async () => {
    const seed = await seededFolderVault();
    confirm.mockResolvedValue(false);
    const orc = { id: seed.orcId, name: 'Orc', type: 'tokens', folderId: VILLAINS } as AnyAsset;
    const deps = menuOf(seed, { assets: [orc] });

    await deleteFolder(seed, deps, VILLAINS, () => expect(confirm).toHaveBeenCalled());

    expect(confirm.mock.calls[0]![0].message).toEqual([
      t('am.folder.confirmDelete', { name: 'Villains' }),
      t('am.folder.contains', { count: 1 }),
      t('am.folder.containsFolders', { count: 1 }),
    ]);
  });
});

describe('the open folder, Back and Forward after a folder was deleted', () => {
  const visible = { current: { assets: [], folders: [] } as VisibleIds };

  it('show its parent folder where the deleted folder was open', () => {
    const { result } = renderHook(() => useSelectionHandlers(visible, [], 'tokens', true));
    act(() => result.current.handleNavigateToFolder(VILLAINS));
    act(() => result.current.handleNavigateToFolder(BOSSES));

    act(() => result.current.leaveDeletedFolder(BOSSES, VILLAINS));

    expect(result.current.selectedFolderId).toBe(VILLAINS);
  });

  it('never lead to the deleted folder', () => {
    const { result } = renderHook(() => useSelectionHandlers(visible, [], 'tokens', true));
    act(() => result.current.resetForTab());
    act(() => result.current.handleNavigateToFolder(VILLAINS));
    act(() => result.current.handleNavigateToFolder(BOSSES));
    act(() => result.current.handleNavigateBack());
    act(() => result.current.handleNavigateBack());
    expect(result.current.selectedFolderId).toBeNull();

    // Deleting "Villains" first moves "Bosses" to the top level.
    const bosses = folderIdOf(`${TOKENS}/Bosses`);
    act(() => result.current.followFolderMoves([{ from: BOSSES, to: bosses }]));
    act(() => result.current.leaveDeletedFolder(VILLAINS, null));

    // The step from the top level to "Villains" would now lead from the top level to itself, so it is gone.
    act(() => result.current.handleNavigateForward());
    expect(result.current.selectedFolderId).toBe(bosses);
    act(() => result.current.handleNavigateBack());
    expect(result.current.selectedFolderId).toBeNull();
    act(() => result.current.handleNavigateBack());
    expect(result.current.selectedFolderId).toBeNull();
  });
});
