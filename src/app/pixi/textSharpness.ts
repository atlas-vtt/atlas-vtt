/** A text's own size, before its scale: the pixels its picture has a side at resolution 1. */
export interface TextSize {
  width: number;
  height: number;
}

/** What the picture of one text may take: the longest side of its texture, and its pixels. */
export interface TextTextureLimits {
  maxSide: number;
  maxPixels: number;
}

/**
 * A text of ordinary size stays sharp up to the closest zoom on a screen with two pixels to the
 * point within these: 4096 px a side, and 32 MiB of texture for one text (4096 × 2048).
 */
export const TEXT_TEXTURE_LIMITS: TextTextureLimits = { maxSide: 4096, maxPixels: 4096 * 2048 };

/** The least resolution of a text whose texture fits the limits: what a picture needs that shows the map at its own size or smaller (a thumbnail), as for a text beside the screen. */
export const MIN_TEXT_RESOLUTION = 1;

/** Zooms that are a step but for a rounding error (2.0000000001) stay on it. */
const STEP_TOLERANCE = 1e-9;

/**
 * The step a text is drawn at where a screen shows `pixelsPerUnit` device pixels to each of its
 * units: the power of two at or above it. A zoom changes it once per doubling, and the picture
 * is never stretched and never shrunk to less than half.
 */
export function steppedResolution(pixelsPerUnit: number): number {
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= MIN_TEXT_RESOLUTION) return MIN_TEXT_RESOLUTION;
  return 2 ** Math.ceil(Math.log2(pixelsPerUnit) - STEP_TOLERANCE);
}

/**
 * The resolution to draw a text of `size` at so that it is sharp at `pixelsPerUnit` device pixels
 * to each of its units (zoom × the text's scale × the screen's pixels to a point): its step,
 * or the finest resolution whose texture stays within `limits`. PIXI gives a text a texture whose
 * sides are powers of two, and those are the sides held to the limits.
 */
export function textResolution(pixelsPerUnit: number, size: TextSize, limits: TextTextureLimits = TEXT_TEXTURE_LIMITS): number {
  const width = wholePixels(size.width);
  const height = wholePixels(size.height);
  const maxSide = powerOfTwoAtMost(limits.maxSide);
  let resolution = Math.min(steppedResolution(pixelsPerUnit), filling(maxSide, width), filling(maxSide, height));
  // Each pass halves one side of the texture.
  for (let pass = 0; pass < 64; pass++) {
    const sideX = textureSide(width, resolution);
    const sideY = textureSide(height, resolution);
    if (sideX * sideY <= limits.maxPixels || (sideX === 1 && sideY === 1)) break;
    resolution = Math.max(filling(sideX / 2, width), filling(sideY / 2, height));
  }
  return resolution;
}

/** The side of the texture PIXI takes for `length` units at `resolution`. */
export function textureSide(length: number, resolution: number): number {
  return powerOfTwoAtLeast(Math.ceil(wholePixels(length) * resolution));
}

/** The finest resolution at which `length` units still fit a texture `side` pixels long, with half a pixel to spare for rounding. */
function filling(side: number, length: number): number {
  return Math.max(0, side - 0.5) / length;
}

function wholePixels(length: number): number {
  return Number.isFinite(length) && length > 1 ? Math.ceil(length) : 1;
}

function powerOfTwoAtLeast(pixels: number): number {
  return pixels > 1 ? 2 ** Math.ceil(Math.log2(pixels)) : 1;
}

function powerOfTwoAtMost(pixels: number): number {
  return Number.isFinite(pixels) && pixels >= 1 ? 2 ** Math.floor(Math.log2(pixels)) : 1;
}
