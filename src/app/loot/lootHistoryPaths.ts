import { COLLECTIONS_DIR, collectionFolderPath } from '../services/assetPaths';
import { COLLECTION_DATA_DIR } from '../services/collectionBundle/installRecord';

/** The folder at a collection's root with one loot history file per device. Atlas' own: never an asset, never exported. */
export const LOOT_HISTORY_FOLDER = 'loot-history';

/** Where a collection keeps the loot history files of all devices. */
export const lootHistoryFolder = (collectionId: string): string => `${collectionFolderPath(collectionId)}/${LOOT_HISTORY_FOLDER}`;

/** The loot history file this device writes for a collection; every other device writes its own. */
export const deviceLootHistoryPath = (collectionId: string, device: string): string => `${lootHistoryFolder(collectionId)}/${device}.json`;

/** Where earlier versions kept a collection's loot history, in the hidden data folder sync tools skip. */
export const legacyLootHistoryPath = (collectionId: string): string => `${COLLECTION_DATA_DIR}/collections/${collectionId}/loot-history.json`;

const DEVICE_FILE = new RegExp(`^${COLLECTIONS_DIR}/([^/]+)/${LOOT_HISTORY_FOLDER}/[^/]+\\.json$`);

/** The collection whose loot history folder holds `path`, or null for any other path. */
export function lootHistoryCollectionOf(path: string): string | null {
  return DEVICE_FILE.exec(path)?.[1] ?? null;
}
