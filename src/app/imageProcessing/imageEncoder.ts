import { WEBP_MAX_SIDE } from './decodeLimits';

/**
 * How every derived picture is encoded: scaled imports, thumbnails, covers, map tesserae. WebP
 * where this realm's canvases encode it; where they do not (every WebKit answers a request for
 * WebP with a PNG) lossless PNG, which holds the same pixels as the lossless WebP of a map or a
 * tessera and is only larger than the lossy WebP of a thumbnail or a cover. Never JPEG, which has
 * no alpha. Pure: runs in the image workers, the tessera worker and on the main thread, each of
 * which finds out for itself.
 */

export const WEBP = 'image/webp';
export const PNG = 'image/png';

/** The formats a derived picture is stored in, which are also the extensions of its file. */
export const DERIVED_FORMATS = ['webp', 'png'] as const;
export type DerivedFormat = (typeof DERIVED_FORMATS)[number];

export interface EncodableCanvas {
  readonly width: number;
  readonly height: number;
  convertToBlob(options?: ImageEncodeOptions): Promise<Blob>;
}

/** A canvas the format can be asked of: one with a context, since a canvas without one encodes nothing. */
export interface ProbeCanvas extends EncodableCanvas {
  getContext(contextId: '2d'): unknown;
}

export interface ImageEncoder {
  /**
   * `canvas` as WebP at `quality` (0–1; exactly 1 is lossless), or as PNG where this realm cannot
   * encode WebP or the picture is wider or taller than a WebP can be (`convertToBlob` would crop it
   * without a word). The blob's type says which it is.
   */
  encode: (canvas: EncodableCanvas, quality: number) => Promise<Blob>;
  /** The format `encode` gives a picture a WebP can hold, asked of a canvas of one pixel where nothing was encoded yet. */
  format: (createCanvas: (width: number, height: number) => ProbeCanvas) => Promise<DerivedFormat>;
}

async function encodePng(canvas: EncodableCanvas): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: PNG });
  if (blob.type !== PNG) throw new Error('This system cannot encode PNG images.');
  return blob;
}

/** An encoder that remembers what its first WebP request came back as, and asks for PNG directly from then on. */
export function createImageEncoder(): ImageEncoder {
  let encodesWebp: boolean | undefined;

  const encode = async (canvas: EncodableCanvas, quality: number): Promise<Blob> => {
    if (encodesWebp === false || canvas.width > WEBP_MAX_SIDE || canvas.height > WEBP_MAX_SIDE) return encodePng(canvas);
    const blob = await canvas.convertToBlob({ type: WEBP, quality });
    if (blob.type !== WEBP && blob.type !== PNG) throw new Error('This system cannot encode WebP or PNG images.');
    encodesWebp = blob.type === WEBP;
    return blob;
  };

  return {
    encode,
    format: async (createCanvas) => {
      if (encodesWebp === undefined) {
        const canvas = createCanvas(1, 1);
        canvas.getContext('2d');
        await encode(canvas, 1);
      }
      return encodesWebp ? 'webp' : 'png';
    },
  };
}

/** The encoder of this realm (a worker, or the main thread), which remembers what it learned of itself. */
export const realmImageEncoder: ImageEncoder = createImageEncoder();
export const encodeImage: ImageEncoder['encode'] = realmImageEncoder.encode;
export const derivedImageFormat: ImageEncoder['format'] = realmImageEncoder.format;
