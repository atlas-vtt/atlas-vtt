import { TFile, type App } from 'obsidian';
import { mapThumbnailPath } from '../utils/dataFileMigration';

/**
 * Moves the thumbnail of the scene whose map lay at `oldMapPath` to where the map lies as
 * `newMapPath`: it lies beside the map, under the map's name. A scene without a thumbnail in the
 * vault has none to move, and a thumbnail that cannot move never stops what moves the map.
 */
export async function moveSceneThumbnail(app: App, oldMapPath: string, newMapPath: string): Promise<void> {
  if (oldMapPath === newMapPath || !oldMapPath.endsWith('.atlasmap') || !newMapPath.endsWith('.atlasmap')) return;
  const thumbnail = app.vault.getAbstractFileByPath(mapThumbnailPath(oldMapPath));
  if (!(thumbnail instanceof TFile)) return;
  const target = mapThumbnailPath(newMapPath);
  try {
    // A thumbnail at the new path is a leftover of a deleted scene: no scene can be renamed onto a living one
    const leftover = app.vault.getAbstractFileByPath(target);
    if (leftover instanceof TFile) await app.fileManager.trashFile(leftover);
    await app.vault.rename(thumbnail, target);
  } catch (error) {
    console.error(`[sceneThumbnailFile] Error moving thumbnail ${thumbnail.path}:`, error);
  }
}
