import { collectionFolderPath } from '../services/assetPaths';

/** Below a collection: one JSON file per mood. Atlas' own folder, never assets (`isReservedCollectionPath`). */
export const MOODS_FOLDER = 'moods';

export const moodsFolderOf = (collectionId: string): string => `${collectionFolderPath(collectionId)}/${MOODS_FOLDER}`;
