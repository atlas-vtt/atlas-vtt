import { headerOf } from '../../imageProcessing/imageDimensions';
import { IMAGE_MIME_TYPES, MAX_PARTS, PART_BYTES, type GmMessage } from '../protocol/index.ts';

/** Bytes in base64, in slices small enough for `String.fromCharCode`. */
export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}

/**
 * A message as it goes out: itself while its JSON fits one frame, else in `part` messages of at
 * most `PART_BYTES` of its UTF-8 text each (a scene's walls may run to megabytes). None for a
 * message of more than `MAX_PARTS` parts, which no client puts together.
 */
export function messageParts(body: GmMessage, id: () => string): GmMessage[] {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  if (bytes.length <= PART_BYTES) return [body];
  const count = Math.ceil(bytes.length / PART_BYTES);
  if (count > MAX_PARTS) return [];
  const partId = id();
  return Array.from({ length: count }, (_, index) => ({
    t: 'part' as const, id: partId, index, count, data: toBase64(bytes.subarray(index * PART_BYTES, (index + 1) * PART_BYTES)),
  }));
}

/** SHA-256 of bytes, in lowercase hex. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MIME_TYPES: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

/** The image type a vault path names by its extension, or null for a type players cannot be sent. */
export function imageMimeType(path: string): string | null {
  return MIME_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));

/** The image type an image's bytes say it has, or null for bytes of a type players cannot be sent (or no image). */
export function imageMimeOfBytes(bytes: Uint8Array): string | null {
  if (ascii(bytes, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 12))) return 'image/avif';
  const format = headerOf(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength))?.format;
  const mime = format === undefined ? null : `image/${format}`;
  return mime !== null && IMAGE_MIME_TYPES.includes(mime) ? mime : null;
}
