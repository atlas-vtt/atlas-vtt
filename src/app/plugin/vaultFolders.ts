import { App, TFolder, normalizePath } from 'obsidian';

/**
 * Returns the vault folder at `path`, creating it when missing.
 * Tolerates another writer creating the same folder concurrently.
 */
export async function ensureFolder(app: App, path: string): Promise<TFolder> {
  const normalizedPath = normalizePath(path);

  const existing = app.vault.getAbstractFileByPath(normalizedPath);
  if (existing instanceof TFolder) return existing;
  if (existing) {
    throw new Error(`Path exists but is not a folder: ${normalizedPath}`);
  }

  try {
    await app.vault.createFolder(normalizedPath);
  } catch (error: unknown) {
    const alreadyExists = error instanceof Error && error.message.includes('already exists');
    if (!alreadyExists && !app.vault.getFolderByPath(normalizedPath)) {
      throw error;
    }
  }

  const folder = app.vault.getFolderByPath(normalizedPath);
  if (!folder) {
    throw new Error(`Failed to get folder reference after creation: ${normalizedPath}`);
  }
  return folder;
}

/**
 * Whether a file or folder has this path, in any letter case: macOS and Windows do not tell names
 * apart by it.
 */
export function isPathTaken(app: App, path: string): boolean {
  if (app.vault.getAbstractFileByPath(path)) return true;
  const lower = path.toLowerCase();
  const siblings = app.vault.getFolderByPath(path.slice(0, Math.max(0, path.lastIndexOf('/'))) || '/')?.children ?? [];
  return siblings.some((child) => child.path.toLowerCase() === lower);
}

/**
 * Creates `path` and its parents through the adapter, which also reaches hidden
 * folders the vault API does not index. `known` remembers folders that already
 * exist, so many files in one folder check it only once.
 */
export async function ensureAdapterFolder(app: App, path: string, known: Set<string> = new Set()): Promise<void> {
  let current = '';
  for (const segment of path.split('/').filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    if (known.has(current)) continue;
    if (!(await app.vault.adapter.exists(current))) {
      try {
        await app.vault.adapter.mkdir(current);
      } catch (error: unknown) {
        if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;
      }
    }
    known.add(current);
  }
}
