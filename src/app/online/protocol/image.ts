import { isSide, parseAsset, type AssetRef } from './asset.ts';
import { isRecord } from './shape.ts';

/** A showing's id: made by the GM, 96 random bits in hex. */
export const SHOWING_ID_PATTERN = /^[0-9a-f]{24}$/;

/**
 * An image the GM shows every player over the map: the image by hash, fetched like the map, and its
 * own size in pixels. It never names its file. Every showing has an id of its own, so a page tells
 * one its player closed from the same image shown again.
 */
export interface ShownImage {
  readonly id: string;
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
}

/** The image shown to the players now; null once the GM took it away. It belongs to the table, not to a scene. */
export interface ImageMessage {
  readonly t: 'shown-image';
  readonly shown: ShownImage | null;
}

/** A showing, or null for anything malformed or of a type players are not sent. */
export function parseShownImage(value: unknown): ShownImage | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !SHOWING_ID_PATTERN.test(value.id) || !isSide(value.width) || !isSide(value.height)) return null;
  const image = parseAsset(value.image);
  return image === null ? null : { id: value.id, image, width: value.width, height: value.height };
}

export function parseImageMessage(value: Record<string, unknown>): ImageMessage | null {
  if (value.shown === null) return { t: 'shown-image', shown: null };
  const shown = parseShownImage(value.shown);
  return shown === null ? null : { t: 'shown-image', shown };
}
