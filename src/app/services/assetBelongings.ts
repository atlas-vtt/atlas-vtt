import type { Asset } from './AssetService';
import { ATLAS_VTT_DIR } from './assetPaths';
import type { BundleFileRole } from './collectionBundle/bundleFormat';
import { thumbnailFiles } from './thumbnailFiles';
import { assetFilePath } from './vault-sync/assetFiles';

/** The scene thumbnail lives next to its map file. */
export const sceneThumbnailPath = (mapPath: string): string => mapPath.replace(/\.atlasmap$/, '.thumb.jpg');

/**
 * A file that is part of an asset, under the role bundles and transfers know it by. A shared one
 * may be used by other assets too: copies of a map share its image and thumbnail, scenes show a
 * map's image, copies of an encounter share its thumbnail. Every other one is the asset's alone.
 */
export interface Belonging {
  path: string;
  role: BundleFileRole;
  shared: boolean;
}

/** What only the vault can say about an asset's files. */
export interface FoundFiles {
  /** A scene's map; records of older versions name it only in their JSON file. */
  mapPath?: string | undefined;
  /** The file an encounter's thumbnail URL names. Only a delete looks it up: bundles do not carry it (#882). */
  encounterThumbnail?: string | undefined;
}

const own = (path: string, role: BundleFileRole): Belonging => ({ path, role, shared: false });
const shared = (path: string, role: BundleFileRole): Belonging => ({ path, role, shared: true });

/** A thumbnail in every format a device may have stored it in (`thumbnailFiles`). */
const thumbnails = (path: string | undefined, isShared: boolean): Belonging[] =>
  thumbnailFiles(path).map((file) => (isShared ? shared : own)(file, 'thumbnail'));

/**
 * The files that are part of `asset`, the file that backs it first. They go wherever it goes: a
 * move takes them, a copy duplicates those it owns alone, an export packs them, and a delete trashes
 * them (`trashedOnDelete`). A scene's snapshots belong to it as well; they are found by its id
 * (`snapshotFolderOf`), not listed here.
 */
export function belongingsOf(asset: Asset, found: FoundFiles = {}): Belonging[] {
  const backing = own(assetFilePath(asset), asset.type === 'token' ? 'token-image' : 'asset-file');
  const files = ((): Belonging[] => {
    switch (asset.type) {
      case 'token':
        return [backing, ...thumbnails(asset.thumbnailPath, false)];
      case 'map':
        return [backing, shared(asset.mapFilePath, 'background'), ...thumbnails(asset.thumbnailPath, true)];
      case 'scene':
        return found.mapPath ? [backing, own(found.mapPath, 'scene-map'), own(sceneThumbnailPath(found.mapPath), 'scene-thumbnail')] : [backing];
      case 'encounter':
        return found.encounterThumbnail ? [backing, shared(found.encounterThumbnail, 'thumbnail')] : [backing];
      default:
        return [backing];
    }
  })();
  return files.filter((file) => file.path);
}

/** The image and thumbnails of every token among `assets`, each token's alone: a copy gets its own. */
export function tokenArtwork(assets: readonly Asset[]): Set<string> {
  return new Set(assets.flatMap((asset) => (asset.type === 'token' ? belongingsOf(asset).map((file) => file.path) : [])));
}

/**
 * The paths of `belongings` a delete trashes: each the asset owns alone, and a shared one only
 * inside Atlas's folder and while `stillUsed` says nothing else needs it. A scene's thumbnail is
 * left to the vault check, which trashes it once it sees the map go (`vaultSync`).
 */
export function trashedOnDelete(belongings: readonly Belonging[], stillUsed: (path: string) => boolean): string[] {
  return belongings
    .filter((file) => file.role !== 'scene-thumbnail')
    .filter((file) => !file.shared || (file.path.startsWith(`${ATLAS_VTT_DIR}/`) && !stillUsed(file.path)))
    .map((file) => file.path);
}
