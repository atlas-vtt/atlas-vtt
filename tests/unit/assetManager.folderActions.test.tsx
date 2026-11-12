// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { folderIdOf, readTabFolders } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import type { FolderContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/folderContextMenu';
import { useSelectionHandlers, type VisibleIds } from '../../src/app/packages/components/asset-manager/hooks/useSelectionHandlers';
import type { InputModalState } from '../../src/app/packages/components/asset-manager/types';
import { t } from '../../src/app/i18n';
import {
  BOSSES, HEROES, TOKENS, VILLAINS, folderMenuDeps as menuDeps, folderOfTab, folderPaths, pickFolderEntry as pick,
  seededFolderVault as seededVault, useMoveToFolder, type FolderVault as Vault,
} from '../helpers/assetManagerFolders';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/components/AtlasToast', () => ({ showAtlasToast: toast }));

const { useAssetCrud } = await import('../../src/app/packages/components/asset-manager/hooks/useAssetCrud');

beforeEach(() => {
  AssetService.resetInstance();
  toast.mockReset();
});
afterEach(cleanup);

describe('Create subfolder… in a folder\'s menu', () => {
  function subfolderDialog(seed: Vault, deps: FolderContextMenuDeps): InputModalState {
    pick(folderOfTab(seed.vault, VILLAINS), deps, t('am.menu.newSubfolder'));
    return vi.mocked(deps.setInputModalState).mock.calls[0]![0];
  }

  it('makes the folder in the vault, so it is there when the tab is shown again', async () => {
    const seed = await seededVault();
    const deps = menuDeps(seed);

    subfolderDialog(seed, deps).onConfirm(' Minions ');
    await vi.waitFor(() => expect(deps.loadFoldersForActiveTab).toHaveBeenCalled());

    expect(folderPaths(seed.vault)).toEqual(['Heroes', 'Villains', 'Villains/Bosses', 'Villains/Minions']);
    expect(folderOfTab(seed.vault, folderIdOf(`${TOKENS}/Villains/Minions`)).parentId).toBe(VILLAINS);
  });

  it('says in the dialog why a name cannot be used', async () => {
    const seed = await seededVault();
    const dialog = subfolderDialog(seed, menuDeps(seed));

    expect(dialog.validation?.('  ')).toBe(t('am.folder.subfolderEmpty'));
    // macOS and Windows do not tell names apart by letter case.
    expect(dialog.validation?.('bosses')).toBe(t('am.folder.subfolderExists', { name: 'bosses' }));
    expect(dialog.validation?.('Elite/Guard')).toBe(t('names.invalidFolder'));
    expect(dialog.validation?.('.hidden')).toBe(t('names.folderDot'));
    expect(dialog.validation?.('Minions')).toBeNull();
  });
});

