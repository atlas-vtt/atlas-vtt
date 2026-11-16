import { TFolder, type App } from 'obsidian';
import { ATLAS_VTT_DIR, type Folder, type Tab } from '../types';
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

/** The folders below a tab's folder in a collection, each listed before its subfolders; none for a tab without folders. */
export function readTabFolders(app: App, collection: string, tab: Tab): Folder[] {
  if (!tabHasFolders(tab)) return [];
  const basePath = tabFolderPath(collection, tab);
  const baseFolder = app.vault.getAbstractFileByPath(basePath);
  if (!(baseFolder instanceof TFolder)) return [];
  const folders: Folder[] = [];
  const recurse = (folder: TFolder, parentId: string | null): void => {
    for (const child of folder.children) {
      if (!(child instanceof TFolder)) continue;
      const id = folderIdOf(child.path);
      folders.push({ id, name: child.name, type: tab, path: child.path.substring(basePath.length + 1), parentId });
      recurse(child, id);
    }
  };
  recurse(baseFolder, null);
  return folders;
}
