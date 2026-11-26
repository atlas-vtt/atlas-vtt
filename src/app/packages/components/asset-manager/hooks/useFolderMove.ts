import type * as React from 'react';
import { useEffect, useRef } from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { AnyAsset, Folder, Tab } from '../types';
import { showAtlasToast, type AtlasToastHandle } from '../../../../react/components/AtlasToast';
import { tabFolderPath } from '../utils/assetFolders';
import { folderMoveProblem, moveAssetsIntoFolder, type FolderMoveResult } from '../utils/assetFolderMove';
import { MOVE_PROBLEM_TOAST_MS, showMove } from '../utils/optimisticMove';
import { folderDestination, showMovedNotice } from '../utils/moveNotice';
import { describeError } from '../../../../utils/errors';

export interface FolderMoveDeps {
  app: ObsidianApp | null;
  assetService: AssetService | null;
  activeTab: Tab;
  selectedCollection: string;
  folders: Folder[];
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  loadAssetsForActiveTab: () => Promise<void>;
  /** Opens a folder of the tab shown (null: its top level) with the cards `assetIds` in it selected. */
  openFolder: (folderId: string | null, assetIds: readonly string[]) => void;
}

/**
 * Moves cards into a folder of the tab shown. The cards leave their folder at once (#30); one the move leaves in place
 * comes back, with a notice that says why. The notice of the move names where the cards went and opens it (#32); it
 * goes once the asset manager shows another collection or tab, or closes, since its button would open a place that is
 * no longer in view.
 */
export function useFolderMove(deps: FolderMoveDeps): (assetIds: string[], targetFolderId: string | null) => Promise<void> {
  const { app, assetService, activeTab, selectedCollection, folders, setAssets, loadAssetsForActiveTab } = deps;
  const openFolder = useRef(deps.openFolder);
  openFolder.current = deps.openFolder;
  const notice = useRef<AtlasToastHandle | null>(null);
  const dismissNotice = (): void => {
    notice.current?.dismiss();
    notice.current = null;
  };
  useEffect(() => dismissNotice, [selectedCollection, activeTab]);

  return async (assetIds, targetFolderId) => {
    if (!app || !assetService) return;
    const tabBase = tabFolderPath(selectedCollection, activeTab);
    const folderName = targetFolderId === null ? null : folders.find((folder) => folder.id === targetFolderId)?.name ?? null;
    const shown = showMove(setAssets, assetIds, (asset) => ({ ...asset, folderId: targetFolderId }));
    let result: FolderMoveResult;
    try {
      result = await moveAssetsIntoFolder(app, assetService, assetIds, tabBase, targetFolderId);
    } catch (error) {
      console.error('[useAssetCrud] Error moving assets:', error);
      result = { moved: [], nameClashes: [], failed: shown.names(assetIds).map((name) => ({ name, reason: describeError(error) })) };
    }
    const moved = new Set(result.moved);
    shown.restore(assetIds.filter((id) => !moved.has(id)));
    const movedAssets = shown.assets(result.moved);
    if (movedAssets.length > 0) {
      dismissNotice();
      notice.current = showMovedNotice(folderDestination(movedAssets, folderName, () => openFolder.current(targetFolderId, result.moved)));
    }
    const problem = folderMoveProblem(result);
    if (problem) showAtlasToast(problem, MOVE_PROBLEM_TOAST_MS);
    if (result.moved.length > 0) await loadAssetsForActiveTab();
  };
}
