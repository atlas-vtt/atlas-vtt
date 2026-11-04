import { normalizePath, type App } from 'obsidian';
import type { AssetService } from './AssetService';
import { getLoadedAtlasView } from '../plugin/atlasLeaves';
import { INVALID_NAME_CHARACTERS } from './assetPaths';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

/**
 * Writes the pending changes of an open scene before its file moves;
 * afterwards they would recreate the file at its old path.
 */
export async function saveOpenScene(app: App, mapPath: string): Promise<void> {
  const view = getLoadedAtlasView(app);
  if (view?.getTabMetaStore().getState().getTabByFilePath(mapPath)) await view.saveMap();
}

/**
 * Renames a scene and the .atlasmap file behind it, because the tab bar, pins
 * and links all identify a scene by its file. Returns whether it was renamed.
 * The vault rename event carries the new path to tabs, pins and thumbnails.
 */
export async function renameScene(app: App, assetService: AssetService, sceneId: string, requestedName: string): Promise<boolean> {
  const name = requestedName.trim();
  const scene = await assetService.getAssetById(sceneId);
  if (!name || scene?.type !== 'scene') return false;
  if (INVALID_NAME_CHARACTERS.test(name)) {
    showNotice(t('names.invalidScene'));
    return false;
  }

  const mapFile = scene.data?.mapPath ? app.vault.getFileByPath(scene.data.mapPath) : null;
  if (!mapFile) {
    await assetService.updateAsset(sceneId, { name });
    return true;
  }

  const folder = mapFile.path.slice(0, mapFile.path.lastIndexOf('/') + 1);
  const mapPath = normalizePath(`${folder}${name}.${mapFile.extension}`);
  if (mapPath !== mapFile.path) {
    if (app.vault.getAbstractFileByPath(mapPath)) {
      showNotice(t('am.scene.nameTaken', { name }));
      return false;
    }
    await saveOpenScene(app, mapFile.path);
    await app.fileManager.renameFile(mapFile, mapPath);
  }

  await assetService.updateAsset(sceneId, { name, data: { ...scene.data, mapPath } });
  return true;
}
