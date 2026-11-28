import { TFile, type App } from 'obsidian';
import type { Asset, AssetService, MapAsset } from './AssetService';
import { belongingsOf, trashedOnDelete, type Belonging } from './assetBelongings';
import { CollectionReferenceCollector, mapPathInRecord } from './collectionBundle/collectionReferences';
import { trashMapMemories } from '../campaigns/exploredFolders';
import { encounterThumbnailFile } from '../encounters/encounterThumbnailFile';
import { trashSceneSnapshots } from '../snapshots/sceneSnapshotFolders';
import { trashVaultItem } from '../utils/trashVaultItem';

/**
 * Trashes the files a deleted asset leaves behind (`belongingsOf`, `trashedOnDelete`), and for a
 * scene its snapshots and what players explored of its map in every campaign. `others` is every
 * asset of the index; a shared file stays while one of them or a note still uses it.
 */
export async function trashAssetBelongings(app: App, assetService: AssetService, asset: Asset, others: readonly Asset[]): Promise<void> {
  const [backing] = belongingsOf(asset);
  if (backing) await trashIfPresent(app, backing.path);

  // The JSON is in the trash by now, so an older record's map is not found and stays (#881).
  const mapPath = asset.type === 'scene' ? (asset.data ? asset.data.mapPath : await mapPathInRecord(app, backing?.path)) : undefined;
  const encounterThumbnail = asset.type === 'encounter' ? encounterThumbnailFile(app, asset.thumbnailUrl)?.path : undefined;
  const belongings = belongingsOf(asset, { mapPath, encounterThumbnail }).filter((file) => file.path !== backing?.path);
  const stillUsed = await sharedFilesInUse(app, assetService, asset, belongings, others);
  for (const path of trashedOnDelete(belongings, stillUsed)) {
    if (path === mapPath) closeMarkdownLeaves(app, path);
    await trashIfPresent(app, path);
  }

  if (asset.type !== 'scene') return;
  try {
    await trashSceneSnapshots(app, asset);
    if (mapPath !== undefined) await trashMapMemories(app, mapPath);
  } catch (error) {
    console.error('[AssetService] Error deleting scene snapshots:', error);
  }
}

/** Whether another asset or a note still uses a shared belonging; true for every path while that cannot be told. */
async function sharedFilesInUse(app: App, assetService: AssetService, asset: Asset, belongings: readonly Belonging[], others: readonly Asset[]): Promise<(path: string) => boolean> {
  if (!belongings.some((file) => file.shared)) return () => false;
  if (asset.type === 'map') return mapFilesInUse(app, assetService, asset, others);
  if (asset.type !== 'encounter') return () => false;
  const copied = others.some((other) => other.id !== asset.id && other.type === 'encounter' && other.thumbnailUrl === asset.thumbnailUrl);
  return () => copied;
}

/**
 * Another map (copies share the image), a scene of any collection (a level's map or roof, a
 * snapshot) or a note's link may use a map's files. A scene whose map is gone or unreadable, as
 * while a sync is under way, may show them too, so then every file counts as used.
 */
async function mapFilesInUse(app: App, assetService: AssetService, map: MapAsset, others: readonly Asset[]): Promise<(path: string) => boolean> {
  const users = others.filter((asset) => asset.id !== map.id && (asset.type === 'map' || asset.type === 'scene'));
  try {
    const { files, unreadScenes } = await new CollectionReferenceCollector(app, assetService).collect(users);
    if (unreadScenes.length > 0) {
      console.warn('[AssetService] Keeping a deleted map\'s files: scenes whose maps cannot be read may use them:', unreadScenes.map((scene) => scene.name));
      return () => true;
    }
    const used = new Set(files.map((file) => file.vaultPath));
    return (path) => used.has(path) || Object.values(app.metadataCache.resolvedLinks).some((links) => path in links);
  } catch (error) {
    console.error('[AssetService] Could not tell whether a deleted map\'s image is still used; keeping it:', error);
    return () => true;
  }
}

/** Atlas closes the scene's tab when the vault reports the deletion (`vaultSync`); a markdown leaf showing the file goes here. */
function closeMarkdownLeaves(app: App, path: string): void {
  if (!(app.vault.getAbstractFileByPath(path) instanceof TFile)) return;
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    if (leaf.view?.getState?.()?.file === path) leaf.detach();
  }
}

async function trashIfPresent(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  try {
    await trashVaultItem(app, file);
  } catch (error) {
    console.error('[AssetService] Error deleting file:', path, error);
  }
}
