import { isRecord } from './shape.ts';

/**
 * The picture behind a device's screens: the played campaign's world map, cut by Atlas to the device's own screen, so
 * it shows sharp and whole there without the device holding the map. The device says its screen's size in device
 * pixels when its screens open and whenever that size changes (`backdrop-ask`); Atlas answers with the picture, and
 * sends it again whenever the played campaign or its world map changes (`backdrop`).
 */

/** The longest side of a screen a device may ask for, in device pixels. */
export const MAX_BACKDROP_SIDE = 4096;
/** The bytes a backdrop's picture may take: in base64 it fits one message of Atlas (`MAX_GM_SCREEN_MESSAGE`) with room to spare. */
export const MAX_BACKDROP_BYTES = 720 * 1024;
export const BACKDROP_MIME_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

/** A device's screen, in device pixels, which its backdrop is cut to. */
export interface BackdropAsk {
  readonly t: 'backdrop-ask';
  readonly width: number;
  readonly height: number;
}

export interface BackdropPicture {
  readonly mime: (typeof BACKDROP_MIME_TYPES)[number];
  /** The picture's bytes in base64. */
  readonly data: string;
}

/** The backdrop as Atlas cut it for the device; null where no campaign is played or its world map cannot be shown. */
export interface BackdropMessage {
  readonly t: 'backdrop';
  readonly picture: BackdropPicture | null;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const isSide = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BACKDROP_SIDE;
const isMime = (value: unknown): value is BackdropPicture['mime'] => typeof value === 'string' && (BACKDROP_MIME_TYPES as readonly string[]).includes(value);

export function parseBackdropAsk(value: Record<string, unknown>): BackdropAsk | null {
  return value.t === 'backdrop-ask' && isSide(value.width) && isSide(value.height) ? { t: 'backdrop-ask', width: value.width, height: value.height } : null;
}

export function parseBackdropMessage(value: Record<string, unknown>): BackdropMessage | null {
  if (value.t !== 'backdrop') return null;
  if (value.picture === null) return { t: 'backdrop', picture: null };
  const picture = value.picture;
  if (!isRecord(picture) || !isMime(picture.mime) || typeof picture.data !== 'string') return null;
  const { data } = picture;
  if (data.length === 0 || data.length > 4 * Math.ceil(MAX_BACKDROP_BYTES / 3) || data.length % 4 !== 0 || !BASE64.test(data)) return null;
  return { t: 'backdrop', picture: { mime: picture.mime, data } };
}
