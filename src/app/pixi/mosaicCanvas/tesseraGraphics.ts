import { drawingCanvas } from '../../imageProcessing/canvasLimit';
import { createImageEncoder, type DerivedFormat, type ImageEncoder } from '../../imageProcessing/imageEncoder';
import type { PixelRect } from './pyramid';

/**
 * The image operations the tessera core needs, over the browser primitives it is
 * given: the worker's (or the main thread's) `createImageBitmap`
 * and `OffscreenCanvas`, or fakes in jsdom tests.
 */

/**
 * Lossless WebP (Chromium encodes exactly 1 losslessly): a tessera shows the map's own pixels.
 * Lossy WebP halves the resolution of colour, so thin coloured lines lost their colour; lossless
 * tesserae are 2.7 to 4 times larger and encode faster. Where the platform cannot encode WebP a
 * tessera is a PNG, the same pixels (`imageEncoder.ts`).
 */
export const TESSERA_QUALITY = 1;
/** Side of the pieces a picture is read in where no single canvas of this device holds it. */
const PIECE_SIDE = 2048;

export interface CreateBitmap {
  (image: ImageBitmapSource, options?: ImageBitmapOptions): Promise<ImageBitmap>;
  (image: ImageBitmapSource, sx: number, sy: number, sw: number, sh: number, options?: ImageBitmapOptions): Promise<ImageBitmap>;
}

export interface TesseraContext {
  drawImage(image: ImageBitmap, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

export interface TesseraCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): TesseraContext | null;
  convertToBlob(options?: ImageEncodeOptions): Promise<Blob>;
  transferToImageBitmap(): ImageBitmap;
}

export interface GraphicsPrimitives {
  createImageBitmap: CreateBitmap;
  createCanvas: (width: number, height: number) => TesseraCanvas;
  /**
   * A canvas for a whole picture, or null where this device draws nothing on one that large
   * (`canvasLimit.ts`); `createCanvas` where unset. A tessera's canvas never is too large.
   */
  createPictureCanvas?: (width: number, height: number) => TesseraCanvas | null;
  /** `ImageData` over RGBA bytes with straight alpha, `width * height * 4` of them. */
  createImageData: (data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) => ImageData;
}

/** One piece of a composed picture: `source`'s rect `from` drawn into `to`. */
export interface ComposedPart {
  source: ImageBitmap;
  from: PixelRect;
  to: PixelRect;
}

export interface TesseraGraphics {
  decode(blob: Blob): Promise<ImageBitmap>;
  /** `source` resized; `medium`, since `high` has a known Chromium quality bug. */
  resize(source: ImageBitmap, width: number, height: number): Promise<ImageBitmap>;
  crop(source: ImageBitmap, rect: PixelRect): Promise<ImageBitmap>;
  /** A bitmap of decoded rows: RGBA with straight alpha, `width * height * 4` bytes. */
  fromPixels(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<ImageBitmap>;
  /** `source`'s rect encoded as a tessera: lossless WebP, or PNG where the platform cannot encode WebP. */
  encodeTessera(source: ImageBitmap, rect: PixelRect): Promise<Blob>;
  /** The format `encodeTessera` writes here, which a cached pyramid is of. */
  tesseraFormat(): Promise<DerivedFormat>;
  /** The parts drawn into one picture: on one canvas, or piece by piece where no canvas of this device holds it. */
  compose(width: number, height: number, parts: readonly ComposedPart[]): Promise<ImageBitmap>;
  /** One byte per pixel of `source`, row by row: 1 where its alpha is above `threshold` (of 255). */
  opaquePixels(source: ImageBitmap, threshold: number): Uint8Array;
  /** The alpha of each pixel of `source`, row by row. */
  alphaBytes(source: ImageBitmap): Uint8Array;
}

function context(canvas: TesseraCanvas): TesseraContext {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface for a map tessera.');
  return ctx;
}

function draw(ctx: TesseraContext, parts: readonly ComposedPart[], left: number, top: number): void {
  for (const { source, from, to } of parts) {
    ctx.drawImage(source, from.x, from.y, from.width, from.height, to.x - left, to.y - top, to.width, to.height);
  }
}

export function createTesseraGraphics(primitives: GraphicsPrimitives, encoder: ImageEncoder = createImageEncoder()): TesseraGraphics {
  const { createImageBitmap: bitmapOf, createCanvas, createImageData } = primitives;
  const createPictureCanvas = primitives.createPictureCanvas ?? createCanvas;

  /** The picture's RGBA read from canvases of `PIECE_SIDE`, each drawn with the parts that reach into it. */
  const composeInPieces = (width: number, height: number, parts: readonly ComposedPart[]): Promise<ImageBitmap> => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let top = 0; top < height; top += PIECE_SIDE) {
      for (let left = 0; left < width; left += PIECE_SIDE) {
        const pieceWidth = Math.min(PIECE_SIDE, width - left);
        const pieceHeight = Math.min(PIECE_SIDE, height - top);
        const canvas = createCanvas(pieceWidth, pieceHeight);
        const ctx = context(canvas);
        draw(ctx, parts, left, top);
        const { data } = ctx.getImageData(0, 0, pieceWidth, pieceHeight);
        for (let row = 0; row < pieceHeight; row++) {
          pixels.set(data.subarray(row * pieceWidth * 4, (row + 1) * pieceWidth * 4), ((top + row) * width + left) * 4);
        }
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return bitmapOf(createImageData(pixels, width, height));
  };

  return {
    decode: (blob) => bitmapOf(blob),
    resize: (source, width, height) => bitmapOf(source, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' }),
    crop: (source, rect) => bitmapOf(source, rect.x, rect.y, rect.width, rect.height),
    fromPixels: (data, width, height) => bitmapOf(createImageData(data, width, height)),
    async encodeTessera(source, rect) {
      const canvas = createCanvas(rect.width, rect.height);
      context(canvas).drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      return encoder.encode(canvas, TESSERA_QUALITY);
    },
    tesseraFormat: () => encoder.format(createCanvas),
    async compose(width, height, parts) {
      const canvas = createPictureCanvas(width, height);
      if (!canvas) return composeInPieces(width, height, parts);
      draw(context(canvas), parts, 0, 0);
      return canvas.transferToImageBitmap();
    },
    opaquePixels(source, threshold) {
      const alpha = this.alphaBytes(source);
      for (let i = 0; i < alpha.length; i++) alpha[i] = alpha[i]! > threshold ? 1 : 0;
      return alpha;
    },
    alphaBytes(source) {
      const { width, height } = source;
      const canvas = createCanvas(width, height);
      const ctx = context(canvas);
      ctx.drawImage(source, 0, 0, width, height, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const alpha = new Uint8Array(width * height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
      return alpha;
    },
  };
}

/** The primitives of the global scope this runs in (`self`): a worker's, or the main thread's as the fallback. */
export function browserGraphicsPrimitives(): GraphicsPrimitives {
  return {
    createImageBitmap: createImageBitmap.bind(self),
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
    createPictureCanvas: (width, height) => drawingCanvas({ width, height }),
    createImageData: (data, width, height) => new ImageData(data, width, height),
  };
}
