/** Bytes in lowercase hex. */
const hexOf = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The name an asset is stored under for players: `HMAC-SHA-256(key = salt, message = hash)`, where
 * the message is the content hash as written (64 lowercase hex characters, UTF-8). Only the GM's
 * Atlas knows the salt, so the id says nothing of the content and nobody can work it out from a file.
 */
export async function assetIdOf(salt: Uint8Array<ArrayBuffer>, hash: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hexOf(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(hash)));
}

/**
 * The ids of one salt, each worked out once: a scene names the same artwork again and again.
 * Never holds more than `limit` ids; the oldest go first.
 */
export class AssetIds {
  private readonly ids = new Map<string, Promise<string>>();

  constructor(private readonly salt: Uint8Array<ArrayBuffer>, private readonly limit = 4096) {}

  of(hash: string): Promise<string> {
    let id = this.ids.get(hash);
    if (id === undefined) {
      id = assetIdOf(this.salt, hash);
      this.ids.set(hash, id);
      if (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value as string);
    }
    return id;
  }

  /** Whether these ids are of `salt`. */
  isOf(salt: Uint8Array): boolean {
    return salt.length === this.salt.length && salt.every((byte, n) => byte === this.salt[n]);
  }
}
