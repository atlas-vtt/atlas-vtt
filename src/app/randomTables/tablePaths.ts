import { collectionFolderPath } from '../services/assetPaths';

/** The folder at a collection's root that holds the table notes Atlas writes. Atlas' own: never an asset. */
export const TABLES_FOLDER = 'tables';

/** Where Atlas writes a collection's table notes. */
export const tablesFolder = (collectionId: string): string => `${collectionFolderPath(collectionId)}/${TABLES_FOLDER}`;
