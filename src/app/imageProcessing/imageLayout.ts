import { WEBP_MAX_SIDE } from './decodeLimits';
import type { FramePlacement, ImageLayout, ScaleDown, Size } from './imageJob';

export type { Size } from './imageJob';

export interface Rect extends Size {
  left: number;
  top: number;
}

/** Longer side a vector image is drawn at for a frame: enough pixels for any crop the frame shows. */
const VECTOR_FRAME_SOURCE = 2048;

/** `size` times `scale` in whole pixels, never less than one a side. */
function scaled(size: Size, scale: number): Size {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

type FitLayout = Extract<ImageLayout, { kind: 'fit' }>;

/** The largest scale, at most 1, that fits `size` within the bounds; `maxPixels` limits its area. */
function fitScale(size: Size, maxWidth: number, maxHeight: number, maxPixels = Infinity): number {
  return Math.min(1, maxWidth / size.width, maxHeight / size.height, Math.sqrt(maxPixels / (size.width * size.height)));
}

/**
 * `size` scaled down to fit within the bounds and `maxPixels` in all, keeping
 * its aspect ratio; never scaled up. Sides are rounded, unless that would take
 * the area over `maxPixels`.
 */
export function fitWithin(size: Size, maxWidth: number, maxHeight: number, maxPixels = Infinity): Size {
  const scale = fitScale(size, maxWidth, maxHeight, maxPixels);
  const rounded = scaled(size, scale);
  if (rounded.width * rounded.height <= maxPixels) return rounded;
  return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) };
}

/** What a fit layout makes of `size`, never wider or taller than a WebP can be encoded. */
export function fitSize(size: Size, layout: FitLayout): Size {
  return fitWithin(size, Math.min(layout.maxWidth, WEBP_MAX_SIDE), Math.min(layout.maxHeight, WEBP_MAX_SIDE), layout.maxPixels);
}

/** What a fit took from `source`, or undefined when `output` keeps every pixel. */
export function scaleDown(layout: ImageLayout, source: Size, output: Size): ScaleDown | undefined {
  if (layout.kind !== 'fit' || (output.width >= source.width && output.height >= source.height)) return undefined;
  return { from: { width: source.width, height: source.height }, to: { width: output.width, height: output.height } };
}

/**
 * Pixels a vector image (SVG) is drawn at. It has none of its own, so a fit
 * fills its bounds: a map drawn smaller could never be sharpened again.
 */
export function vectorRasterSize(natural: Size, layout: ImageLayout): Size {
  if (layout.kind === 'fit') {
    const fill = Math.min(layout.maxWidth / natural.width, layout.maxHeight / natural.height);
    return fitSize(scaled(natural, fill), layout);
  }
  return scaled(natural, VECTOR_FRAME_SOURCE / Math.max(natural.width, natural.height));
}

/** Pixel size of a square frame: as many pixels as the source has across it, clamped to the bounds. */
export function frameSize(source: Size, placement: FramePlacement, minSize: number, maxSize: number): number {
  const sourcePixels = Math.round(source.width / placement.width);
  return Math.min(maxSize, WEBP_MAX_SIDE, Math.max(minSize, sourcePixels));
}

/** Where the image is drawn in a square frame of `frame` pixels. */
export function frameImageRect(source: Size, placement: FramePlacement, frame: number): Rect {
  const width = placement.width * frame;
  const height = width * (source.height / source.width);
  return {
    left: placement.centerX * frame - width / 2,
    top: placement.centerY * frame - height / 2,
    width,
    height,
  };
}