describe('Move contents to… in a folder\'s menu', () => {
  it('moves the folder\'s assets and its subfolders into the other folder, in the vault and in the records', async () => {
    const seed = await seededVault();
    const { vault, assets, orcId, lichId } = seed;
    const { result: moveToFolder } = renderHook(() => useMoveToFolder(seed));
    const deps = menuDeps(seed, { moveAssetsToFolder: (ids, target) => moveToFolder.current(ids, target) });

    await act(async () => {
      pick(folderOfTab(vault, VILLAINS), deps, t('am.folder.moveTo', { name: 'Heroes' }));
      await vi.waitFor(() => expect(deps.loadFoldersForActiveTab).toHaveBeenCalled());
    });

    expect(folderPaths(vault)).toEqual(['Heroes', 'Heroes/Bosses', 'Villains']);
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/Heroes/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Heroes/Bosses/lich.webp` });
    expect(vault.files.has(`${TOKENS}/Heroes/orc.webp`)).toBe(true);
    expect(vault.files.has(`${TOKENS}/Heroes/Bosses/lich.webp`)).toBe(true);
    // The cards go the way Move to Folder takes them, which says where they went.
    expect(toast).toHaveBeenCalledWith('Moved “Orc” to Heroes', expect.any(Number), expect.objectContaining({ label: t('am.move.openFolder') }));
    expect(deps.followFolderMoves).toHaveBeenCalledWith([{ from: BOSSES, to: folderIdOf(`${TOKENS}/Heroes/Bosses`) }]);
    expect(deps.loadAssetsForActiveTab).toHaveBeenCalled();

    // The vault check finds nothing to put back.
    await assets.reconcileWithVault();
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/Heroes/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Heroes/Bosses/lich.webp` });
  });

  it('moves them to the tab\'s top level', async () => {
    const seed = await seededVault();
    const { vault, assets, orcId, lichId } = seed;
    const { result: moveToFolder } = renderHook(() => useMoveToFolder(seed));
    const deps = menuDeps(seed, { moveAssetsToFolder: (ids, target) => moveToFolder.current(ids, target) });

    await act(async () => {
      pick(folderOfTab(vault, VILLAINS), deps, t('am.folder.moveToRoot'));
      await vi.waitFor(() => expect(deps.loadFoldersForActiveTab).toHaveBeenCalled());
    });

    expect(folderPaths(vault)).toEqual(['Bosses', 'Heroes', 'Villains']);
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Bosses/lich.webp` });
  });

  it('into a folder inside it, leaves that folder where it is', async () => {
    const seed = await seededVault();
    const { vault, assets, orcId, lichId } = seed;
    const { result: moveToFolder } = renderHook(() => useMoveToFolder(seed));
    const deps = menuDeps(seed, { moveAssetsToFolder: (ids, target) => moveToFolder.current(ids, target) });

    await act(async () => {
      pick(folderOfTab(vault, VILLAINS), deps, t('am.folder.moveTo', { name: 'Bosses' }));
      await vi.waitFor(async () => expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/Villains/Bosses/orc.webp` }));
    });

    expect(folderPaths(vault)).toEqual(['Heroes', 'Villains', 'Villains/Bosses']);
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Villains/Bosses/lich.webp` });
    expect(toast.mock.calls.map((call) => String(call[0]))).toEqual(['Moved “Orc” to Bosses']);
  });

  it('leaves what the other folder already holds by name, and says so', async () => {
    const seed = await seededVault();
    const { vault, assets, orcId, lichId } = seed;
    await vault.app.vault.create(`${TOKENS}/Heroes/orc.webp`, 'OTHER');
    await vault.app.vault.createFolder(`${TOKENS}/Heroes/bosses`);
    const { result: moveToFolder } = renderHook(() => useMoveToFolder(seed));
    const deps = menuDeps(seed, { moveAssetsToFolder: (ids, target) => moveToFolder.current(ids, target) });

    await act(async () => {
      pick(folderOfTab(vault, VILLAINS), deps, t('am.folder.moveTo', { name: 'Heroes' }));
      await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    });

    expect(toast.mock.calls.map((call) => String(call[0]))).toEqual([
      t('am.move.nameClash', { names: 'Orc' }),
      t('am.folder.moveNameClash', { names: 'Bosses' }),
    ]);
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/Villains/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Villains/Bosses/lich.webp` });
    expect(deps.followFolderMoves).not.toHaveBeenCalled();
  });
});

