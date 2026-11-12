import { normalizePath, type App } from 'obsidian';
import type { AssetService, AssetUpdates } from '../../../../services/AssetService';
import { ensureFolder } from '../../../../plugin/vaultFolders';
import { saveOpenScene } from '../../../../services/sceneRename';
import { primaryPathUpdate } from '../../../../services/vault-sync/assetFiles';
import { assetFolderId, isTabAsset, placingFilePath, type TabServiceAsset } from './assetFormatters';
import { vaultPathOfFolder } from './assetFolders';
import { describeError } from '../../../../utils/errors';
import { formatList, t } from '../../../../i18n';

/** What moving assets into a folder did. */
export interface FolderMoveResult {
  /** Ids of the assets whose file moved. */
  moved: string[];
  /** Names of the assets left in place because the folder already holds a file of the same name. */
  nameClashes: string[];
  /** The assets whose file could not be moved, and why. */
  failed: FailedMove[];
}

/** An asset whose file could not be moved, by name, and the reason the vault gave. */
export interface FailedMove {
  name: string;
  reason: string;
}

/** Points an asset at the new place of the file that places it in a folder. */
export function placingFileUpdate(asset: TabServiceAsset, path: string): AssetUpdates {
  return asset.type === 'map' ? { filePath: path } : primaryPathUpdate(asset, path);
}

/**
 * Moves assets into a folder of their tab (`targetFolderId`, or the tab's top
 * level when null) by moving the file that places each one (`placingFilePath`):
 * token art, a map's record, a scene's `.atlasmap`, an encounter's JSON. A
 * map's image stays where it is. The rename event carries the new path to
 * scenes, snapshots and notes. Assets already in the folder stay where they are.
 */
export async function moveAssetsIntoFolder(
  app: App,
  assetService: AssetService,
  assetIds: readonly string[],
  tabBasePath: string,
  targetFolderId: string | null,
): Promise<FolderMoveResult> {
  const targetDir = targetFolderId ? vaultPathOfFolder(targetFolderId) : tabBasePath;
  const result: FolderMoveResult = { moved: [], nameClashes: [], failed: [] };

  await assetService.runExclusive(async () => {
    for (const id of assetIds) {
      const asset = await assetService.getAssetById(id);
      if (!asset || !isTabAsset(asset) || assetFolderId(asset, tabBasePath) === targetFolderId) continue;
      const file = app.vault.getFileByPath(placingFilePath(asset) ?? '');
      if (!file) continue;

      const newPath = normalizePath(`${targetDir}/${file.name}`);
      if (app.vault.getAbstractFileByPath(newPath)) {
        result.nameClashes.push(asset.name);
        continue;
      }
      try {
        if (asset.type === 'scene') await saveOpenScene(app, file.path);
        await ensureFolder(app, targetDir);
        await app.fileManager.renameFile(file, newPath);
        await assetService.updateAsset(id, placingFileUpdate(asset, newPath));
        result.moved.push(id);
      } catch (error) {
        console.error(`[assetFolderMove] Failed to move ${file.path} to ${newPath}:`, error);
        result.failed.push({ name: asset.name, reason: describeError(error) });
      }
    }
  });
  return result;
}

/** What to tell the user about assets a move left in place, with the reason, or null when every asset moved. */
export function folderMoveProblem({ nameClashes, failed }: Pick<FolderMoveResult, 'nameClashes' | 'failed'>): string | null {
  const problems: string[] = [];
  if (nameClashes.length > 0) problems.push(t('am.move.nameClash', { names: formatList(nameClashes) }));
  for (const { name, reason } of failed) problems.push(t('am.move.failed', { name, reason }));
  return problems.length > 0 ? problems.join(' ') : null;
}
