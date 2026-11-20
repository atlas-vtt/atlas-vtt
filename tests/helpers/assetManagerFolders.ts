import { useState } from 'react';
import { vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { folderIdOf, readTabFolders, tabFolderPath } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import { buildFolderContextMenuEntries, type FolderContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/folderContextMenu';
import { useFolderMove } from '../../src/app/packages/components/asset-manager/hooks/useFolderMove';
import type { AnyAsset, Folder } from '../../src/app/packages/components/asset-manager/types';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

export const TOKENS = tabFolderPath('camp', 'tokens');
export const VILLAINS = folderIdOf(`${TOKENS}/Villains`);
export const BOSSES = folderIdOf(`${TOKENS}/Villains/Bosses`);
export const HEROES = folderIdOf(`${TOKENS}/Heroes`);

export interface FolderVault { vault: InMemoryApp; assets: AssetService; orcId: string; lichId: string }

/** An orc in "Villains", a lich in "Villains/Bosses", and an empty "Heroes" beside "Villains". */
export async function seededFolderVault(): Promise<FolderVault> {
  const vault = createInMemoryApp({ folders: [`${TOKENS}/Villains/Bosses`, `${TOKENS}/Heroes`] });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('camp');
  await vault.app.vault.create(`${TOKENS}/Villains/orc.webp`, 'IMG');
  await vault.app.vault.create(`${TOKENS}/Villains/Bosses/lich.webp`, 'IMG');
  await assets.addAsset({ type: 'token', name: 'Orc', collection: 'camp', tags: [], imagePath: `${TOKENS}/Villains/orc.webp` });
  await assets.addAsset({ type: 'token', name: 'Lich', collection: 'camp', tags: [], imagePath: `${TOKENS}/Villains/Bosses/lich.webp` });
  const tokens = await assets.getAssets('camp', 'token');
  const idOf = (name: string): string => tokens.find((token) => token.name === name)!.id;
  return { vault, assets, orcId: idOf('Orc'), lichId: idOf('Lich') };
}

/** The tab's folders as the asset manager reads them when the tab is shown again. */
export const folderPaths = (vault: InMemoryApp): string[] => readTabFolders(vault.app, 'camp', 'tokens').map((folder) => folder.path).sort();

export const folderOfTab = (vault: InMemoryApp, id: string): Folder => {
  const folder = readTabFolders(vault.app, 'camp', 'tokens').find((candidate) => candidate.id === id);
  if (!folder) throw new Error(`No folder ${id}`);
  return folder;
};

/** What a folder's menu works with, on the Characters tab of the seeded vault. */
export function folderMenuDeps({ vault, assets }: FolderVault, over: Partial<FolderContextMenuDeps> = {}): FolderContextMenuDeps {
  return {
    app: vault.app,
    assetService: assets,
    tabBasePath: TOKENS,
    folders: readTabFolders(vault.app, 'camp', 'tokens'),
    assets: [],
    setInputModalState: vi.fn(),
    setSelectedFolderIds: vi.fn(),
    handleFolderDoubleClick: vi.fn(),
    loadFoldersForActiveTab: vi.fn(async () => {}),
    loadAssetsForActiveTab: vi.fn(async () => {}),
    followFolderMoves: vi.fn(),
    leaveDeletedFolder: vi.fn(),
    moveAssetsToFolder: vi.fn(async () => {}),
    ...over,
  };
}

/** Picks the entry `label` of the folder's menu. */
export function pickFolderEntry(folder: Folder, deps: FolderContextMenuDeps, label: string): void {
  const entry = buildFolderContextMenuEntries(folder, deps).find((candidate) => candidate.type === 'item' && candidate.label === label);
  if (entry?.type !== 'item') throw new Error(`No entry ${label}`);
  void entry.onClick();
}

/** Move to Folder as the asset manager runs it, over the cards the Characters tab shows. */
export function useMoveToFolder({ vault, assets, orcId }: FolderVault): (assetIds: string[], targetFolderId: string | null) => Promise<void> {
  const [, setCards] = useState<AnyAsset[]>([{ id: orcId, name: 'Orc', type: 'tokens', folderId: VILLAINS } as AnyAsset]);
  return useFolderMove({
    app: vault.app, assetService: assets, activeTab: 'tokens', selectedCollection: 'camp',
    folders: readTabFolders(vault.app, 'camp', 'tokens'), setAssets: setCards,
    loadAssetsForActiveTab: () => Promise.resolve(), openFolder: vi.fn(),
  });
}
