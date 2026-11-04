import type { App } from 'obsidian';
import type { Asset, AssetService, MapAsset } from './AssetService';
import { CollectionReferenceCollector } from './collectionBundle/collectionReferences';

/**
 * The files of a deleted map that nothing else uses, so they can go with it: its image and
 * thumbnail, unless another map (copies share the image) or a scene of any collection (a level's
 * map or roof, a snapshot) still uses them. When that cannot be told, nothing goes: an image a
 * scene still shows would break the scene.
 */
export async function unusedMapFiles(app: App, assetService: AssetService, map: MapAsset, others: readonly Asset[]): Promise<string[]> {
  const users = others.filter((asset) => asset.id !== map.id && (asset.type === 'map' || asset.type === 'scene'));
  try {
    const { files } = await new CollectionReferenceCollector(app, assetService).collect(users);
    const used = new Set(files.map((file) => file.vaultPath));
    return [map.mapFilePath, map.thumbnailPath].filter((path): path is string => !!path && !used.has(path));
  } catch (error) {
    console.error('[AssetService] Could not tell whether a deleted map\'s image is still used; keeping it:', error);
    return [];
  }
}
