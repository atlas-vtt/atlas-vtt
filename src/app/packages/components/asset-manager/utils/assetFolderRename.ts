import { normalizePath, type App } from 'obsidian';
import type { Asset, AssetService } from '../../../../services/AssetService';
import { isPathTaken, renameFolderInVault } from '../../../../plugin/vaultFolders';
import { movedFolderPathOf } from '../../../../services/renamedPaths';
import { saveOpenScene } from '../../../../services/sceneRename';
import { placingFileUpdate } from './assetFolderMove';
import { folderIdOf, vaultPathOfFolder } from './assetFolders';
import { isTabAsset, placingFilePath } from './assetFormatters';
import { folderNameProblem } from './folderName';

/** Where a folder lies under another name, beside the folders it lies beside now. */
function renamedFolderPath(folderPath: string, name: string): string {
  return normalizePath(`${folderPath.slice(0, folderPath.lastIndexOf('/'))}/${name.trim()}`);
}

/** Why a folder cannot take `name`, or null when it can. Its own name in another letter case is free. */
export function folderRenameProblem(app: App, folderId: string, name: string): string | null {
  const from = vaultPathOfFolder(folderId);
  return folderNameProblem(name, (trimmed) => {
    const to = renamedFolderPath(from, trimmed);
    return to.toLowerCase() !== from.toLowerCase() && isPathTaken(app, to);
  });
}

/**
 * Renames an asset manager folder by renaming its vault folder, which is where
 * the asset manager reads its folders from. The assets in it and in the folders
 * below it stay where they are: their records name the new place of the file
 * that places each one (`placingFilePath`) before the index is read again, and
 * the rename events carry the new paths to scenes, snapshots and notes.
 * Resolves to the folder's new id, to its id when `name` is the name it has,
 * and to null when the folder is no longer there; rejects with the reason when
 * the name cannot be used.
 */
export async function renameAssetFolder(app: App, assetService: AssetService, folderId: string, name: string): Promise<string | null> {
  const from = vaultPathOfFolder(folderId);
  const to = renamedFolderPath(from, name);
  if (!name.trim() || to === from) return folderId;
  const problem = folderRenameProblem(app, folderId, name);
  if (problem) throw new Error(problem);
  const folder = app.vault.getFolderByPath(from);
  if (!folder) return null;

  const moved = movedFolderPathOf([{ from, to }]);
  await assetService.runExclusive(async () => {
    // Pending changes of an open scene would recreate its file, and so the folder, at the old path.
    for (const scene of await assetService.getAssets(undefined, 'scene')) {
      const mapPath = placingFilePath(scene);
      if (mapPath && moved(mapPath) !== null) await saveOpenScene(app, mapPath);
    }
    await renameFolderInVault(app, folder, to);
    await assetService.rewriteAssets((asset: Asset): boolean => {
      if (!isTabAsset(asset)) return false;
      const path = moved(placingFilePath(asset));
      if (path === null) return false;
      Object.assign(asset, placingFileUpdate(asset, path));
      return true;
    });
  });
  return folderIdOf(to);
}
