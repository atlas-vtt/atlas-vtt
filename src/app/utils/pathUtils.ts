/**
 * Utility functions for handling file paths in Atlas VTT
 */

/**
 * What the URL of a local file starts with, as Obsidian hands it out (`getResourcePath`): `app://<id>/` in the
 * desktop app, `file:///` on mobile by Obsidian's own word, and the two forms Capacitor serves local files under.
 */
const RESOURCE_URL_PREFIXES: readonly RegExp[] = [
  /^app:\/\/[^/]+\//i,
  /^capacitor:\/\/localhost\/_capacitor_file_\//i,
  /^https?:\/\/localhost\/_capacitor_file_\//i,
  /^file:\/\/\//i,
];

/** `Platform.resourcePathPrefix` as the host set it; stripped before the known forms, so a prefix of a later Obsidian is understood too. */
let resourcePathPrefix = '';

/** Tells the path utilities what this Obsidian's resource URLs start with (`Platform.resourcePathPrefix`). */
export function setResourcePathPrefix(prefix: string): void {
  resourcePathPrefix = prefix;
}

/** What follows a resource URL's prefix, or null for anything that is no resource URL. */
function afterResourcePrefix(url: string): string | null {
  if (resourcePathPrefix && url.startsWith(resourcePathPrefix)) return url.slice(resourcePathPrefix.length);
  for (const prefix of RESOURCE_URL_PREFIXES) {
    const match = prefix.exec(url);
    if (match) return url.slice(match[0].length);
  }
  return null;
}

/** Whether `value` is the URL of a local file as Obsidian serves it, on desktop or mobile. */
export function isResourceUrl(value: string): boolean {
  return !!value && afterResourcePrefix(value) !== null;
}

/** The file a resource URL names, as its path on disk: without the prefix and the query, percent-decoded; null for anything else. */
export function resourceUrlToFilePath(url: string): string | null {
  const rest = url ? afterResourcePrefix(url) : null;
  if (rest === null) return null;
  const path = rest.split('?', 1)[0] ?? rest;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Folders a development vault is known by, tried where a path names no `atlas-vtt/`. */
const VAULT_FOLDER_PATTERNS = [/\/test-vault\/(.*)$/, /\/vault\/(.*)$/];

/**
 * The vault path inside a path on disk whose vault folder is not known: from the last `atlas-vtt/`
 * on, which also holds for paths with duplicated segments; null where nothing tells.
 */
function vaultPartOf(filePath: string): string | null {
  const lastAtlasIndex = filePath.lastIndexOf('atlas-vtt/');
  if (lastAtlasIndex !== -1) return filePath.substring(lastAtlasIndex);
  for (const pattern of VAULT_FOLDER_PATTERNS) {
    const match = filePath.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

const withLeadingSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

/**
 * The vault path of the file a resource URL names. With `vaultBase` (the vault's folder on disk)
 * it is what follows that folder; without it, or for a file outside it, the path from Atlas' own
 * folder on (`vaultPartOf`). Null for anything that is no resource URL, and where neither tells.
 */
export function resourceUrlToVaultPath(url: string, vaultBase?: string | null): string | null {
  const filePath = resourceUrlToFilePath(url);
  if (filePath === null) return null;
  if (vaultBase) {
    const full = withLeadingSlash(filePath);
    const base = withLeadingSlash(vaultBase);
    const start = full.indexOf(base);
    if (start !== -1) return full.substring(start + base.length).replace(/^\//, '');
  }
  return vaultPartOf(filePath);
}

/**
 * Normalize an image path to ensure it's a relative vault path
 * Converts resource URLs and absolute paths to relative vault paths
 */
export function normalizeImagePath(path: string): string {
  if (!path) return path;

  const fromUrl = resourceUrlToVaultPath(path);
  if (fromUrl !== null) return fromUrl;

  // A relative path already
  if (!isResourceUrl(path) && !path.startsWith('/')) return path;

  if (path.startsWith('/')) {
    const vaultPath = vaultPartOf(path);
    if (vaultPath !== null) return vaultPath;
  }

  // If we couldn't normalize it, return the original path
  console.warn(`[pathUtils] Could not normalize path: ${path}`);
  return path;
}

/**
 * Check if a path is a resource URL (`app://` on desktop, the mobile forms)
 */
export function isAppUrl(path: string): boolean {
  return isResourceUrl(path);
}

/**
 * Check if a path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  return path?.startsWith('/') || false;
}

/**
 * Check if a path needs normalization
 */
export function needsPathNormalization(path: string): boolean {
  return isAppUrl(path) || isAbsolutePath(path);
}

/** The last segment of a vault path: `a/b/goblin.webp` → `goblin.webp`. */
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** A note's name as people read it: `Bestiary/Marsh Warden.md` → `Marsh Warden`. */
export const noteName = (path: string): string => baseName(path).replace(/\.md$/i, '');

/** The folder of a vault path: `a/b/goblin.webp` → `a/b`; empty at the vault root. */
export const parentPath = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** How the heading part of a pin's link reads: `Stag#Overview#` is "Stag > Overview", and a heading's own `#` stays ("Room #3"). */
export const headingTitle = (heading: string): string => heading.replace(/#+$/, '').replace(/#(?=\S)/g, (mark, at: number, whole: string) => (at > 0 && /\S/.test(whole.charAt(at - 1)) ? ' > ' : mark));

/** How a note link reads to people: "Keep" for `Places/Keep.md`, "Keep > Dungeon" for `Places/Keep#Dungeon`. */
export function noteLinkTitle(notePath: string): string {
  const hash = notePath.indexOf('#');
  if (hash < 0) return noteName(notePath);
  const name = noteName(notePath.slice(0, hash));
  const heading = headingTitle(notePath.slice(hash + 1));
  return heading ? `${name} > ${heading}` : name;
}
