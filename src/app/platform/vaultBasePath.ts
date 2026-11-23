import { FileSystemAdapter, type DataAdapter } from 'obsidian';

/**
 * The vault's folder on disk, which resource URLs name files under: the desktop adapter's base
 * path, or the full path of the vault's root where the adapter gives full paths (mobile). Null
 * where the adapter tells neither.
 */
export function vaultBasePath(adapter: DataAdapter): string | null {
  if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
  const getFullPath: unknown = Reflect.get(adapter, 'getFullPath');
  if (typeof getFullPath !== 'function') return null;
  try {
    const root: unknown = Reflect.apply(getFullPath, adapter, ['']);
    return typeof root === 'string' && root ? root.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}
