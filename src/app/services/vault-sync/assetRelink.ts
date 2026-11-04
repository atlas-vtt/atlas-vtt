import type { Asset, AssetMetadata } from '../AssetService';
import { collectionIdOfPath } from '../assetPaths';
import type { PathMove } from '../renamedPaths';
import { baseName } from '../../utils/pathUtils';
import { defaultJsonPath, primaryPath, setPrimaryPath, sidecarPath } from './assetFiles';
import { isReservedCollectionPath } from './reservedPaths';

/** File operations that bring the collection folders in line with the index. */
export interface VaultFileOps {
  moves: PathMove[];
  trash: string[];
}

export interface RelinkResult {
  changed: boolean;
  /** Files the index found at a new place. */
  fileMoves: PathMove[];
}

/** Files no record owns, by file name, handed out once each to records whose file moved. */
class UnownedFiles {
  private readonly byName = new Map<string, string[]>();

  constructor(files: ReadonlySet<string>, private readonly owned: Set<string>) {
    for (const path of files) {
      if (owned.has(path) || isReservedCollectionPath(path)) continue;
      const name = baseName(path);
      const paths = this.byName.get(name);
      if (paths) paths.push(path);
      else this.byName.set(name, [path]);
    }
  }

  /** The only unowned file with the name of `path`, now owned; null when there is none or several. */
  claim(path: string): string | null {
    const candidates = (this.byName.get(baseName(path)) ?? []).filter((candidate) => !this.owned.has(candidate));
    const [only] = candidates;
    if (candidates.length !== 1 || !only) return null;
    this.owned.add(only);
    return only;
  }
}

/**
 * Whether a record goes when its file is gone. A record with a record file of
 * its own goes only with that file: a sync tool may deliver the record before
 * its art, or another device's rename as a deletion and a creation, and a
 * device cannot tell those from the user deleting the file, so going here
 * would delete the record on every device. Without a record file, art, maps
 * and scenes are their file. The index holds everything else in full, so those
 * go only after the user deleted the file, never because a file is missing at startup.
 */
function isGoneWithFile(asset: Asset, path: string | null, deleted: ReadonlySet<string>, recorded: ReadonlySet<string>): boolean {
  if (recorded.has(asset.id)) return false;
  switch (asset.type) {
    case 'token':
    case 'map':
    case 'scene':
      return true;
    case 'note':
      return false;
    default:
      return path !== null && deleted.has(path);
  }
}

/**
 * Brings every record in line with the files: a record whose file moved follows
 * it (found by file name among files no record owns), a record whose file is
 * gone leaves the index, and every record belongs to the collection whose
 * folder holds its file, its JSON copy going along. `owned` holds the paths
 * records own and grows with every file found.
 */
export function relinkAssets(
  metadata: AssetMetadata,
  files: ReadonlySet<string>,
  deleted: ReadonlySet<string>,
  owned: Set<string>,
  ops: VaultFileOps,
  recorded: ReadonlySet<string> = new Set(),
): RelinkResult {
  const unowned = new UnownedFiles(files, owned);
  const fileMoves: PathMove[] = [];
  let changed = false;

  for (const [id, asset] of Object.entries(metadata.assets)) {
    const sidecar = sidecarPath(asset);
    let sidecarAt = sidecar && files.has(sidecar) ? sidecar : null;
    if (sidecar && !sidecarAt) {
      sidecarAt = unowned.claim(sidecar);
      if (sidecarAt) {
        asset.filePath = sidecarAt;
        changed = true;
      }
    }

    const primary = primaryPath(asset);
    if (!primary || !files.has(primary)) {
      const found = primary ? unowned.claim(primary) : null;
      if (found && primary) {
        setPrimaryPath(asset, found);
        fileMoves.push({ from: primary, to: found });
        changed = true;
      } else if (isGoneWithFile(asset, primary, deleted, recorded)) {
        delete metadata.assets[id];
        if (sidecarAt) ops.trash.push(sidecarAt);
        changed = true;
        continue;
      }
    }

    const home = collectionIdOfPath(primaryPath(asset)) ?? collectionIdOfPath(sidecarAt);
    if (home && home !== asset.collection && metadata.collections[home]) {
      asset.collection = home;
      changed = true;
    }
    if (followCollection(asset, sidecarAt, files, ops)) changed = true;
  }
  return { changed, fileMoves };
}

/** Moves a scene's or map's JSON copy into its asset's collection; returns whether the record changed. */
function followCollection(asset: Asset, sidecarAt: string | null, files: ReadonlySet<string>, ops: VaultFileOps): boolean {
  if (asset.type !== 'scene' && asset.type !== 'map') return false;
  if (!sidecarAt) {
    // A record without a JSON copy keeps no stale place in another collection's folder.
    if (!asset.filePath || collectionIdOfPath(asset.filePath) === asset.collection) return false;
    delete asset.filePath;
    return true;
  }
  if (collectionIdOfPath(sidecarAt) === asset.collection) return false;
  const target = defaultJsonPath(asset.type, asset.collection, asset.id);
  if (files.has(target)) return false;
  ops.moves.push({ from: sidecarAt, to: target });
  asset.filePath = target;
  return true;
}
