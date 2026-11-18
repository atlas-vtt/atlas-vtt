import { isRecord } from '../utils/guards';
import { ARMARIUM_FORMAT, ARMARIUM_ORIGIN } from './armariumUrls';
import { isListingUid, isReleaseVersion, type ArmariumRequest } from './armariumRequest';

/** Where an install stands, as the Armarium page is told. */
export type InstallState = 'downloading' | 'reviewing' | 'installed' | 'cancelled' | 'failed';

/** What the Armarium page may ask of Atlas. */
export type FrameMessage =
  | { type: 'atlas-armarium:hello' }
  | ({ type: 'atlas-armarium:install' } & ArmariumRequest)
  /** Share a collection of the vault in the Armarium: the page's Share a collection, in Atlas. */
  | { type: 'atlas-armarium:share' };

/** What Atlas does for the page beyond installing, named in its `installed` message so the page offers only that. */
export type ArmariumFeature = 'share';

/** What Atlas tells the Armarium page. */
export type AtlasMessage =
  | { type: 'atlas-armarium:installed'; format: typeof ARMARIUM_FORMAT; items: ArmariumRequest[]; features: ArmariumFeature[] }
  | ({ type: 'atlas-armarium:status'; format: typeof ARMARIUM_FORMAT; state: InstallState } & ArmariumRequest);

/**
 * The page's message, when it is one of the shapes the contract names in format 1. Fields beyond those are
 * ignored; anything else (another type or format, a uid that is no uid, a version that is no whole number) is null.
 */
export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!isRecord(data) || data.format !== ARMARIUM_FORMAT) return null;
  if (data.type === 'atlas-armarium:hello') return { type: 'atlas-armarium:hello' };
  if (data.type === 'atlas-armarium:share') return { type: 'atlas-armarium:share' };
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

/** Sends `message` to the frame's page, only while that page is on the Armarium's origin. */
export function postToFrame(frameWindow: Window | null | undefined, message: AtlasMessage): void {
  frameWindow?.postMessage(message, ARMARIUM_ORIGIN);
}
