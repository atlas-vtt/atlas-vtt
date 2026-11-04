import type { AssetMetadata } from '../AssetService';
import { collectionFolderPath } from '../assetPaths';
import { derivedCollectionRecord, forgetCollection, moveCollectionRecord } from '../collectionRecords';
import type { PathMove } from '../renamedPaths';
import { ownedPaths } from './assetFiles';

interface FolderMatch {
  from: string;
  to: string;
  /** How many of the collection's files turned up in the folder. */
  score: number;
}

/** The paths of a collection's files relative to its folder (`scenes/Cave.atlasmap`). */
function relativePaths(metadata: AssetMetadata, id: string): string[] {
  const prefix = `${collectionFolderPath(id)}/`;
  return Object.values(metadata.assets)
    .filter((asset) => asset.collection === id)
    .flatMap(ownedPaths)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
}

/**
 * Finds collections whose folder was renamed where Atlas could not see it, for
 * example in the file manager or by a sync tool: Obsidian reports those as a
 * deleted folder and a new one. A collection whose files are all gone from its
 * folder moved to the unknown folder that holds most of them at the same
 * places. An empty collection whose folder is gone moved to the only new folder.
 */
function matchMovedFolders(metadata: AssetMetadata, folders: ReadonlySet<string>, files: ReadonlySet<string>): FolderMatch[] {
  const unknown = [...folders].filter((id) => !metadata.collections[id]);
  if (unknown.length === 0) return [];

  const candidates: FolderMatch[] = [];
  const emptyAndGone: string[] = [];
  for (const id of Object.keys(metadata.collections)) {
    const paths = relativePaths(metadata, id);
    const folderGone = !folders.has(id);
    if (paths.length === 0) {
      const hasAssets = Object.values(metadata.assets).some((asset) => asset.collection === id);
      if (folderGone && !hasAssets) emptyAndGone.push(id);
      continue;
    }
    const vacated = folderGone || paths.every((path) => !files.has(`${collectionFolderPath(id)}/${path}`));
    if (!vacated) continue;
    for (const folder of unknown) {
      const score = paths.filter((path) => files.has(`${collectionFolderPath(folder)}/${path}`)).length;
      if (score > 0) candidates.push({ from: id, to: folder, score });
    }
  }

  const matches: FolderMatch[] = [];
  const movedCollections = new Set<string>();
  const claimedFolders = new Set<string>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (movedCollections.has(candidate.from) || claimedFolders.has(candidate.to)) continue;
    matches.push(candidate);
    movedCollections.add(candidate.from);
    claimedFolders.add(candidate.to);
  }

  const unmatched = unknown.filter((folder) => !claimedFolders.has(folder));
  const [onlyFolder] = unmatched;
  const [onlyEmpty] = emptyAndGone;
  if (unmatched.length === 1 && emptyAndGone.length === 1 && onlyFolder && onlyEmpty) {
    matches.push({ from: onlyEmpty, to: onlyFolder, score: 0 });
  }
  return matches;
}

export interface FolderChanges {
  /** Collection folders that moved; the rest of the vault may still reference their files by the old paths. */
  moves: PathMove[];
  /** Folders that became collections. */
  added: string[];
}

/**
 * Brings the collection records in line with the folders in the collections
 * folder: moved folders keep their record (uid, settings, tags), new folders
 * become collections.
 */
export function followCollectionFolders(
  metadata: AssetMetadata,
  folders: ReadonlySet<string>,
  files: ReadonlySet<string>,
  now: number,
): FolderChanges {
  const moves: PathMove[] = [];
  for (const { from, to } of matchMovedFolders(metadata, folders, files)) {
    moveCollectionRecord(metadata, from, to, now);
    moves.push({ from: collectionFolderPath(from), to: collectionFolderPath(to) });
  }
  const added = [...folders].sort().filter((id) => !metadata.collections[id]);
  for (const id of added) metadata.collections[id] = derivedCollectionRecord(id);
  return { moves, added };
}

/** Forgets every collection whose folder is gone; returns whether any was. */
export function forgetCollectionsWithoutFolder(metadata: AssetMetadata, folders: ReadonlySet<string>, now: number): boolean {
  const gone = Object.keys(metadata.collections).filter((id) => !folders.has(id));
  for (const id of gone) forgetCollection(metadata, id, now);
  return gone.length > 0;
}