describe('a folder dragged onto a folder', () => {
  interface Dropped {
    drop: (targetFolderId: string | null) => void;
    loadFolders: ReturnType<typeof vi.fn<() => Promise<void>>>;
    followFolderMoves: ReturnType<typeof vi.fn>;
    selected: () => string[];
  }

  /** The asset manager's drop handler while the folders `dragged` are held. */
  function dragging({ vault, assets }: Vault, dragged: string[], selectedBefore: string[] = []): Dropped {
    const loadFolders = vi.fn(() => Promise.resolve());
    const followFolderMoves = vi.fn();
    let selected = selectedBefore;
    const setSelectedFolderIds = (update: React.SetStateAction<string[]>): void => {
      selected = typeof update === 'function' ? update(selected) : update;
    };
    const { result } = renderHook(() => useAssetCrud(
      vault.app, assets, 'tokens', 'camp', null, readTabFolders(vault.app, 'camp', 'tokens'), [], vi.fn(),
      () => Promise.resolve(), vi.fn(), loadFolders, () => Promise.resolve(),
      { type: 'folder', ids: dragged }, vi.fn(), vi.fn(), vi.fn(), vi.fn(),
      { followFolderMoves, setSelectedFolderIds },
    ));
    return { drop: (target) => act(() => result.current.handleDrop(target)), loadFolders, followFolderMoves, selected: () => selected };
  }

  it('moves into it in the vault, with the assets in it and in its subfolders', async () => {
    const seed = await seededVault();
    const { vault, assets, orcId, lichId } = seed;
    const held = dragging(seed, [VILLAINS], [VILLAINS, HEROES]);

    held.drop(HEROES);
    await vi.waitFor(() => expect(held.loadFolders).toHaveBeenCalled());

    expect(folderPaths(vault)).toEqual(['Heroes', 'Heroes/Villains', 'Heroes/Villains/Bosses']);
    expect(await assets.getAssetById(orcId)).toMatchObject({ imagePath: `${TOKENS}/Heroes/Villains/orc.webp` });
    expect(await assets.getAssetById(lichId)).toMatchObject({ imagePath: `${TOKENS}/Heroes/Villains/Bosses/lich.webp` });
    expect(held.followFolderMoves).toHaveBeenCalledWith([{ from: VILLAINS, to: folderIdOf(`${TOKENS}/Heroes/Villains`) }]);
    // The folder left the view it was selected in.
    expect(held.selected()).toEqual([HEROES]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('stays where it is when the folder already holds one of its name, with a notice', async () => {
    const seed = await seededVault();
    await seed.vault.app.vault.createFolder(`${TOKENS}/Heroes/Villains`);
    const held = dragging(seed, [VILLAINS]);

    held.drop(HEROES);
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());

    expect(toast.mock.calls[0]![0]).toBe(t('am.folder.moveNameClash', { names: 'Villains' }));
    expect(seed.vault.files.has(`${TOKENS}/Villains/orc.webp`)).toBe(true);
    expect(held.followFolderMoves).not.toHaveBeenCalled();
  });

  it('is not moved into a folder inside it, with a notice', async () => {
    const seed = await seededVault();
    const held = dragging(seed, [VILLAINS]);

    held.drop(BOSSES);
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());

    expect(toast.mock.calls[0]![0]).toBe(t('am.folder.moveIntoItself', { names: 'Villains' }));
    expect(folderPaths(seed.vault)).toEqual(['Heroes', 'Villains', 'Villains/Bosses']);
  });
});

describe('Back and Forward after a folder got another id', () => {
  const visible = { current: { assets: [], folders: [] } as VisibleIds };

  it('lead to the folder and to the folders in it where they are now', () => {
    const { result } = renderHook(() => useSelectionHandlers(visible, [], 'tokens', true));
    act(() => result.current.resetForTab());
    act(() => result.current.handleNavigateToFolder(VILLAINS));
    act(() => result.current.handleNavigateToFolder(BOSSES));
    act(() => result.current.handleNavigateBack());
    act(() => result.current.handleNavigateBack());
    expect(result.current.selectedFolderId).toBeNull();

    const foes = folderIdOf(`${TOKENS}/Foes`);
    act(() => result.current.followFolderMoves([{ from: VILLAINS, to: foes }]));

    act(() => result.current.handleNavigateForward());
    expect(result.current.selectedFolderId).toBe(foes);
    act(() => result.current.handleNavigateForward());
    expect(result.current.selectedFolderId).toBe(`${foes}/Bosses`);
    act(() => result.current.handleNavigateBack());
    expect(result.current.selectedFolderId).toBe(foes);
  });

  it('keeps a folder open that moved while it was open', () => {
    const { result } = renderHook(() => useSelectionHandlers(visible, [], 'tokens', true));
    act(() => result.current.handleNavigateToFolder(BOSSES));

    act(() => result.current.followFolderMoves([{ from: VILLAINS, to: folderIdOf(`${TOKENS}/Heroes/Villains`) }]));

    expect(result.current.selectedFolderId).toBe(folderIdOf(`${TOKENS}/Heroes/Villains/Bosses`));
  });

  it('are told of a rename from the folder\'s menu', async () => {
    const seed = await seededVault();
    const deps = menuDeps(seed);
    pick(folderOfTab(seed.vault, VILLAINS), deps, t('am.menu.rename'));

    vi.mocked(deps.setInputModalState).mock.calls[0]![0].onConfirm('Foes');
    await vi.waitFor(() => expect(deps.loadAssetsForActiveTab).toHaveBeenCalled());

    expect(deps.followFolderMoves).toHaveBeenCalledWith([{ from: VILLAINS, to: folderIdOf(`${TOKENS}/Foes`) }]);
  });
});
