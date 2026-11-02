import { collectionIdOfPath, collectionFolderPath } from '../assetPaths';
import { SNAPSHOTS_FOLDER } from '../../snapshots/snapshotPaths';
import { LOOT_HISTORY_FOLDER } from '../../loot/lootHistoryPaths';
import { TABLES_FOLDER } from '../../randomTables/tablePaths';

/** Folders at a collection's root that hold Atlas' own files, never assets: they lie outside every tab folder. */
const RESERVED_FOLDERS: readonly string[] = [SNAPSHOTS_FOLDER, LOOT_HISTORY_FOLDER, TABLES_FOLDER];

/**
 * Whether `path` lies in one of Atlas' own folders at a collection's root
 * (scene snapshots, loot history, table notes). The vault check never adopts, relinks or
 * claims such a file as an asset.
 */
export function isReservedCollectionPath(path: string): boolean {
  const collectionId = collectionIdOfPath(path);
  if (!collectionId) return false;
  const rest = path.slice(collectionFolderPath(collectionId).length + 1);
  return RESERVED_FOLDERS.some((folder) => rest.startsWith(`${folder}/`));
}
