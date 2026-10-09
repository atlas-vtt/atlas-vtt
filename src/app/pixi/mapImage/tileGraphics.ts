import type { PixelRect } from './pyramid';

/**
 * The image operations the tile core needs, over the browser primitives it is
 * given: the worker's (or the main thread's) `createImageBitmap`
 * and `OffscreenCanvas`, or fakes in jsdom tests.
 */

/**
 * Lossless WebP (Chromium encodes exactly 1 losslessly): a tile shows the map's own pixels.
 * Lossy WebP halves the resolution of colour, so thin coloured lines lost their colour; lossless
 * tiles are 2.7 to 4 times larger and encode faster.
 */
export const TILE_QUALITY = 1;
const WEBP = 'image/webp';

export interface CreateBitmap {
  (image: ImageBitmapSource, options?: ImageBitmapOptions): Promise<ImageBitmap>;
  (image: ImageBitmapSource, sx: number, sy: number, sw: number, sh: number, options?: ImageBitmapOptions): Promise<ImageBitmap>;
}

export interface TileContext {
  drawImage(image: ImageBitmap, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

export interface TileCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): TileContext | null;
  convertToBlob(options?: ImageEncodeOptions): Promise<Blob>;
  transferToImageBitmap(): ImageBitmap;
}

export interface GraphicsPrimitives {
  createImageBitmap: CreateBitmap;
  createCanvas: (width: number, height: number) => TileCanvas;
}

/** One piece of a composed picture: `source`'s rect `from` drawn into `to`. */
export interface ComposedPart {
  source: ImageBitmap;
  from: PixelRect;
  to: PixelRect;
}

export interface TileGraphics {
  decode(blob: Blob): Promise<ImageBitmap>;
  /** `source` resized; `medium`, since `high` has a known Chromium quality bug. */
  resize(source: ImageBitmap, width: number, height: number): Promise<ImageBitmap>;
  crop(source: ImageBitmap, rect: PixelRect): Promise<ImageBitmap>;
  /** `source`'s rect encoded as a WebP tile. */
  encodeTile(source: ImageBitmap, rect: PixelRect): Promise<Blob>;
  compose(width: number, height: number, parts: readonly ComposedPart[]): ImageBitmap;
}

function context(canvas: TileCanvas): TileContext {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface for a map tile.');
  return ctx;
}

export function createTileGraphics(primitives: GraphicsPrimitives): TileGraphics {
  const { createImageBitmap: bitmapOf, createCanvas } = primitives;
  return {
    decode: (blob) => bitmapOf(blob),
    resize: (source, width, height) => bitmapOf(source, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' }),
    crop: (source, rect) => bitmapOf(source, rect.x, rect.y, rect.width, rect.height),
    async encodeTile(source, rect) {
      const canvas = createCanvas(rect.width, rect.height);
      context(canvas).drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const blob = await canvas.convertToBlob({ type: WEBP, quality: TILE_QUALITY });
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
  };
}

/** The primitives of the global scope this runs in (`self`): a worker's, or the main thread's as the fallback. */
export function browserGraphicsPrimitives(): GraphicsPrimitives {
  return {
    createImageBitmap: createImageBitmap.bind(self),
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
  };
}
