import { TFolder, type App } from 'obsidian';
import { ATLAS_VTT_DIR, type Tab } from '../types';
import { assetTypeOfTab, tabHasFolders } from './tabKinds';

const FOLDER_ID_PREFIX = 'folder-';

/** The vault folder holding a tab's assets in a collection; player characters lie among the tokens. */
export function tabFolderPath(collection: string, tab: Tab): string {
  return `${ATLAS_VTT_DIR}/collections/${collection}/${assetTypeOfTab(tab)}`;
}

/** Asset manager folders are identified by their vault path. */
export function folderIdOf(vaultPath: string): string {
  return `${FOLDER_ID_PREFIX}${vaultPath}`;
}

export function vaultPathOfFolder(folderId: string): string {
  return folderId.startsWith(FOLDER_ID_PREFIX) ? folderId.slice(FOLDER_ID_PREFIX.length) : folderId;
}

/** True when the folder still exists inside the tab's folder of the collection. */
export function isFolderOfTab(app: App, folderId: string, collection: string, tab: Tab): boolean {
  if (!tabHasFolders(tab)) return false;
  const path = vaultPathOfFolder(folderId);
  return path.startsWith(`${tabFolderPath(collection, tab)}/`) && app.vault.getAbstractFileByPath(path) instanceof TFolder;
}
