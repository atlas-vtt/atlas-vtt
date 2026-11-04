import { t } from '../i18n';
export const ATLAS_VTT_DIR = 'atlas-vtt';
export const COLLECTIONS_DIR = `${ATLAS_VTT_DIR}/collections`;
export const GLOBAL_ASSETS_DIR = `${ATLAS_VTT_DIR}/assets`;

const COLLECTIONS_PREFIX = `${COLLECTIONS_DIR}/`;

/** The vault folder of a collection. */
export const collectionFolderPath = (id: string): string => `${COLLECTIONS_DIR}/${id}`;

/** The id of a collection folder (`atlas-vtt/collections/goblins` → `goblins`), or null for any other path. */
export function collectionIdOfFolder(path: string): string | null {
  const id = path.startsWith(COLLECTIONS_PREFIX) ? path.slice(COLLECTIONS_PREFIX.length) : '';
  return id && !id.includes('/') ? id : null;
}

/** The collection whose folder holds `path` (`atlas-vtt/collections/goblins/tokens/a.webp` → `goblins`), or null. */
export function collectionIdOfPath(path: string | null | undefined): string | null {
  if (!path?.startsWith(COLLECTIONS_PREFIX)) return null;
  const rest = path.slice(COLLECTIONS_PREFIX.length);
  const slash = rest.indexOf('/');
  return slash > 0 ? rest.slice(0, slash) : null;
}

/** Characters Obsidian rejects in file names or that break links to them. */
export const INVALID_NAME_CHARACTERS = /[\\/:*?"<>|#^[\]]/;

/**
 * Why `name` cannot name a collection folder, or null when it can. A
 * collection's folder carries its name, so the name must be a valid folder name.
 */
export function collectionNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return t('names.enter');
  if (INVALID_NAME_CHARACTERS.test(trimmed)) return t('names.invalidCollection');
  if (trimmed.startsWith('.')) return t('names.collectionDot');
  return null;
}

/** `name` as a folder name: characters a folder cannot carry become `-`, a leading dot goes. */
export function collectionFolderName(name: string): string {
  return name.trim().replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '').trim() || 'Collection';
}
