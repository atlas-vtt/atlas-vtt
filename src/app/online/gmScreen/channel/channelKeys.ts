import { GM_SCREEN_VERSION, LINK_KEY_PATTERN, OPENING_BYTES } from '../../protocol/index.ts';
import { fromBase64Url, toBase64Url } from '../../../utils/base64';

/**
 * All of the cryptography of a GM screen's channels. The link's key (32 random bytes) never seals
 * anything itself: every channel's opening exchange gives two fresh values, and HKDF-SHA-256 makes one
 * AES-256-GCM key per direction from the link's key and both values (the salt), labelled with the
 * version and the direction (the info). A counter is therefore never used twice under one key, whatever
 * either end remembers. A frame's nonce is four zero bytes and its counter in eight (NIST SP 800-38D's
 * deterministic construction); its associated data is the label. The check number comes from the link's
 * key and the relay's id for a knock.
 */

/** What the channel needs of the platform's cryptography: handed in, never read from a global. */
export interface ChannelCrypto {
  readonly subtle: SubtleCrypto;
  /** `bytes` random bytes from the cryptographic source. */
  random(bytes: number): Uint8Array<ArrayBuffer>;
}

/** Which way a key seals: Atlas to a device, or a device to Atlas. */
export type Direction = 'gm' | 'device';

/** Bytes of a link's key. */
export const LINK_KEY_BYTES = 32;

const encoder = new TextEncoder();

/** The label every key, check number and sealed frame of this version is bound to. */
const label = (what: string): Uint8Array<ArrayBuffer> => encoder.encode(`atlas gm-screen ${GM_SCREEN_VERSION} ${what}`);

/** The platform's cryptography as the channel takes it. */
export const channelCryptoOf = (crypto: Crypto): ChannelCrypto => ({ subtle: crypto.subtle, random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)) });

/** A new link key: 32 random bytes as the link writes them. */
export const newLinkKey = (crypto: ChannelCrypto): string => toBase64Url(crypto.random(LINK_KEY_BYTES));

/** A new opening value for one exchange. */
export const newOpening = (crypto: ChannelCrypto): Uint8Array<ArrayBuffer> => crypto.random(OPENING_BYTES);

/** The link's key as the keys are made from; null for text that is no link key. Never extractable. */
export async function linkKey(crypto: ChannelCrypto, text: string): Promise<CryptoKey | null> {
  if (!LINK_KEY_PATTERN.test(text)) return null;
  return crypto.subtle.importKey('raw', fromBase64Url(text), 'HKDF', false, ['deriveKey', 'deriveBits']);
}

/**
 * The key one direction of one exchange is sealed with: from the link's key, Atlas's opening value and
 * the device's, in that order. Usable only for what that end does with it.
 */
export function directionKey(crypto: ChannelCrypto, link: CryptoKey, gmOpening: Uint8Array, deviceOpening: Uint8Array, direction: Direction, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const salt = new Uint8Array(gmOpening.length + deviceOpening.length);
  salt.set(gmOpening);
  salt.set(deviceOpening, gmOpening.length);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: label(direction) }, link, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/**
 * The four digits a device shows while it waits for the GM's answer, and Atlas shows in the Allow
 * prompt: from the link's key and the relay's id for that knock, which the relay picks after the device
 * said hello. Someone else who holds the link knocks with another id, so their number differs from the
 * GM's own device's but by chance (one in ten thousand), and they cannot choose it.
 */
export async function checkNumber(crypto: ChannelCrypto, link: CryptoKey, knock: string): Promise<string> {
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: label(`check ${knock}`) }, link, 32);
  return String(new DataView(bits).getUint32(0) % 10_000).padStart(4, '0');
}

function nonce(counter: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, Math.floor(counter / 2 ** 32));
  view.setUint32(8, counter >>> 0);
  return bytes;
}

/** Bytes of associated data a sealed frame carries: what a key's budget counts beside the message. */
export const labelBytes = (direction: Direction): number => label(direction).length;

/** `bytes` sealed under `key` as the frame numbered `counter` of `direction`: the ciphertext with its tag. */
export async function sealBytes(crypto: ChannelCrypto, key: CryptoKey, direction: Direction, counter: number, bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce(counter), additionalData: label(direction), tagLength: 128 }, key, bytes));
}

/** The bytes a sealed frame holds; throws where its seal does not open under `key` with that counter and direction. */
export async function openBytes(crypto: ChannelCrypto, key: CryptoKey, direction: Direction, counter: number, sealed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce(counter), additionalData: label(direction), tagLength: 128 }, key, sealed));
}
