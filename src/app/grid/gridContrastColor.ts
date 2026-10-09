import type { Sprite } from 'pixi.js';
import { grayFromCanvasSource, grayFromSprite } from '../pixi/gridDetection/grayImage';
import type { GrayImage } from '../pixi/gridDetection/grayImage';

const BLACK = 0x000000;
const WHITE = 0xffffff;
/** Longest side of the image sampled for brightness; the mean needs no detail. */
const SAMPLE_SIDE = 64;
/** Mean luminance (0–255) above which a map counts as bright. */
const BRIGHT_MAP_THRESHOLD = 128;

/** Black lines for a bright image, white lines for a dark one. */
export function contrastColorForGray(image: GrayImage): number {
  // ponytail: plain mean; switch to the median if maps with large black borders pick the wrong colour
  let sum = 0;
  for (const value of image.data) sum += value;
  return sum / image.data.length > BRIGHT_MAP_THRESHOLD ? BLACK : WHITE;
}

/** The automatic grid colour for a map, or null while its texture is not readable yet. */
export function contrastColorForSprite(sprite: Sprite): number | null {
  const image = grayFromSprite(sprite, SAMPLE_SIDE);
  return image ? contrastColorForGray(image) : null;
}

/** Where a map's pixels are read from: the whole image fit within `maxSide`, or null without one (`MapImage`). */
export interface MapPixels {
  overview(maxSide: number): Promise<ImageBitmap | null>;
}

/** The automatic grid colour for a map, from a small overview of it; null when it has no pixels to read. */
export async function contrastColorForPixels(pixels: MapPixels): Promise<number | null> {
  let bitmap: ImageBitmap | null;
  try {
    bitmap = await pixels.overview(SAMPLE_SIDE);
  } catch (error) {
    console.debug('[Atlas] The map image could not be read for the grid colour:', error);
    return null;
  }
  if (!bitmap) return null;
  try {
    const image = grayFromCanvasSource(bitmap, bitmap.width, bitmap.height, SAMPLE_SIDE);
    return image ? contrastColorForGray(image) : null;
  } finally {
    bitmap.close();
  }
}

/** The store keeps the grid colour as a hex string, the GridSystem as a number; unset stays unset (automatic). */
export function parseGridColor(color: string | undefined): number | undefined {
  return color ? parseInt(color.replace('#', '0x')) : undefined;
}
