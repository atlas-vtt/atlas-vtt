import { TFile, type App } from 'obsidian';

/**
 * Files under a dot-folder stay out of Obsidian's file index: the file
 * explorer, search and Atlas' own asset browser never list them. They exist
 * only through `vault.adapter`, so these helpers cover what `vault` and
 * `fileManager` would otherwise do for them.
 */

/** Whether any segment of `path` starts with a dot, so the vault does not index it. */
export function isHiddenVaultPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

/** Moves a file or folder to the system trash, or the vault's `.trash` when there is none. */
export async function trashHiddenPath(app: App, path: string): Promise<void> {
  const { adapter } = app.vault;
  if (!(await adapter.exists(path))) return;
  if (!(await adapter.trashSystem(path))) await adapter.trashLocal(path);
}

/**
 * Removes the folder at `path` and then its parents, up to but not including
 * `stopAt`, as long as each is empty.
 */
export async function removeEmptyHiddenFolders(app: App, path: string, stopAt: string): Promise<void> {
  const { adapter } = app.vault;
  if (stopAt && !path.startsWith(`${stopAt}/`)) return;
  for (let folder = path; folder && folder !== stopAt; folder = folder.slice(0, Math.max(0, folder.lastIndexOf('/')))) {
    if (!(await adapter.exists(folder))) continue;
    const { files, folders } = await adapter.list(folder);
    if (files.length > 0 || folders.length > 0) return;
    // Obsidian's desktop adapter removes a folder only recursively: without it, `fs.rm` refuses even an empty one.
    await adapter.rmdir(folder, true);
  }
}

/** The bytes of the file at `path`, reading hidden files through the adapter; null when there is none. */
export async function readVaultBinary(app: App, path: string): Promise<ArrayBuffer | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) return app.vault.readBinary(file);
  if (isHiddenVaultPath(path) && await app.vault.adapter.exists(path)) return app.vault.adapter.readBinary(path);
  return null;
}

/** The size in bytes of the file at `path`, hidden or not; 0 when there is none. */
export async function vaultFileSize(app: App, path: string): Promise<number> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) return file.stat.size;
  if (!isHiddenVaultPath(path)) return 0;
  return (await app.vault.adapter.stat(path))?.size ?? 0;
}

/** Every file inside a hidden folder below `root`, which the vault index does not list. */
export async function listHiddenFiles(app: App, root: string): Promise<Set<string>> {
  const { adapter } = app.vault;
  const found = new Set<string>();
  if (!(await adapter.exists(root))) return found;
  const visit = async (folder: string, hidden: boolean): Promise<void> => {
    const { files, folders } = await adapter.list(folder);
    if (hidden) files.forEach((file) => found.add(file));
    for (const child of folders) await visit(child, hidden || isHiddenVaultPath(child.slice(root.length)));
  };
  await visit(root, false);
  return found;
}
