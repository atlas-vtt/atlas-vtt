import { DECODER_MAX_SIDE, decodable } from '../../imageProcessing/decodeLimits';
import { imageHeader } from '../../imageProcessing/imageDimensions';
import { pyramidOf, type Pyramid } from './pyramid';
import type { TileGraphics } from './tileGraphics';
import type { OpenFailure } from './tileProtocol';

/**
 * Decoding a map's source and holding its pyramid levels while they are
 * needed (decisions 7, 8 and 10 of the tiled map images plan). Runs in the
 * tile worker; touches no DOM and no Obsidian.
 */

/** A failure to report for the open, once. */
export class OpenError extends Error {
  constructor(readonly failure: OpenFailure) {
    super(failure.kind === 'too-large' ? `The image is too large to decode (${failure.width} × ${failure.height}).` : failure.message);
  }
}

const BYTES_PER_PIXEL = 4;

/**
 * The decoded levels one map image may need, level 0 included: 2 GiB, a level 0 of 1.5 GiB
 * (about 402 megapixels, 20000 × 20000). A build holds them alone in the tile worker beside the
 * file's bytes and the decoder's buffers, and a map opened meanwhile is let in over the budget,
 * so a larger source risks the worker running out of memory. An import never comes near it
 * (at most 144 megapixels, 768 MiB of levels); only images placed in the vault outside Atlas do.
 */
export const MAX_DECODED_LEVELS_BYTES = 2 * 1024 ** 3;

/** The most pixels a source may have: a level 0 whose levels fit `MAX_DECODED_LEVELS_BYTES`. */
export const MAX_SOURCE_PIXELS = Math.floor((MAX_DECODED_LEVELS_BYTES * 3) / 4 / BYTES_PER_PIXEL);

/** Refuses a source of `size` when no browser decoder takes it or its levels would not fit `MAX_DECODED_LEVELS_BYTES`. */
export function checkDecodable(size: { width: number; height: number }): void {
  if (decodable(size) && size.width * size.height <= MAX_SOURCE_PIXELS) return;
  throw new OpenError({
    kind: 'too-large',
    width: size.width,
    height: size.height,
    maxSide: DECODER_MAX_SIDE,
    // Below the decoders' own limit (`DECODER_MAX_BYTES`), so it is the one to name.
    maxPixels: MAX_SOURCE_PIXELS,
  });
}

/**
 * The bytes a source's decoded levels will hold (level 0 plus a third for the
 * halvings), read from its header before any pixel is decoded; unknown sizes
 * (SVG, AVIF) are Infinity. Refuses a source no browser decoder takes (more
 * than `DECODER_MAX_BYTES` of pixels or a side over `DECODER_MAX_SIDE`;
 * WebCodecs refuses such a JPEG even at an eighth of its size) and one larger
 * than `MAX_DECODED_LEVELS_BYTES`.
 */
export async function decodedLevelsCost(blob: Blob): Promise<number> {
  const header = await imageHeader(blob);
  if (!header) return Infinity;
  checkDecodable(header);
  return decodedSizeCost(header.width, header.height);
}

/** The bytes the decoded levels of a `width` × `height` level 0 hold: it plus a third for the halvings. */
export function decodedSizeCost(width: number, height: number): number {
  return Math.ceil((width * height * BYTES_PER_PIXEL * 4) / 3);
}

export interface DecodedSource {
  pyramid: Pyramid;
  /** Level 0. */
  bitmap: ImageBitmap;
}

/**
 * Decodes `blob` once at full size; throws `OpenError` when it cannot be or is too large. The
 * pyramid takes the decoded bitmap's size, not the header's: decoding applies
 * the EXIF orientation, which can swap the sides.
 */
export async function decodeSource(blob: Blob, graphics: TileGraphics): Promise<DecodedSource> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await graphics.decode(blob);
  } catch (error) {
    throw new OpenError({ kind: 'decode-failed', message: error instanceof Error ? error.message : 'Could not decode the image.' });
  }
  try {
    // Sources whose header gave no size (SVG, AVIF) are measured here.
    checkDecodable(bitmap);
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return { pyramid: pyramidOf(bitmap.width, bitmap.height), bitmap };
}

/**
 * The decoded levels of one pyramid, each halved from the one before as soon
 * as it exists. A level is closed once it is released and no crop or encode
 * still reads it.
 */
export class DecodedLevels {
  private readonly bitmaps: Array<Promise<ImageBitmap>>;
  private readonly users: number[];
  private readonly released: boolean[];

  constructor(pyramid: Pyramid, base: ImageBitmap, graphics: TileGraphics) {
    const count = pyramid.levels.length;
    this.users = new Array<number>(count).fill(0);
    this.released = new Array<boolean>(count).fill(false);
    this.bitmaps = [Promise.resolve(base)];
    for (let index = 1; index < count; index++) {
      const { width, height } = pyramid.levels[index]!;
      this.bitmaps.push(this.use(index - 1, (finer) => graphics.resize(finer, width, height)).then((bitmap) => {
        if (!bitmap) throw new Error('A finer level was released before this one was made.');
        return bitmap;
      }));
    }
    // A level nobody asks for may fail unobserved; its readers see the error.
    for (const bitmap of this.bitmaps) bitmap.catch(() => undefined);
  }

  /** Whether `index` is still held, so a crop can serve it. */
  holds(index: number): boolean {
    return this.released[index] === false;
  }

  /** Every level made; rejects when one could not be. */
  async ready(): Promise<void> {
    await Promise.all(this.bitmaps);
  }

  /** Runs `read` on the level, or answers null once it is released. */
  async use<T>(index: number, read: (bitmap: ImageBitmap) => Promise<T>): Promise<T | null> {
    if (!this.holds(index)) return null;
    this.users[index]! += 1;
    try {
      return await read(await this.bitmaps[index]!);
    } finally {
      this.users[index]! -= 1;
      if (this.released[index]) this.closeUnused(index);
    }
  }

  release(index: number): void {
    if (this.released[index] !== false) return;
    this.released[index] = true;
    this.closeUnused(index);
  }

  releaseAll(): void {
    for (let index = 0; index < this.bitmaps.length; index++) this.release(index);
  }

  private closeUnused(index: number): void {
    if (this.users[index] !== 0) return;
    this.bitmaps[index]!.then((bitmap) => bitmap.close(), () => undefined);
  }
}
