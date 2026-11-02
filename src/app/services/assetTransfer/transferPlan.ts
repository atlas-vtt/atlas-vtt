import type { Asset } from '../AssetService';
import { collectionFolderPath } from '../assetPaths';
import type { BundleFile } from '../collectionBundle/bundleFormat';
import { besideMap, freePathIn, sceneMapOf, type PathMap } from '../collectionBundle/pathRemap';
import { JSON_FOLDERS } from '../vault-sync/assetFiles';
import { sceneSnapshotFolder, snapshotOwnerOf } from '../../snapshots/snapshotPaths';
import { baseName, parentPath } from '../../utils/pathUtils';

export type TransferMode = 'move' | 'copy';

/** One file operation of a transfer. */
export interface TransferStep {
  file: BundleFile;
  to: string;
  op: TransferMode;
}

export interface TransferPlanInput {
  mode: TransferMode;
  sourceCollectionId: string;
  targetCollectionId: string;
  /** The assets that go to the target collection. */
  assets: readonly Asset[];
  /** The id each copied asset gets; empty for a move, which keeps ids. */
  newIds: ReadonlyMap<string, string>;
  /** Every file the assets depend on, as `CollectionReferenceCollector` lists them. */
  files: readonly BundleFile[];
  /** Files that assets staying in the source collection use; a move copies these instead of taking them away. */
  usedBySource: ReadonlySet<string>;
  /** Token artwork of assets staying in the source collection: theirs, so it stays shared. */
  ownedBySource: ReadonlySet<string>;
  /** Whether a file exists at `path` in the vault. */
  existsInVault(path: string): boolean;
}

export interface TransferPlan {
  steps: TransferStep[];
  /** Old path → new path of every file that goes somewhere, and old id → new id of every copied asset. */
  rewrites: PathMap;
  /** Where the JSON file behind each asset's record ends up, by the asset's current id. */
  recordPaths: ReadonlyMap<string, string>;
}

/** The image and thumbnail of every token among `assets`, which each token owns: deleting the token deletes them. */
export function tokenArtwork(assets: readonly Asset[]): Set<string> {
  const artwork = new Set<string>();
  for (const asset of assets) {
    if (asset.type !== 'token') continue;
    artwork.add(asset.imagePath);
    if (asset.thumbnailPath) artwork.add(asset.thumbnailPath);
  }
  return artwork;
}

/** Files an asset owns: they go wherever the asset goes. Everything else it only refers to. */
type FileKind = 'record' | 'scene' | 'snapshot' | 'artwork' | 'reference';

const SNAPSHOT_ROLES: ReadonlySet<BundleFile['role']> = new Set<BundleFile['role']>(['scene-snapshot', 'scene-snapshot-thumbnail']);

/**
 * Decides what happens to each file when `assets` go from one collection to
 * another. Files an asset owns go with it: its record file, its scene map with
 * thumbnail and snapshots, and a token's own image and thumbnail. A copy
 * duplicates them, since deleting an asset deletes them too; token artwork
 * outside any collection is duplicated beside the original. Files the assets
 * only refer to (backgrounds, notes, statblocks, placed token art) are shared
 * where they lie outside the source collection's folder or belong to a token
 * that stays; otherwise they go to the target collection's folder, so the
 * target never depends on the source. A move takes them along unless an asset
 * staying behind still uses them.
 * Paths keep their place relative to the collection folder, with a free name
 * when that path is taken.
 */
export function planTransfer(input: TransferPlanInput): TransferPlan {
  const { mode, assets, newIds, files } = input;
  const sourcePrefix = `${collectionFolderPath(input.sourceCollectionId)}/`;
  const targetPrefix = `${collectionFolderPath(input.targetCollectionId)}/`;
  const relocated = (path: string): string | null =>
    (path.startsWith(sourcePrefix) ? `${targetPrefix}${path.slice(sourcePrefix.length)}` : null);

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const artwork = tokenArtwork(assets);
  const kindOf = (file: BundleFile): FileKind => {
    if (file.role === 'asset-file') return 'record';
    if (file.role === 'scene-map') return 'scene';
    if (SNAPSHOT_ROLES.has(file.role)) return 'snapshot';
    return artwork.has(file.vaultPath) ? 'artwork' : 'reference';
  };

  const claimed = new Set<string>();
  const isTaken = (path: string): boolean => claimed.has(path) || input.existsInVault(path);
  const steps: TransferStep[] = [];
  const rewrites = new Map<string, string>(newIds);
  const recordPaths = new Map<string, string>();
  const place = (file: BundleFile, wanted: string, op: TransferMode): string => {
    const to = isTaken(wanted) ? freePathIn(parentPath(wanted), baseName(wanted), isTaken) : wanted;
    claimed.add(to);
    steps.push({ file, to, op });
    rewrites.set(file.vaultPath, to);
    return to;
  };

  /** Where a file ends up and how it gets there; null when it stays shared where it is. */
  const destinationOf = (file: BundleFile): { to: string; op: TransferMode } | null => {
    const path = file.vaultPath;
    const inTarget = relocated(path);
    switch (kindOf(file)) {
      case 'record': {
        const owner = assetsById.get(file.owners?.[0] ?? '');
        if (!owner || owner.type === 'token' || owner.type === 'note') return null;
        const folder = JSON_FOLDERS[owner.type];
        const to = inTarget ?? `${targetPrefix}${folder}/${baseName(path)}`;
        const newId = newIds.get(owner.id);
        // A copy's record file is named after its new id, as the original's is after its own.
        const copyName = newId && baseName(to) === `${owner.id}.json` ? `${parentPath(to)}/${newId}.json` : to;
        return { to: copyName, op: mode };
      }
      case 'scene':
        return { to: inTarget ?? `${targetPrefix}scenes/${baseName(path)}`, op: mode };
      case 'snapshot': {
        // A scene's snapshots are found by its id, so a copy's go to the folder of its new id.
        const sceneId = snapshotOwnerOf(path)?.sceneId ?? file.owners?.[0];
        if (!sceneId) return null;
        return { to: `${sceneSnapshotFolder(input.targetCollectionId, newIds.get(sceneId) ?? sceneId)}/${baseName(path)}`, op: mode };
      }
      case 'artwork':
        if (!inTarget) return mode === 'copy' ? { to: path, op: 'copy' } : null;
        // Art a token staying behind also shows remains that token's; the leaving token gets a copy.
        return { to: inTarget, op: input.ownedBySource.has(path) ? 'copy' : mode };
      case 'reference':
        if (!inTarget || input.ownedBySource.has(path)) return null;
        return { to: inTarget, op: mode === 'move' && !input.usedBySource.has(path) ? 'move' : 'copy' };
    }
  };

  // A scene's thumbnail takes whatever name its map gets, so it is placed after the maps.
  const mapPaths = files.filter((file) => file.role === 'scene-map').map((file) => file.vaultPath);
  const besideMaps: Array<{ file: BundleFile; map: string }> = [];
  for (const file of files) {
    const map = sceneMapOf(file, mapPaths);
    if (map) {
      besideMaps.push({ file, map });
      continue;
    }
    const destination = destinationOf(file);
    if (!destination) continue;
    const to = place(file, destination.to, destination.op);
    if (file.role === 'asset-file' && file.owners?.[0]) recordPaths.set(file.owners[0], to);
  }
  for (const { file, map } of besideMaps) {
    const mapTarget = rewrites.get(map);
    if (mapTarget) place(file, besideMap(mapTarget), mode);
  }
  return { steps, rewrites, recordPaths };
}
