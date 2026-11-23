import { isRecord } from '../utils/guards';
import { ARMARIUM_FORMAT, ARMARIUM_ORIGIN } from './armariumUrls';
import { isListingUid, isReleaseVersion, type ArmariumRequest } from './armariumRequest';
import { readStoreTags, type StoreTags } from './storeTags';
import { readPageRequest, type PageRequest } from './myUploadsRequests';

/** Where an install stands, as the Armarium page is told. */
export type InstallState = 'downloading' | 'reviewing' | 'installed' | 'cancelled' | 'failed';

/** What the page's Share asks Atlas to share: a collection, or a single Atlas file of one of these kinds. */
export const SHARE_WHATS = ['collection', 'statblock-template', 'system-preset', 'dice-set'] as const;
export type ShareWhat = (typeof SHARE_WHATS)[number];

/** What the Armarium page may ask of Atlas. */
export type FrameMessage =
  | { type: 'atlas-armarium:hello' }
  | ({ type: 'atlas-armarium:install' } & ArmariumRequest)
  /**
   * Share something of the vault in the Armarium: the page's Share, in Atlas. Without `what` (pages from before items)
   * it is a collection.
   */
  | { type: 'atlas-armarium:share'; what?: ShareWhat }
  /** The store's tags and what its filter holds, sent whenever either changes, once Atlas named `tags`. */
  | ({ type: 'atlas-armarium:tags' } & StoreTags)
  /** One of My uploads' requests, which Atlas sends with its account once it named `account` (`myUploadsRequests.ts`). */
  | { type: 'atlas-armarium:api'; id: string; request: PageRequest }
  /** Sign in to Atlas' account, from My uploads in Atlas' frame. */
  | { type: 'atlas-armarium:sign-in' };

/**
 * What Atlas does for the page beyond installing, named in its `installed` message so the page offers only that.
 * `share`: Atlas shares a collection; `share-items`: also a statblock template, game system or dice set (`what`).
 * `tags`: the asset manager's sidebar shows the store's tags and picks them (`toggle-tag`, `clear-tags`).
 * `account`: Atlas sends My uploads' requests with its account (`api`, answered by `api-result`), signs in when asked
 * (`sign-in`) and says when it signed in or out (`account`).
 */
export type ArmariumFeature = 'share' | 'share-items' | 'tags' | 'account';

/** What Atlas tells the Armarium page. */
export type AtlasMessage =
  | { type: 'atlas-armarium:installed'; format: typeof ARMARIUM_FORMAT; items: ArmariumRequest[]; features: ArmariumFeature[] }
  | ({ type: 'atlas-armarium:status'; format: typeof ARMARIUM_FORMAT; state: InstallState } & ArmariumRequest)
  /** The GM pressed a tag in the sidebar: the page picks or unpicks it by its own rules. */
  | { type: 'atlas-armarium:toggle-tag'; format: typeof ARMARIUM_FORMAT; tag: string }
  | { type: 'atlas-armarium:clear-tags'; format: typeof ARMARIUM_FORMAT }
  /** The answer to the page's request `id`: the API's status (0 where it could not be reached) and its JSON. */
  | { type: 'atlas-armarium:api-result'; format: typeof ARMARIUM_FORMAT; id: string; status: number; body: unknown }
  /** Atlas signed in or out: My uploads reads again. */
  | { type: 'atlas-armarium:account'; format: typeof ARMARIUM_FORMAT };

/**
 * The page's message, when it is one of the shapes the contract names in format 1. Fields beyond those are
 * ignored; anything else (another type or format, a uid that is no uid, a version that is no whole number) is null.
 */
export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!isRecord(data) || data.format !== ARMARIUM_FORMAT) return null;
  if (data.type === 'atlas-armarium:hello') return { type: 'atlas-armarium:hello' };
  if (data.type === 'atlas-armarium:share') {
    if (data.what === undefined) return { type: 'atlas-armarium:share' };
    // A kind of thing a later page shares and this Atlas does not know is not shared as something else.
    const what = SHARE_WHATS.find((known) => known === data.what);
    return what === undefined ? null : { type: 'atlas-armarium:share', what };
  }
  if (data.type === 'atlas-armarium:sign-in') return { type: 'atlas-armarium:sign-in' };
  if (data.type === 'atlas-armarium:api') {
    const read = readPageRequest(data);
    return read ? { type: 'atlas-armarium:api', ...read } : null;
  }
  if (data.type === 'atlas-armarium:tags') {
    const tags = readStoreTags(data);
    return tags ? { type: 'atlas-armarium:tags', ...tags } : null;
  }
  if (data.type !== 'atlas-armarium:install' || !isListingUid(data.uid) || !isReleaseVersion(data.version)) return null;
  return { type: 'atlas-armarium:install', uid: data.uid, version: data.version };
}

/** The parts of a `message` event the bridge judges it by. */
export interface ReceivedMessage {
  origin: string;
  source: unknown;
  data: unknown;
}

/**
 * The page's message when it came from the Armarium's origin and from this tab's own frame: any other page,
 * another frame of the same site and every other window are ignored, whatever they send.
 */
export function acceptFrameMessage(event: ReceivedMessage, frameWindow: Window | null | undefined): FrameMessage | null {
  if (!frameWindow || event.origin !== ARMARIUM_ORIGIN || event.source !== frameWindow) return null;
  return readFrameMessage(event.data);
}

export function installedMessage(items: readonly ArmariumRequest[], features: readonly ArmariumFeature[] = []): AtlasMessage {
  return { type: 'atlas-armarium:installed', format: ARMARIUM_FORMAT, items: items.map(({ uid, version }) => ({ uid, version })), features: [...features] };
}

export function statusMessage({ uid, version }: ArmariumRequest, state: InstallState): AtlasMessage {
  return { type: 'atlas-armarium:status', format: ARMARIUM_FORMAT, uid, version, state };
}

export function toggleTagMessage(tag: string): AtlasMessage {
  return { type: 'atlas-armarium:toggle-tag', format: ARMARIUM_FORMAT, tag };
}

export function apiResultMessage(id: string, { status, body }: { status: number; body: unknown }): AtlasMessage {
  return { type: 'atlas-armarium:api-result', format: ARMARIUM_FORMAT, id, status, body };
}

export function accountMessage(): AtlasMessage {
  return { type: 'atlas-armarium:account', format: ARMARIUM_FORMAT };
}

export function clearTagsMessage(): AtlasMessage {
  return { type: 'atlas-armarium:clear-tags', format: ARMARIUM_FORMAT };
}

/** Sends `message` to the frame's page, only while that page is on the Armarium's origin. */
export function postToFrame(frameWindow: Window | null | undefined, message: AtlasMessage): void {
  frameWindow?.postMessage(message, ARMARIUM_ORIGIN);
}
