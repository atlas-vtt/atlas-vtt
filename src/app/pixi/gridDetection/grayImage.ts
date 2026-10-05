import { getDomHost } from '../../host/dom';
/**
 * Single-channel float images used by grid auto-detection.
 */

import type { Sprite } from 'pixi.js';

export interface GrayImage {
  width: number;
  height: number;
  /** Row-major luminance, 0–255. */
  data: Float32Array;
}

/** Draws any canvas-compatible source into a canvas no larger than `maxSide` and reads its luminance. */
export function grayFromCanvasSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSide: number,
): GrayImage | null {
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = getDomHost().createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);

  const { data: rgba } = ctx.getImageData(0, 0, width, height);
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const o = i * 4;
    data[i] = 0.299 * rgba[o]! + 0.587 * rgba[o + 1]! + 0.114 * rgba[o + 2]!;
  }
  return { width, height, data };
}

/** The part of a PIXI texture source detection reads; its `resource` is untyped upstream. */
interface TexturePixels {
  resource?: CanvasImageSource;
  pixelWidth: number;
  pixelHeight: number;
}

/** Luminance of a sprite's texture image, or null while the texture has no readable pixels. */
export function grayFromSprite(sprite: Sprite, maxSide: number): GrayImage | null {
  if (sprite.destroyed) return null;
  const source: TexturePixels | undefined = sprite.texture?.source;
  const resource = source?.resource;
  if (!source || !resource) return null;
  return grayFromCanvasSource(resource, source.pixelWidth, source.pixelHeight, maxSide);
}

/** Box-filter downsample by an integer factor. */
export function downsampleGray(image: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return image;
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Float32Array(width * height);
  const norm = 1 / (factor * factor);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * image.width + x * factor;
        for (let dx = 0; dx < factor; dx++) sum += image.data[row + dx]!;
      }
      data[y * width + x] = sum * norm;
    }
  }
  return { width, height, data };
}

/**
 * Thin-line evidence: how much each pixel differs from the mean of its four
 * neighbours at distance `d`. Lines of either polarity light up; smooth areas do not.
 */
export function localContrast(image: GrayImage, d: number): GrayImage {
  const { width, height, data } = image;
  const out = new Float32Array(width * height);
  for (let y = d; y < height - d; y++) {
    for (let x = d; x < width - d; x++) {
      const i = y * width + x;
      const around = (data[i - d]! + data[i + d]! + data[i - d * width]! + data[i + d * width]!) / 4;
      out[i] = Math.abs(data[i]! - around);
    }
  }
  return { width, height, data: out };
}

export function sampleBilinear(image: GrayImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= image.width || y0 + 1 >= image.height) return 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * image.width + x0;
  const top = image.data[i]! * (1 - fx) + image.data[i + 1]! * fx;
  const bottom = image.data[i + image.width]! * (1 - fx) + image.data[i + image.width + 1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Places the image centred in an n×n square, mean-subtracted and tapered with a
 * Hann window over the content area so the FFT sees no hard borders.
 */
export function toWindowedSquare(image: GrayImage, n: number): Float32Array {
  const out = new Float32Array(n * n);
  const width = Math.min(image.width, n);
  const height = Math.min(image.height, n);
  const offsetX = Math.floor((n - width) / 2);
  const offsetY = Math.floor((n - height) / 2);

  let mean = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) mean += image.data[y * image.width + x]!;
  }
  mean /= width * height;

  for (let y = 0; y < height; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * (y + 0.5)) / height);
    for (let x = 0; x < width; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / width);
      out[(y + offsetY) * n + x + offsetX] = (image.data[y * image.width + x]! - mean) * wx * wy;
    }
  }
  return out;
}
