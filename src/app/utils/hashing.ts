/**
 * Content hashes and the key-sorted JSON behind them.
 *
 * Their results are stored in vault files and device caches (bundle
 * manifests, install records, library file stamps, derived collection uids,
 * copy ids, thumbnail names) or must match between windows (dice throws), so
 * changing any output is a data change. `hashText` and `fnv1a32` are not
 * cryptographic: they only tell contents apart, never prove them.
 */

/**
 * SHA-256 of `data` through Web Crypto, as lowercase hex: the fingerprint
 * bundles and install records compare content by.
 */
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * JSON whose object keys are ordered: array-index keys (canonical decimal
 * integers from 0 to 2^32 − 2) come first in ascending order, as JavaScript
 * orders them; all other keys follow, sorted by UTF-16 code units (so `01`,
 * `-1`, `1.5` and `4294967295` sort as strings). Equal values always give
 * equal text, and stored fingerprints depend on this exact text. Not RFC 8785.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/** Fingerprint of a JSON value by content, independent of key order: the SHA-256 hex of its `canonicalJson`. */
export function hashJson(value: unknown): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalJson(value)));
}

/**
 * A 53-bit hash of `text` (cyrb53) in base 36, not cryptographic, enough to
 * tell file contents apart: stamps library files and makes derived collection
 * uids and copy ids.
 */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * 32-bit FNV-1a over the UTF-16 code units of `text`, unsigned, not
 * cryptographic: the same text always gives the same number. Names
 * thumbnails and seeds dice throws.
 */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
