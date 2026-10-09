import type { Size } from './imageLayout';

/**
 * What Chromium can decode and encode, read from its source and confirmed in
 * the browser tests. Pure: shared by the main thread and the image workers.
 */

/** Every Blink image decoder refuses an image whose 8-bit RGBA pixels would take more bytes than this. */
export const DECODER_MAX_BYTES = 2 ** 31 - 1;
/** Longest side any decoder or canvas takes. */
export const DECODER_MAX_SIDE = 65535;
/** `convertToBlob` silently crops a WebP's sides to this. */
export const WEBP_MAX_SIDE = 16383;

/** DCT scaling decodes a JPEG at n eighths of its size. */
const JPEG_SCALE_STEPS = 8;

/**
 * Whether the browser can decode an image of `size` at all. The limit holds
 * for the source whatever size it is decoded at: `ImageDecoder` refuses an
 * oversized JPEG even when asked for an eighth of it.
 */
export function decodable(size: Size): boolean {
  return size.width <= DECODER_MAX_SIDE && size.height <= DECODER_MAX_SIDE && size.width * size.height * 4 <= DECODER_MAX_BYTES;
}

/** The size `ImageDecoder` decodes a JPEG at for `eighths` / 8: each side rounded up, the only sizes it accepts. */
export function jpegScaledSize(source: Size, eighths: number): Size {
  return {
    width: Math.ceil((source.width * eighths) / JPEG_SCALE_STEPS),
    height: Math.ceil((source.height * eighths) / JPEG_SCALE_STEPS),
  };
}

/**
 * The smallest size a JPEG can be decoded at that still has at least `target`'s
 * pixels on each side, or null when only its full size has. Decoding there
 * instead of at full size spares most of the memory of a large map.
 */
export function scaledJpegDecodeSize(source: Size, target: Size): Size | null {
  for (let eighths = 1; eighths < JPEG_SCALE_STEPS; eighths++) {
    const size = jpegScaledSize(source, eighths);
    if (size.width >= target.width && size.height >= target.height) return size;
  }
  return null;
}
