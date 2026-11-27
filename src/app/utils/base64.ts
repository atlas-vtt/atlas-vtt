/** Bytes in base64, in slices small enough for `String.fromCharCode`. */
export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}

/** The bytes of base64 text; throws on text that is no base64. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** Bytes in base64url without padding, for text that goes into an address. */
export const toBase64Url = (bytes: Uint8Array): string => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The bytes of base64url text with or without padding; throws on text that is none. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='));
}
