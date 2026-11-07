import { isRecord } from './shape.ts';

/** A SHA-256 in lowercase hex: how every asset is named. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;


/**
 * A stored asset's name on the asset host, 64 lowercase hex characters: `HMAC-SHA-256(gmSalt, hash)`,
 * made by the GM's Atlas, unguessable, and the capability to read the object for as long as it lives.
 */
export const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/;
/** The largest object the asset store holds under one id (a tile pyramid as a whole, a video): a gigapixel map's lossless tiles with room for noisy art. */
export const MAX_STORED_BYTES = 4 * 1024 ** 3;
/** What one stored asset of each kind may hold at most; the store's offer refuses more. */
export const ASSET_CAPS = {
  image: 95 * 1024 * 1024,
  tiles: MAX_STORED_BYTES,
  video: 500 * 1024 * 1024,
  audio: 256 * 1024 * 1024,
  /** A long sound stored in segments (`s/<id>/manifest.json` and `s/<id>/<n>.ogg`): no larger than a whole copy may be. */
  segments: 256 * 1024 * 1024,
  text: 1024 * 1024,
  book: 64 * 1024 * 1024,
} as const;
export type AssetKind = keyof typeof ASSET_CAPS;
export const isAssetKind = (value: unknown): value is AssetKind => typeof value === 'string' && Object.hasOwn(ASSET_CAPS, value);

/** Image types a map or a token's artwork may have. */
export const IMAGE_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
/** Video types an animated map may have: a page plays it in its poster's place. */
export const VIDEO_MIME_TYPES: readonly string[] = ['video/webm', 'video/mp4'];
/** The one type a sound is stored as: Ogg Opus, as the GM's Atlas converts it. */
export const AUDIO_MIME_TYPE = 'audio/ogg';
/** The type of a text players are sent by hash (a quest's whole text): Markdown in UTF-8. */
export const TEXT_MIME_TYPE = 'text/markdown';

/**
 * An asset as players are sent it: the page fetches it from the asset host under `id` once the GM's
 * progress says it is there, and checks it against `hash` (a whole object's SHA-256; a pyramid's is
 * its image's).
 */
export interface AssetRef {
  readonly hash: string;
  readonly size: number;
  readonly mime: string;
  readonly id: string;
  /** The stored object is the map's tile pyramid (`t/<id>/manifest.json` and its tiles), not one image. */
  readonly tiles?: true;
  /**
   * The stored object is a long sound in segments (`s/<id>/manifest.json`, then `s/<id>/<n>.ogg`), going up in
   * order while it may still be made: a page fetches segment n once `parts` says more than n are stored.
   */
  readonly segments?: true;
}

/** The most segments one sound has: six hours of 30-second segments, with room. */
export const MAX_SEGMENTS = 1024;

export const isHash = (value: unknown): value is string => typeof value === 'string' && HASH_PATTERN.test(value);
export const isAssetId = (value: unknown): value is string => typeof value === 'string' && ASSET_ID_PATTERN.test(value);
export const isCount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

function parseRef(value: unknown, mimes: readonly string[]): AssetRef | null {
  if (!isRecord(value) || !isHash(value.hash) || !isAssetId(value.id) || !isCount(value.size, MAX_STORED_BYTES)) return null;
  if (typeof value.mime !== 'string' || !mimes.includes(value.mime)) return null;
  if (value.tiles !== undefined && value.tiles !== true) return null;
  if (value.segments !== undefined && value.segments !== true) return null;
  return { hash: value.hash, size: value.size, mime: value.mime, id: value.id, ...(value.tiles === true ? { tiles: true as const } : {}), ...(value.segments === true ? { segments: true as const } : {}) };
}

/** An image's reference, or null for anything malformed or of a type players are not sent. */
export const parseAsset = (value: unknown): AssetRef | null => parseRef(value, IMAGE_MIME_TYPES);

/** A video's reference (`VIDEO_MIME_TYPES`), or null for anything malformed or of another type. */
export const parseVideoAsset = (value: unknown): AssetRef | null => parseRef(value, VIDEO_MIME_TYPES);

/** A text's reference (`TEXT_MIME_TYPE`), or null for anything malformed or of another type. */
export const parseTextAsset = (value: unknown): AssetRef | null => parseRef(value, [TEXT_MIME_TYPE]);

/** A sound's reference (`AUDIO_MIME_TYPE`), or null for anything malformed or of another type. */
export const parseAudioAsset = (value: unknown): AssetRef | null => parseRef(value, [AUDIO_MIME_TYPE]);

/** A side of an image in pixels, as a message may name it. */
export const isSide = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1 << 20;

/** The most assets one progress message names. */
export const MAX_PROGRESS_ENTRIES = 2000;

/**
 * How far the GM's uploads to the asset store have come, by id: 0 to 1, where 1 means the object
 * can be fetched (a pyramid's share counts its tiles, the overview level first). The GM sends it
 * paced while anything is on its way, and once more with 1 when it is done, so a page never asks the
 * host for an object before it is there.
 */
export interface AssetProgress {
  readonly t: 'asset-progress';
  readonly shares: Readonly<Record<string, number>>;
  /** Of a sound in segments: how many, from the first, are stored. */
  readonly parts?: Readonly<Record<string, number>>;
}

export function parseAssetProgress(value: Record<string, unknown>): AssetProgress | null {
  if (!isRecord(value.shares)) return null;
  const entries = Object.entries(value.shares);
  if (entries.length > MAX_PROGRESS_ENTRIES) return null;
  const shares: Record<string, number> = {};
  for (const [id, share] of entries) {
    if (!isAssetId(id) || typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) return null;
    shares[id] = share;
  }
  // Parts only say more of what a share says: anything malformed there is left out, never a reason to drop the shares.
  const parts: Record<string, number> = {};
  if (isRecord(value.parts)) {
    for (const [id, count] of Object.entries(value.parts).slice(0, MAX_PROGRESS_ENTRIES)) if (isAssetId(id) && isCount(count, MAX_SEGMENTS)) parts[id] = count;
  }
  return { t: 'asset-progress', shares, ...(Object.keys(parts).length > 0 && { parts }) };
}
