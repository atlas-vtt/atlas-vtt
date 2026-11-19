/**
 * Where the Armarium lives, as the contract between the site and the plugin names it
 * (`docs/plans/2026-11-18-armarium-in-atlas.md`, format 1).
 */

/** The site's origin: the only one whose messages Atlas hears from the Armarium's frame, and the only one it answers. */
export const ARMARIUM_ORIGIN = 'https://atlas-vtt.dev';
/** The store's page, framed in the asset manager. */
export const ARMARIUM_PAGE_URL = `${ARMARIUM_ORIGIN}/armarium`;
/** What may be shared in the Armarium, which the publish step points to beside the declaration. */
export const ARMARIUM_RULES_URL = `${ARMARIUM_PAGE_URL}/rules#sharing`;

/** A listing's page in the Armarium, by its slug. */
export function armariumListingUrl(slug: string): string {
  return `${ARMARIUM_PAGE_URL}/${encodeURIComponent(slug)}`;
}

/** Whether `url` is a page of the Armarium, which its pane may show. */
export function isArmariumPageUrl(url: string): boolean {
  return url === ARMARIUM_PAGE_URL || url.startsWith(`${ARMARIUM_PAGE_URL}/`);
}

/** The installable list: every free listing the site shows at its newest version, with its file's size and SHA-256. */
export const ARMARIUM_LIST_URL = `${ARMARIUM_ORIGIN}/api/armarium/v1`;
/** Counts the download, then answers with a redirect to the file. */
export const ARMARIUM_DOWNLOAD_ROUTE = 'https://api.atlas-vtt.dev/v1/armarium/download';
/** Hosts a listing's own `downloadUrl` may point at, used only when the counting route fails. */
export const ARMARIUM_FILE_HOSTS: readonly string[] = ['atlasvttusercontent.com', 'raw.githubusercontent.com'];

/** The version of the messages and of the installable list this Atlas speaks. */
export const ARMARIUM_FORMAT = 1;

/** The counting route for one release of a listing. */
export function armariumDownloadUrl(uid: string, version: number): string {
  return `${ARMARIUM_DOWNLOAD_ROUTE}/${encodeURIComponent(uid)}/${version}`;
}

/** Whether `url` is an https address on one of the Armarium's file hosts. */
export function isArmariumFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.port === '' && ARMARIUM_FILE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
