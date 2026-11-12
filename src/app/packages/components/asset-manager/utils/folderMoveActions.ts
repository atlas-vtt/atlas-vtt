import type * as React from 'react';
import type { App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { PathMove } from '../../../../services/renamedPaths';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { folderContents, foldersMoveProblem, moveFoldersIntoFolder } from './assetFolderTree';
import { MOVE_PROBLEM_TOAST_MS } from './optimisticMove';

/** What a move of folders needs of the asset manager that shows them. */
export interface FolderMoveContext {
  app: App;
  assetService: AssetService | null;
  /** The vault folder of the tab shown, in the collection shown. */
  tabBasePath: string;
  /** Tells Back, Forward and the open folder of folders that have another id now, each by the id it had and the id it has. */
  followFolderMoves: (moves: readonly PathMove[]) => void;
  setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>;
  loadFoldersForActiveTab: () => Promise<void>;
  loadAssetsForActiveTab: () => Promise<void>;
}

/**
 * Moves folders of the tab shown into one of its folders (null: its top level), in the vault. A
 * folder left where it is gets a notice that says why; the tab then shows its folders and assets
 * as the vault and the index hold them, since every moved folder and every folder in it has
 * another id.
 */
export async function moveFoldersInto(context: FolderMoveContext, folderIds: readonly string[], targetFolderId: string | null): Promise<void> {
  const { app, assetService } = context;
  if (!assetService || folderIds.length === 0) return;
  const result = await moveFoldersIntoFolder(app, assetService, folderIds, context.tabBasePath, targetFolderId);
  const problem = foldersMoveProblem(result);
  if (problem) showAtlasToast(problem, MOVE_PROBLEM_TOAST_MS);
  if (result.moved.length === 0) return;

  // A moved folder is no longer among the folders it was selected with.
  const gone = new Set(result.moved.map((move) => move.from));
  context.setSelectedFolderIds((selected) => selected.filter((id) => !gone.has(id)));
  context.followFolderMoves(result.moved);
  await context.loadFoldersForActiveTab();
  await context.loadAssetsForActiveTab();
}

/**
 * Moves what a folder holds into another folder of its tab (null: the tab's top level): its
 * assets the way Move to Folder takes them (`moveAssetsToFolder`), and the folders in it with
 * everything they hold. The folder itself stays.
 */
export async function moveFolderContentsInto(
  context: FolderMoveContext,
  moveAssetsToFolder: (assetIds: string[], targetFolderId: string | null) => Promise<void>,
  folderId: string,
  targetFolderId: string | null,
): Promise<void> {
  const { app, assetService } = context;
  if (!assetService) return;
  const { assetIds, folderIds } = await folderContents(app, assetService, folderId, context.tabBasePath, targetFolderId);
  if (assetIds.length > 0) await moveAssetsToFolder(assetIds, targetFolderId);
  await moveFoldersInto(context, folderIds, targetFolderId);
}
