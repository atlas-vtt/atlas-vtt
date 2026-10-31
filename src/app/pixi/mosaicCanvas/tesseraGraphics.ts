import type { PixelRect } from './pyramid';

/**
 * The image operations the tessera core needs, over the browser primitives it is
 * given: the worker's (or the main thread's) `createImageBitmap`
 * and `OffscreenCanvas`, or fakes in jsdom tests.
 */

/**
 * Lossless WebP (Chromium encodes exactly 1 losslessly): a tessera shows the map's own pixels.
 * Lossy WebP halves the resolution of colour, so thin coloured lines lost their colour; lossless
 * tesserae are 2.7 to 4 times larger and encode faster.
 */
export const TESSERA_QUALITY = 1;
const WEBP = 'image/webp';

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
  /** `ImageData` over RGBA bytes with straight alpha, `width * height * 4` of them. */
  createImageData: (data: Uint8ClampedArray, width: number, height: number) => ImageData;
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
  fromPixels(data: Uint8ClampedArray, width: number, height: number): Promise<ImageBitmap>;
  /** `source`'s rect encoded as a WebP tessera. */
  encodeTessera(source: ImageBitmap, rect: PixelRect): Promise<Blob>;
  compose(width: number, height: number, parts: readonly ComposedPart[]): ImageBitmap;
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

export function createTesseraGraphics(primitives: GraphicsPrimitives): TesseraGraphics {
  const { createImageBitmap: bitmapOf, createCanvas, createImageData } = primitives;
  return {
    decode: (blob) => bitmapOf(blob),
    resize: (source, width, height) => bitmapOf(source, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' }),
    crop: (source, rect) => bitmapOf(source, rect.x, rect.y, rect.width, rect.height),
    fromPixels: (data, width, height) => bitmapOf(createImageData(data, width, height)),
    async encodeTessera(source, rect) {
      const canvas = createCanvas(rect.width, rect.height);
      context(canvas).drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const blob = await canvas.convertToBlob({ type: WEBP, quality: TESSERA_QUALITY });
      if (blob.type !== WEBP) throw new Error('This system cannot encode WebP images.');
      return blob;
    },
    compose(width, height, parts) {
      const canvas = createCanvas(width, height);
      const ctx = context(canvas);
      for (const { source, from, to } of parts) {
        ctx.drawImage(source, from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height);
      }
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
    createImageData: (data, width, height) => new ImageData(data, width, height),
  };
}
