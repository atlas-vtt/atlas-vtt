import { DECODER_MAX_BYTES, DECODER_MAX_SIDE, decodable } from '../../imageProcessing/decodeLimits';
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
 * The bytes a source's decoded levels will hold (level 0 plus a third for the
 * halvings), read from its header before any pixel is decoded; unknown sizes
 * (SVG, AVIF) cost the whole budget. Refuses a source no browser decoder takes
 * (more than `DECODER_MAX_BYTES` of pixels or a side over `DECODER_MAX_SIDE`;
 * WebCodecs refuses such a JPEG even at an eighth of its size).
 */
export async function decodedLevelsCost(blob: Blob): Promise<number> {
  const header = await imageHeader(blob);
  if (!header) return Infinity;
  if (!decodable(header)) {
    throw new OpenError({
      kind: 'too-large',
      width: header.width,
      height: header.height,
      maxSide: DECODER_MAX_SIDE,
      maxPixels: Math.floor(DECODER_MAX_BYTES / BYTES_PER_PIXEL),
    });
  }
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
 * Decodes `blob` once at full size; throws `OpenError` when it cannot be. The
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
