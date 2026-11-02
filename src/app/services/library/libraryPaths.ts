import { ATLAS_VTT_DIR, COLLECTIONS_DIR, collectionFolderPath, collectionIdOfPath } from '../assetPaths';
import { recordFilePath } from '../vault-sync/assetFiles';

export { recordFilePath };

/** Library-wide facts every device shares: the default collection, the vault's publisher id. */
export const LIBRARY_FILE = `${ATLAS_VTT_DIR}/library.json`;

/**
 * Where versions before the hidden cache kept the index, visible and so carried by sync tools.
 * Read only while no device has written the library files, and retired once this one has.
 */
export const LEGACY_INDEX_FILE = `${ATLAS_VTT_DIR}/assets-metadata.json`;

/** A collection's own record (name, settings, tags), in its folder so it moves and syncs with it. */
export const COLLECTION_FILE = 'collection.json';

/** What the collection's last import or export installed; the baseline of its next update. */
export const INSTALL_FILE = 'install.json';

export const collectionFilePath = (collectionId: string): string => `${collectionFolderPath(collectionId)}/${COLLECTION_FILE}`;

export const installFilePath = (collectionId: string): string => `${collectionFolderPath(collectionId)}/${INSTALL_FILE}`;

const COLLECTION_FILE_PATTERN = new RegExp(`^${COLLECTIONS_DIR}/([^/]+)/${COLLECTION_FILE.replace('.', '\\.')}$`);

/** The collection whose `collection.json` this is, or null. */
export function collectionOfCollectionFile(path: string): string | null {
  return COLLECTION_FILE_PATTERN.exec(path)?.[1] ?? null;
}

/** Folders whose JSON files can hold asset records; `snapshots/`, `loot-history/` and the collection's own files never do. */
const RECORD_FILE_PATTERN = new RegExp(`^${COLLECTIONS_DIR}/[^/]+/(maps|scenes|encounters|players|characters|statblocks|tokens|notes)/.+\\.json$`);

/** Whether `path` may hold an asset record. */
export const isRecordFileCandidate = (path: string): boolean => RECORD_FILE_PATTERN.test(path);

const INSTALL_FILE_PATTERN = new RegExp(`^${COLLECTIONS_DIR}/[^/]+/${INSTALL_FILE.replace('.', '\\.')}$`);

/** Whether `path` is a file only Atlas writes for the library itself, which no bundle may bring: `library.json`, `collection.json`, `install.json`. */
export function isLibraryOwnFile(path: string): boolean {
  return path === LIBRARY_FILE || collectionOfCollectionFile(path) !== null || INSTALL_FILE_PATTERN.test(path);
}

/** Whether `path` is one of the files the library is read from. */
export function isLibraryFile(path: string): boolean {
  return path === LIBRARY_FILE || collectionOfCollectionFile(path) !== null || isRecordFileCandidate(path);
}

/** The collection a library file belongs to, by the folder it lies in. */
export const collectionOfLibraryFile = (path: string): string | null => collectionIdOfPath(path);
