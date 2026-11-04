import type { Asset, SceneAsset } from '../AssetService';
import { legacySnapshotFolderFor, snapshotOwnerOf } from '../../snapshots/snapshotPaths';
import { parentPath } from '../../utils/pathUtils';
import type { BundleFile } from './bundleFormat';

/**
 * The bundle scene a snapshot file belongs to: the scene that owns it, else
 * the scene its folder is named after, else (bundles of earlier versions) the
 * scene whose map its hidden folder lay beside. Null when none of the bundle's
 * scenes claims it.
 */
export function sceneOfSnapshot(file: BundleFile, assets: readonly Asset[]): string | null {
  const scenes = assets.filter((asset): asset is SceneAsset => asset.type === 'scene');
  const ids = new Set(scenes.map((scene) => scene.id));
  const owner = file.owners?.find((id) => ids.has(id));
  if (owner) return owner;
  const named = snapshotOwnerOf(file.vaultPath)?.sceneId;
  if (named && ids.has(named)) return named;
  const folder = parentPath(file.vaultPath);
  return scenes.find((scene) => scene.data?.mapPath && legacySnapshotFolderFor(scene.data.mapPath) === folder)?.id ?? null;
}
