/**
 * Messages between the main thread and the image workers. Everything here is
 * structured-cloneable: Blobs are passed by reference, ImageBitmaps are
 * transferred.
 */

/**
 * Where an image sits in a square output frame, in frame units (1 = frame
 * width), origin at the frame's top-left. The height follows from the image's
 * aspect ratio, which only the worker knows once it has decoded the image.
 */
export interface Size {
  width: number;
  height: number;
}

export interface FramePlacement {
  centerX: number;
  centerY: number;
  width: number;
}

export type ImageLayout =
  /** The whole image, scaled down (never up) to fit within the bounds and, if set, `maxPixels` in all. */
  | { kind: 'fit'; maxWidth: number; maxHeight: number; maxPixels?: number | undefined }
  /**
   * A square frame showing the image at `placement`; areas the image does not
   * cover stay transparent. The frame gets as many pixels as the source has
   * across it, clamped to `minSize`..`maxSize`.
   */
  | { kind: 'frame'; placement: FramePlacement; minSize: number; maxSize: number };

/** A smaller copy of the result. */
export interface ThumbnailSpec {
  /** Longer side in pixels; smaller images are not scaled up. */
  size: number;
  quality: number;
}

export interface ImageJob {
  /** Encoded image bytes, or a bitmap the main thread decoded for formats workers cannot read (SVG). */
  source: Blob | ImageBitmap;
  layout: ImageLayout;
  /** WebP quality, 0–1. */
  quality: number;
  /** Also render a thumbnail of the result, sparing a second decode later. */
  thumbnail?: ThumbnailSpec | undefined;
  /** Also render a copy to show on screen while the result is too large to display cheaply. */
  preview?: ThumbnailSpec | undefined;
  /** Also render a copy of the whole source, e.g. for a crop editor next to a cropped result. */
  sourcePreview?: ThumbnailSpec | undefined;
  /**
   * Decode a JPEG source at `decoded`, one of the sizes DCT scaling gives
   * (`jpegScaledSize`), instead of at its natural size `source`. The output is
   * sized as if the source had been decoded whole.
   */
  scaledDecode?: { source: Size; decoded: Size } | undefined;
}

/** Pixel sizes of a source and of the smaller image a fit made of it. */
export interface ScaleDown {
  from: Size;
  to: Size;
}

export interface ImageJobResult {
  /** WebP bytes. A WebP source that needs no scaling is returned as it is, avoiding a lossy re-encode. */
  image: Blob;
  thumbnail: Blob | null;
  preview: Blob | null;
  sourcePreview: Blob | null;
  /** Set when the source had more pixels than its bounds allow and lost them. */
  scaledDown?: ScaleDown | undefined;
}

export interface ImageJobRequest {
  id: number;
  job: ImageJob;
}

export type ImageJobResponse =
  | { id: number; ok: true; result: ImageJobResult }
  /** `decodeFailed` means the worker could not read the source format; the main thread may decode it instead. */
  | { id: number; ok: false; message: string; decodeFailed: boolean };
