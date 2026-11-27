import { TABLE_CODE_PATTERN } from './relay.ts';

/**
 * The link that opens the GM screen on a device: the page's address on the play origin, with the room's
 * code and the link's key in the fragment (`#<code>.<key>`), which browsers never send to a server.
 */

/** Where the GM screen's page lives on the play origin. */
export const GM_SCREEN_PATH = '/gm-screen/';

/** The link's key: 32 random bytes in base64url without padding (its last character carries 2 bits of nothing). */
export const LINK_KEY_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** The longest text a link is read from: an address with its fragment, with room. */
const MAX_LINK_TEXT = 2048;

export interface GmScreenLink {
  /** The room at the relay. */
  readonly code: string;
  /** The key every frame of the room's channels is sealed under. */
  readonly key: string;
}

/** The fragment of a link, without its `#`. */
export const gmScreenFragment = (link: GmScreenLink): string => `${link.code}.${link.key}`;

/** The whole link on the play origin (`https://…`, without a trailing slash). */
export const gmScreenUrl = (origin: string, link: GmScreenLink): string => `${origin}${GM_SCREEN_PATH}#${gmScreenFragment(link)}`;

/** A link read from a whole address or a fragment, with or without its `#`; null for anything that names no room and key. */
export function readGmScreenLink(text: unknown): GmScreenLink | null {
  if (typeof text !== 'string' || text.length > MAX_LINK_TEXT) return null;
  const hash = text.lastIndexOf('#');
  const fragment = (hash === -1 ? text : text.slice(hash + 1)).trim();
  const dot = fragment.indexOf('.');
  if (dot === -1) return null;
  const code = fragment.slice(0, dot);
  const key = fragment.slice(dot + 1);
  return TABLE_CODE_PATTERN.test(code) && LINK_KEY_PATTERN.test(key) ? { code, key } : null;
}
