/**
 * Decoding an image in bands of rows, for images the browser's decoders would die on (2^28 pixels
 * or more, `DECODED_MAX_PIXELS`): a baseline JPEG or a non-interlaced PNG is read in rows and handed
 * on a band at a time, so no whole picture ever exists in memory. Pure: no DOM, no Obsidian, so the
 * tile worker and the image workers share it.
 */

/** Rows `y` to `y + rows` of the image as 8-bit RGBA with straight (not premultiplied) alpha, `width * rows * 4` bytes. */
export interface Band {
  readonly y: number;
  readonly rows: number;
  readonly width: number;
  /** Reused for the next band once the sink's promise settles: copy what must be kept. */
  readonly data: Uint8ClampedArray;
}

export interface BandDecodeOptions {
  /** 1 decodes every pixel; 8 one pixel per 8 × 8 block (a JPEG's DC term, a PNG's block average): `ceil(width / 8)` × `ceil(height / 8)`. */
  readonly reduce: 1 | 8;
  /** Called for each band in order, top to bottom; the next band is decoded once its promise settles. */
  readonly onBand: (band: Band) => void | Promise<void>;
  readonly signal?: AbortSignal | undefined;
}

/** What the header says of an image the band decoders read; `width` and `height` are the stored size. */
export interface BandImageInfo {
  readonly width: number;
  readonly height: number;
  /** Whether any pixel can be transparent (a PNG with alpha or tRNS; never a JPEG). */
  readonly hasAlpha: boolean;
}

export type BandUnsupportedReason =
  /** A progressive JPEG: its rows exist only once every scan is read. */
  | 'progressive'
  /** An interlaced PNG (Adam7): the same. */
  | 'interlaced'
  /** A baseline JPEG whose components come in separate scans. */
  | 'scans'
  /** Arithmetic coding, 12-bit samples, lossless or hierarchical JPEG. */
  | 'coding'
  /** CMYK or another component layout the decoder does not read. */
  | 'components'
  /** A JPEG whose EXIF orientation turns or mirrors it: the stored rows are not the shown rows. */
  | 'orientation'
  /** Not a file of this format, or truncated. */
  | 'corrupt';

/** The image cannot be read in bands; `reason` says why, for a message that tells the GM what to export instead. */
export class BandUnsupportedError extends Error {
  constructor(readonly reason: BandUnsupportedReason, message: string) {
    super(message);
    this.name = 'BandUnsupportedError';
  }
}

/** A decoder of one format: `inspect` reads the header and refuses what it cannot stream; `decode` streams the bands. */
export interface BandDecoder {
  inspect(bytes: Uint8Array): BandImageInfo;
  decode(bytes: Uint8Array, options: BandDecodeOptions): Promise<void>;
}

/** The size a reduced decode gives: each side divided by `reduce`, rounded up, as a pyramid's third level is. */
export function reducedSize(info: Pick<BandImageInfo, 'width' | 'height'>, reduce: 1 | 8): { width: number; height: number } {
  return { width: Math.ceil(info.width / reduce), height: Math.ceil(info.height / reduce) };
}
