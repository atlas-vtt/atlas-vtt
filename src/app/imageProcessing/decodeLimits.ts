import type { Size } from './imageLayout';

/**
 * What Chromium can decode and encode, read from its source, confirmed in the
 * browser tests and measured in Chrome 156 and Electron 43 (Chromium 150) on
 * 2026-10-30. Pure: shared by the main thread and the image workers.
 */

/**
 * Pixels an image must stay below to be decoded at all. From Chromium 156 an image of this many
 * pixels (1 GiB of RGBA) ends the renderer process, not the promise, in every decoder
 * (`createImageBitmap`, `<img>`, WebCodecs), also when asked for a scaled-down JPEG; Chromium 150
 * still decoded 484 megapixels. Obsidian's installers move on to newer Electrons, so nothing may
 * try.
 */
export const DECODED_MAX_PIXELS = 2 ** 28;
/** Longest side any decoder or canvas takes. */
export const DECODER_MAX_SIDE = 65535;
/**
 * The most pixels an image read in bands may have (`band/`): a baseline JPEG or a non-interlaced
 * PNG past `DECODED_MAX_PIXELS` is tiled from rows by Atlas' own decoders, which hold no whole
 * picture, so the bound is time and the tiles, not memory: a gigapixel is about 5,300 tiles,
 * some 1.3 GB of them, and under a minute of decoding on a current machine. Online, what a plan
 * takes of it is the store's rule.
 */
export const BAND_MAX_PIXELS = 1_000_000_000;
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
  return size.width <= DECODER_MAX_SIDE && size.height <= DECODER_MAX_SIDE && size.width * size.height < DECODED_MAX_PIXELS;
}

/** Formats the band decoders read. */
export const BAND_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png']);

/**
 * Whether an image the browser cannot decode (`decodable` false) can be read in bands instead:
 * by its header alone; the decoder may still refuse it (progressive, interlaced, turned).
 */
export function bandDecodable(header: Size & { format: string }): boolean {
  return !decodable(header) && BAND_FORMATS.has(header.format)
    && header.width <= DECODER_MAX_SIDE && header.height <= DECODER_MAX_SIDE && header.width * header.height <= BAND_MAX_PIXELS;
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
