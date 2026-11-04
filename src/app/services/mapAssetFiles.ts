import type { App } from 'obsidian';
import type { Asset, AssetService, MapAsset } from './AssetService';
import { ATLAS_VTT_DIR } from './assetPaths';
import { CollectionReferenceCollector } from './collectionBundle/collectionReferences';

/**
 * The files of a deleted map that nothing else uses, so they can go with it: its image and
 * thumbnail, where Atlas keeps them, unless another map (copies share the image), a scene of any
 * collection (a level's map or roof, a snapshot) or a note's link still uses them. When that
 * cannot be told (a scene whose map file is gone or unreadable, as while a sync is under way),
 * nothing goes: an image a scene still shows would break the scene.
 */
export async function unusedMapFiles(app: App, assetService: AssetService, map: MapAsset, others: readonly Asset[]): Promise<string[]> {
  const users = others.filter((asset) => asset.id !== map.id && (asset.type === 'map' || asset.type === 'scene'));
  try {
    const { files, unreadScenes } = await new CollectionReferenceCollector(app, assetService).collect(users);
    if (unreadScenes.length > 0) {
      console.warn('[AssetService] Keeping a deleted map\'s files: scenes whose maps cannot be read may use them:', unreadScenes.map((scene) => scene.name));
      return [];
    }
    const used = new Set(files.map((file) => file.vaultPath));
    const linked = (path: string): boolean => Object.values(app.metadataCache.resolvedLinks).some((links) => path in links);
    return [map.mapFilePath, map.thumbnailPath].filter((path): path is string =>
      !!path && path.startsWith(`${ATLAS_VTT_DIR}/`) && !used.has(path) && !linked(path));
  } catch (error) {
    console.error('[AssetService] Could not tell whether a deleted map\'s image is still used; keeping it:', error);
    return [];
  }
}
