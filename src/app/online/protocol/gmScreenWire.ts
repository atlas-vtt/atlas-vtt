import { isRecord } from './shape.ts';

/**
 * What the GM's Atlas and a GM screen device send each other through the relay: the opening exchange of
 * a channel in the clear, then sealed frames only, which the relay passes on unread. What a sealed frame
 * holds is a `GmScreenMessage` or a `DeviceMessage` (`gmScreen.ts`).
 */

/**
 * The version of the GM screen's messages, apart from the table's `PROTOCOL_VERSION`: both ends' opening
 * values name it, and every frame is sealed under it. Changes are additive and keep it; a message of a type
 * an end does not know is ignored.
 */
export const GM_SCREEN_VERSION = 1;

/** Bytes GCM adds to every sealed message: its tag. */
export const SEAL_TAG_BYTES = 16;
/** Bytes of a channel's opening value. */
export const OPENING_BYTES = 16;

/**
 * The most UTF-8 bytes of JSON one message of a device may have: sealed, in base64, inside the `send`
 * frame a page sends, with the highest counter, it fits `MAX_PLAYER_FRAME` (4 KiB) whole.
 */
export const MAX_DEVICE_MESSAGE = 3000;
/**
 * The most UTF-8 bytes of JSON one message of Atlas may have. Sealed it goes in one frame up to
 * `PART_BYTES`, in `part` messages beyond, which a page puts together before it opens the seal.
 */
export const MAX_GM_SCREEN_MESSAGE = 1024 * 1024;
/** The highest counter a sealed frame may carry; a channel opens again long before. */
export const MAX_SEAL_COUNTER = Number.MAX_SAFE_INTEGER;

/** Base64 characters of a message of `bytes` UTF-8 bytes once it is sealed. */
export const sealedLength = (bytes: number): number => 4 * Math.ceil((bytes + SEAL_TAG_BYTES) / 3);

/**
 * A sealed message: `n` its counter, which only rises within one exchange and is the seal's nonce, and
 * `d` the sealed bytes (AES-256-GCM with its tag) in base64.
 */
export interface SealedFrame {
  readonly t: 'sealed';
  readonly n: number;
  readonly d: string;
}

/** Atlas opens a channel: its opening value (`OPENING_BYTES` in base64) under its version. */
export interface SealOpen {
  readonly t: 'seal-open';
  readonly v: number;
  readonly r: string;
}

/** A device answers an opening (`to`, the value it answers) with its own value; both make the keys. */
export interface SealAnswer {
  readonly t: 'seal-answer';
  readonly v: number;
  readonly to: string;
  readonly r: string;
}

/** A device asks Atlas to open its channel again: it holds no keys, or missed frames. */
export interface SealAsk {
  readonly t: 'seal-ask';
  readonly v: number;
}

/** What Atlas sends a device. Both are game messages (`GmMessage`), so `TableConnection` sends them, in parts where they are large. */
export type GmScreenWire = SealedFrame | SealOpen;
/** What a device sends Atlas. */
export type DeviceWire = SealedFrame | SealAnswer | SealAsk;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const OPENING = /^[A-Za-z0-9+/]{21}[AQgw]==$/;
const MAX_VERSION = 10_000;

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_VERSION;
export const isOpening = (value: unknown): value is string => typeof value === 'string' && OPENING.test(value);

function parseSealed(value: Record<string, unknown>, maxBytes: number): SealedFrame | null {
  const { n, d } = value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_SEAL_COUNTER) return null;
  if (typeof d !== 'string' || d.length < sealedLength(0) || d.length > sealedLength(maxBytes) || d.length % 4 !== 0 || !BASE64.test(d)) return null;
  return { t: 'sealed', n, d };
}

/** A body Atlas sent a device, as the device reads it; null for anything else. */
export function parseGmScreenWire(value: unknown): GmScreenWire | null {
  if (!isRecord(value)) return null;
  if (value.t === 'sealed') return parseSealed(value, MAX_GM_SCREEN_MESSAGE);
  if (value.t === 'seal-open') return isVersion(value.v) && isOpening(value.r) ? { t: 'seal-open', v: value.v, r: value.r } : null;
  return null;
}

/** A body a device sent, as Atlas reads it; null for anything else. */
export function parseDeviceWire(value: unknown): DeviceWire | null {
  if (!isRecord(value)) return null;
  switch (value.t) {
    case 'sealed':
      return parseSealed(value, MAX_DEVICE_MESSAGE);
    case 'seal-answer':
      return isVersion(value.v) && isOpening(value.to) && isOpening(value.r) ? { t: 'seal-answer', v: value.v, to: value.to, r: value.r } : null;
    case 'seal-ask':
      return isVersion(value.v) ? { t: 'seal-ask', v: value.v } : null;
    default:
      return null;
  }
}
