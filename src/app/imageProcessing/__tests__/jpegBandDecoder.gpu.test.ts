import { describe, expect, it } from 'vitest';
import { reducedSize } from '../band/bandTypes';
import { jpegBandDecoder } from '../band/jpegBandDecoder';

const FIXTURES = ['baseline-420.jpg', 'baseline-422.jpg', 'baseline-444.jpg', 'baseline-420-restart.jpg', 'baseline-gray.jpg', 'baseline-420-tall.jpg', 'baseline-exif-upright.jpg'];

async function fixture(name: string): Promise<Uint8Array> {
  const response = await fetch(`/tests/fixtures/images/${name}`);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The browser's own decode of `bytes`, as RGBA. */
async function browserPixels(bytes: Uint8Array): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

async function bandPixels(bytes: Uint8Array, reduce: 1 | 8): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const { width, height } = reducedSize(jpegBandDecoder.inspect(bytes), reduce);
  const data = new Uint8ClampedArray(width * height * 4);
  await jpegBandDecoder.decode(bytes, { reduce, onBand: (band) => data.set(band.data, band.y * width * 4) });
  return { width, height, data };
}

/** The browser's decode averaged over each 8 × 8 block (the part of it inside the image at the edges). */
function boxAveraged(image: { width: number; height: number; data: Uint8ClampedArray }): Float64Array {
  const { width, height } = reducedSize(image, 8);
  const out = new Float64Array(width * height * 4);
  for (let by = 0; by < height; by++) {
    for (let bx = 0; bx < width; bx++) {
      const sums = [0, 0, 0, 0];
      let count = 0;
      for (let y = by * 8; y < Math.min(by * 8 + 8, image.height); y++) {
        for (let x = bx * 8; x < Math.min(bx * 8 + 8, image.width); x++) {
          for (let c = 0; c < 4; c++) sums[c]! += image.data[(y * image.width + x) * 4 + c]!;
          count++;
        }
      }
      for (let c = 0; c < 4; c++) out[(by * width + bx) * 4 + c] = sums[c]! / count;
    }
  }
  return out;
}

/** The largest and the mean per-channel difference over R, G and B. */
function difference(a: ArrayLike<number>, b: ArrayLike<number>): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue;
    const d = Math.abs(a[i]! - b[i]!);
    max = Math.max(max, d);
    sum += d;
    count++;
  }
  return { max, mean: sum / count };
}

describe('jpegBandDecoder against Chromium', () => {
  it.each(FIXTURES)('decodes %s as Chromium does', async (name) => {
    const bytes = await fixture(name);
    const ours = await bandPixels(bytes, 1);
    const browser = await browserPixels(bytes);
    expect({ width: ours.width, height: ours.height }).toEqual({ width: browser.width, height: browser.height });
    const { max, mean } = difference(ours.data, browser.data);
    console.info(`${name}: max ${max}, mean ${mean.toFixed(4)}`);
    expect(mean).toBeLessThan(1);
    expect(max).toBeLessThanOrEqual(6);
  });

  it.each(FIXTURES)('decodes %s at 1/8 close to the block means of Chromium\'s decode', async (name) => {
    const bytes = await fixture(name);
    const ours = await bandPixels(bytes, 8);
    const means = boxAveraged(await browserPixels(bytes));
    const { max, mean } = difference(ours.data, means);
    console.info(`${name} at 1/8: max ${max.toFixed(2)}, mean ${mean.toFixed(4)}`);
    expect(mean).toBeLessThan(4);
  });
});
