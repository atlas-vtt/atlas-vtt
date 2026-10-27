/**
 * Folders of encounters a note pin can link to: a click on the pin rolls one of the encounters in
 * the folder or any folder below it. The link is the folder's vault path below a collection's
 * encounters folder (`atlas-vtt/collections/<c>/encounters/Forest`), the folder the asset manager's
 * Encounters tab shows; the encounters folder itself holds all of the collection's encounters.
 */
import { TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import { collectionIdOfPath } from '../services/assetPaths';
import { sceneLinkTarget } from '../services/sceneLinks';
import { isEncounterPath } from '../links/atlasLinkTargets';
import { tabFolderPath } from '../packages/components/asset-manager/utils/assetFolders';
import { t } from '../i18n';

/** A folder of encounters as the pin search offers it. */
export interface EncounterFolder {
  path: string;
  /** The folder's name; "All encounters" for the collection's encounters folder. */
  name: string;
  /** The folders above it inside the encounters folder (`Wilds › Forest`); empty at the top. */
  trail: string;
  /** The encounters in it and every folder below it. */
  count: number;
}

/** The name a folder of encounters is shown by. */
export function encounterFolderName(path: string): string {
  const collection = collectionIdOfPath(path);
  return collection && path === tabFolderPath(collection, 'encounters') ? t('pin.encounters.all') : path.slice(path.lastIndexOf('/') + 1);
}

/** The folders between the collection's encounters folder and `path` (`Wilds › Forest`); empty at the top. */
export function encounterFolderTrail(path: string): string {
  const collection = collectionIdOfPath(path);
  const root = collection ? tabFolderPath(collection, 'encounters') : '';
  if (!collection || !path.startsWith(`${root}/`)) return '';
  return path.slice(root.length + 1).split('/').slice(0, -1).join(' › ');
}

function encounterCount(folder: TFolder): number {
  let count = 0;
  for (const child of folder.children) {
    if (child instanceof TFolder) count += encounterCount(child);
    else if (child instanceof TFile && isEncounterPath(child.path)) count += 1;
  }
  return count;
}

/**
 * The folders of encounters the scene at `mapPath` may link to: its own collection's encounters
 * folder and every folder below it that holds an encounter, in the tree's order. None for a map
 * outside every collection, which has no encounters of its own.
 */
export function encounterFoldersOf(app: App, mapPath: string | null): EncounterFolder[] {
  const collection = collectionIdOfPath(mapPath);
  const root = collection ? app.vault.getAbstractFileByPath(tabFolderPath(collection, 'encounters')) : null;
  if (!(root instanceof TFolder)) return [];
  const folders: EncounterFolder[] = [];
  const visit = (folder: TFolder): void => {
    const count = encounterCount(folder);
    if (count === 0) return;
    folders.push({ path: folder.path, name: encounterFolderName(folder.path), trail: encounterFolderTrail(folder.path), count });
    const children = folder.children.filter((child: TAbstractFile): child is TFolder => child instanceof TFolder);
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) visit(child);
  };
  visit(root);
  return folders;
}

/**
 * The folder a pin on the scene at `mapPath` rolls from: the linked folder, or one of another
 * collection at the same place in the scene's own (a scene copied or moved with its pins), as scene
 * links resolve. Null where the scene lies outside every collection.
 */
export function linkedEncounterFolder(mapPath: string | null | undefined, link: string): string | null {
  return sceneLinkTarget(mapPath, link);
}
