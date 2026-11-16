import { normalizePath, type App, type TFolder } from 'obsidian';

/** Whether `path` names the vault's root folder. */
export function isRootPath(path: string): boolean {
  return path === '/' || path === '';
}

/**
 * `<name>.md` in the folder, else `<name> 2.md`, `<name> 3.md`… Taken counts any letter case,
 * since the file systems of macOS and Windows do not tell names apart by it.
 */
export function freeNotePath(app: App, folder: TFolder, stem: string): string {
  const taken = new Set(folder.children.map((child) => child.name.toLowerCase()));
  const pathOf = (name: string): string => normalizePath(isRootPath(folder.path) ? name : `${folder.path}/${name}`);
  let name = `${stem}.md`;
  for (let n = 2; taken.has(name.toLowerCase()) || app.vault.getAbstractFileByPath(pathOf(name)); n++) name = `${stem} ${n}.md`;
  return pathOf(name);
}
