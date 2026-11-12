import { TFolder, normalizePath, type App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { ensureFolder, isPathTaken } from '../../../../plugin/vaultFolders';
import type { PathMove } from '../../../../services/renamedPaths';
import { describeError } from '../../../../utils/errors';
import { formatList, t } from '../../../../i18n';
import type { FailedMove } from './assetFolderMove';
import { relocateAssetFolder } from './assetFolderRename';
import { folderIdOf, vaultPathOfFolder } from './assetFolders';
import { assetFolderId, isTabAsset } from './assetFormatters';
import { folderNameProblem } from './folderName';

/** What moving folders into a folder did. */
export interface FoldersMoveResult {
  /** The folders that moved, each by the id it had and the id it has now. */
  moved: PathMove[];
  /** Names of the folders left in place because the target already holds a file or folder of the same name. */
  nameClashes: string[];
  /** Names of the folders left in place because the target is the folder itself or lies inside it. */
  intoItself: string[];
  /** The folders that could not be moved, and why. */
  failed: FailedMove[];
}

/** What leaves a folder when its contents move elsewhere. */
export interface FolderContents {
  /** The assets the folder holds itself. */
  assetIds: string[];
  /** The folders in it, each of which goes with everything it holds. */
  folderIds: string[];
}

const isAtOrBelow = (path: string, folderPath: string): boolean => path === folderPath || path.startsWith(`${folderPath}/`);

const subfolderPath = (parentId: string, name: string): string => normalizePath(`${vaultPathOfFolder(parentId)}/${name.trim()}`);

/** Why `name` cannot name a new folder inside the folder `parentId`, or null when it can. */
export function subfolderNameProblem(app: App, parentId: string, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return t('am.folder.subfolderEmpty');
  return folderNameProblem(trimmed, () => false)
    ?? (isPathTaken(app, subfolderPath(parentId, trimmed)) ? t('am.folder.subfolderExists', { name: trimmed }) : null);
}

/**
 * Makes a folder inside an asset manager folder, in the vault, which is where the asset manager
 * reads its folders from. Resolves to its id; rejects with the reason when the name cannot be used.
 */
export async function createSubfolder(app: App, parentId: string, name: string): Promise<string> {
  const problem = subfolderNameProblem(app, parentId, name);
  if (problem) throw new Error(problem);
  const path = subfolderPath(parentId, name);
  await ensureFolder(app, path);
  return folderIdOf(path);
}

/**
 * Moves folders of a tab into one of its folders (`targetFolderId`, or the tab's top level when
 * null) by moving their vault folders, each with the assets in it and in the folders below it
 * (`relocateAssetFolder`). A folder stays where it is when the target is the folder itself or
 * lies inside it, and when the target already holds something of its name.
 */
export async function moveFoldersIntoFolder(
  app: App,
  assetService: AssetService,
  folderIds: readonly string[],
  tabBasePath: string,
  targetFolderId: string | null,
): Promise<FoldersMoveResult> {
  const targetDir = targetFolderId ? vaultPathOfFolder(targetFolderId) : tabBasePath;
  const result: FoldersMoveResult = { moved: [], nameClashes: [], intoItself: [], failed: [] };

  for (const id of folderIds) {
    const folder = app.vault.getFolderByPath(vaultPathOfFolder(id));
    if (!folder) continue;
    const { name, path: from } = folder;
    const to = normalizePath(`${targetDir}/${name}`);
    if (to === from) continue;
    if (isAtOrBelow(targetDir, from)) {
      result.intoItself.push(name);
      continue;
    }
    if (isPathTaken(app, to)) {
      result.nameClashes.push(name);
      continue;
    }
    try {
      await ensureFolder(app, targetDir);
      await relocateAssetFolder(app, assetService, folder, to);
      result.moved.push({ from: id, to: folderIdOf(to) });
    } catch (error) {
      console.error(`[assetFolderTree] Failed to move ${from} to ${to}:`, error);
      result.failed.push({ name, reason: describeError(error) });
    }
  }
  return result;
}

/** What to tell the user about folders a move left in place, with the reason, or null when every folder moved. */
export function foldersMoveProblem({ nameClashes, intoItself, failed }: Omit<FoldersMoveResult, 'moved'>): string | null {
  const problems: string[] = [];
  if (nameClashes.length > 0) problems.push(t('am.folder.moveNameClash', { names: formatList(nameClashes) }));
  if (intoItself.length > 0) problems.push(t('am.folder.moveIntoItself', { names: formatList(intoItself) }));
  for (const { name, reason } of failed) problems.push(t('am.move.failed', { name, reason }));
  return problems.length > 0 ? problems.join(' ') : null;
}

/**
 * What leaves a folder when its contents move to `targetFolderId` (the tab's top level when
 * null): the assets it holds itself and the folders in it. A folder in it that is the target, or
 * holds the target, stays, since no folder moves into itself.
 */
export async function folderContents(
  app: App,
  assetService: AssetService,
  folderId: string,
  tabBasePath: string,
  targetFolderId: string | null,
): Promise<FolderContents> {
  const targetDir = targetFolderId ? vaultPathOfFolder(targetFolderId) : tabBasePath;
  const assets = await assetService.getAssets();
  const children = app.vault.getFolderByPath(vaultPathOfFolder(folderId))?.children ?? [];
  return {
    assetIds: assets.filter((asset) => isTabAsset(asset) && assetFolderId(asset, tabBasePath) === folderId).map((asset) => asset.id),
    folderIds: children
      .filter((child) => child instanceof TFolder && !isAtOrBelow(targetDir, child.path))
      .map((child) => folderIdOf(child.path)),
  };
}
