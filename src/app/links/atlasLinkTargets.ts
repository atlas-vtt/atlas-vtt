import { COLLECTIONS_DIR } from '../services/assetPaths';
import { JSON_FOLDERS } from '../services/vault-sync/assetFiles';

/** Characters that end or split an Obsidian link's subpath: `#` and `^` start one, `|` an alias, brackets close the link. */
const LINK_BREAKING = /[#|^[\]\\]+/g;

/**
 * A name as a link can hold it, after its `#` or as its alias: the characters
 * a link cannot hold read as spaces, as Obsidian does for headings.
 */
export function linkSafeName(name: string): string {
  return name.replace(LINK_BREAKING, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The snapshot name a link's subpath (`#Before the fight`) asks for, or null
 * when it asks for none (no subpath, or a block reference `#^id`).
 */
export function snapshotNameOfSubpath(subpath: string): string | null {
  if (!subpath.startsWith('#') || subpath.startsWith('#^')) return null;
  const name = linkSafeName(subpath.slice(1));
  return name || null;
}

/** The first item whose name a link names: exactly as written, else ignoring case. */
export function findByLinkName<T>(items: readonly T[], linkName: string, nameOf: (item: T) => string): T | null {
  const names = items.map((item) => linkSafeName(nameOf(item)));
  const exact = names.indexOf(linkName);
  if (exact >= 0) return items[exact] ?? null;
  const lower = linkName.toLowerCase();
  const loose = names.findIndex((name) => name.toLowerCase() === lower);
  return loose >= 0 ? items[loose] ?? null : null;
}

const ENCOUNTER_FILE = new RegExp(`^${COLLECTIONS_DIR}/[^/]+/${JSON_FOLDERS.encounter}/.+\\.json$`);

/** Whether the vault file at `path` lies where Atlas keeps encounters: a JSON file below a collection's encounters folder. */
export function isEncounterPath(path: string): boolean {
  return ENCOUNTER_FILE.test(path);
}

const ENCOUNTER_FOLDER = new RegExp(`^${COLLECTIONS_DIR}/[^/#]+/${JSON_FOLDERS.encounter}(?:/[^#]*)?$`);

/**
 * Whether a pin's link names a folder of encounters (a collection's encounters folder or one below
 * it), which the pin rolls from, rather than a note or a scene.
 */
export function isEncounterFolderLink(link: string): boolean {
  return ENCOUNTER_FOLDER.test(link) && !link.toLowerCase().endsWith('.json');
}
