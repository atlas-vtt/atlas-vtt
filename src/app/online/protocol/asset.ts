import { isRecord } from './shape.ts';

/** A SHA-256 in lowercase hex: how every asset is named. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Bytes of an asset per chunk: their base64 is exactly 256 KiB. */
export const ASSET_CHUNK_BYTES = 192 * 1024;
/** The largest asset the GM serves and a client accepts. */
export const MAX_ASSET_BYTES = 64 * 1024 * 1024;

/** Image types a map or a token's artwork may have. */
export const IMAGE_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
/** Video types an animated map may have: a page plays it in its poster's place. */
export const VIDEO_MIME_TYPES: readonly string[] = ['video/webm', 'video/mp4'];
/** The type of a text players are sent by hash (a quest's whole text): Markdown in UTF-8. */
export const TEXT_MIME_TYPE = 'text/markdown';

/** An asset the client fetches by hash. */
export interface AssetRef {
  readonly hash: string;
  readonly size: number;
  readonly mime: string;
}

export const isHash = (value: unknown): value is string => typeof value === 'string' && HASH_PATTERN.test(value);
export const isCount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

function parseRef(value: unknown, mimes: readonly string[]): AssetRef | null {
  if (!isRecord(value) || !isHash(value.hash) || !isCount(value.size, MAX_ASSET_BYTES)) return null;
  return typeof value.mime === 'string' && mimes.includes(value.mime) ? { hash: value.hash, size: value.size, mime: value.mime } : null;
}

/** An image's reference, or null for anything malformed or of a type players are not sent. */
export const parseAsset = (value: unknown): AssetRef | null => parseRef(value, IMAGE_MIME_TYPES);

/** A video's reference (`VIDEO_MIME_TYPES`), or null for anything malformed or of another type. */
export const parseVideoAsset = (value: unknown): AssetRef | null => parseRef(value, VIDEO_MIME_TYPES);

/** A text's reference (`TEXT_MIME_TYPE`), or null for anything malformed or of another type. */
export const parseTextAsset = (value: unknown): AssetRef | null => parseRef(value, [TEXT_MIME_TYPE]);

/** The sides a player may ask an image to be scaled down to. */
export const MIN_MAX_SIDE = 256;
export const MAX_MAX_SIDE = 16384;

export const isMaxSide = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= MIN_MAX_SIDE && value <= MAX_MAX_SIDE;

/**
 * The GM's answer to a request with a longest side for an image larger than that: `variant` is the
 * image `hash` scaled down to fit `maxSide`, sent by its own hash in the chunks that follow, and
 * `width` × `height` the image's own size, at which the page draws the copy.
 */
export interface AssetVariant {
  readonly t: 'asset-variant';
  readonly hash: string;
  readonly maxSide: number;
  readonly variant: AssetRef;
  readonly width: number;
  readonly height: number;
}

/** A side of an image in pixels, as a message may name it. */
export const isSide = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1 << 20;

export function parseAssetVariant(value: Record<string, unknown>): AssetVariant | null {
  const variant = parseAsset(value.variant);
  if (!isHash(value.hash) || !isMaxSide(value.maxSide) || variant === null || !isSide(value.width) || !isSide(value.height)) return null;
  return { t: 'asset-variant', hash: value.hash, maxSide: value.maxSide, variant, width: value.width, height: value.height };
}
