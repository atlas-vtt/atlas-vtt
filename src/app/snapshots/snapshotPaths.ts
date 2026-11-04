import { COLLECTIONS_DIR, collectionFolderPath } from '../services/assetPaths';

/**
 * The folder at a collection's root that holds its scenes' snapshots. Like
 * `collection.json` and `loot-history/`, it is Atlas' own: it lies outside
 * every tab folder, so the asset manager never shows it, and the vault check
 * never takes its files for assets.
 */
export const SNAPSHOTS_FOLDER = 'snapshots';

/** The folder a vault path lives in, '' for the vault root. */
export const parentFolderOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** Where a collection keeps the snapshots of all its scenes. */
export const collectionSnapshotsFolder = (collectionId: string): string => `${collectionFolderPath(collectionId)}/${SNAPSHOTS_FOLDER}`;

/**
 * A scene's snapshots live in a visible folder named after the scene's id:
 * `atlas-vtt/collections/<collection>/snapshots/<scene id>/`. Sync tools carry
 * them like any file, and renaming or moving the scene's map within its
 * collection leaves them where they are.
 */
export const sceneSnapshotFolder = (collectionId: string, sceneId: string): string =>
  `${collectionSnapshotsFolder(collectionId)}/${sceneId}`;

export const snapshotFilePath = (folder: string, id: string): string => `${folder}/${id}.json`;

export const snapshotThumbnailPath = (folder: string, id: string): string => `${folder}/${id}.jpg`;

const SNAPSHOT_FILE = new RegExp(`^${COLLECTIONS_DIR}/([^/]+)/${SNAPSHOTS_FOLDER}/([^/]+)/[^/]+$`);

/** The collection and scene a file in a scene's snapshot folder belongs to, or null for any other path. */
export function snapshotOwnerOf(path: string): { collectionId: string; sceneId: string } | null {
  const match = SNAPSHOT_FILE.exec(path);
  return match ? { collectionId: match[1]!, sceneId: match[2]! } : null;
}

/** Whether `path` is a snapshot's JSON file in a scene's snapshot folder. */
export const isSnapshotJsonPath = (path: string): boolean => path.endsWith('.json') && snapshotOwnerOf(path) !== null;

/** The hidden folder name older versions kept snapshots in, beside the scene's map file. */
export const LEGACY_SNAPSHOTS_DIR = '.snapshots';

/**
 * Where older versions kept a scene's snapshots: `scenes/Cave.atlasmap` in
 * `scenes/.snapshots/Cave/`. Read only to carry them over, from the vault and
 * from bundles those versions wrote.
 */
export function legacySnapshotFolderFor(mapPath: string): string {
  const folder = parentFolderOf(mapPath);
  const name = mapPath.slice(mapPath.lastIndexOf('/') + 1).replace(/\.atlasmap$/, '');
  return `${folder ? `${folder}/` : ''}${LEGACY_SNAPSHOTS_DIR}/${name}`;
}
