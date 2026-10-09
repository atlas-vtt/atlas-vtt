import { afterAll, describe, expect, it, vi } from 'vitest';
import { WEBP_MAX_SIDE } from '../decodeLimits';
import { disposeImageProcessing, IMAGE_PRESETS, ImageTooLargeError, optimizeImage } from '../imageProcessing';
import type { Size } from '../imageLayout';
import { grayJpeg } from './grayJpeg';

const MAP_SIDE = IMAGE_PRESETS.map.maxWidth;

/** The pixels of an encoded image, as the map loader decodes it. */
async function decoded(image: Blob): Promise<{ size: Size; luminanceAt: (x: number, y: number) => number }> {
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    size: { width: canvas.width, height: canvas.height },
    luminanceAt: (x, y) => {
      const [r = 0, g = 0, b = 0] = context.getImageData(x, y, 1, 1).data;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    },
  };
}

async function png(width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e9dcc0';
  context.fillRect(0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/png' });
}

describe('importing maps with the real workers', () => {
  afterAll(disposeImageProcessing);

  it('draws an SVG map at map size, whatever size its file states', async () => {
    // A line one twentieth of a unit wide: two pixels at map size, a quarter of one at 2048 px.
    const svg = new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">',
      '<rect width="400" height="200" fill="#fff"/><path d="M0 100h400" stroke="#000" stroke-width="0.05"/></svg>',
    ], { type: 'image/svg+xml' });

    const result = await optimizeImage(svg, IMAGE_PRESETS.map);
    const map = await decoded(result.image);

    expect(map.size).toEqual({ width: MAP_SIDE, height: 8192 });
    expect(result.scaledDown).toBeUndefined();
    const lineY = map.size.height / 2;
    const darkest = Math.min(...[-1, 0, 1].map((dy) => map.luminanceAt(MAP_SIDE / 2, lineY + dy)));
    expect(darkest).toBeLessThan(140);
    expect(map.luminanceAt(MAP_SIDE / 2, lineY + 8)).toBeGreaterThan(240);
  });

  it('rasterizes vectors one at a time, each only once the one before is converted', async () => {
    const svg = (): Blob => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>'], { type: 'image/svg+xml' });
    // Workers have their own OffscreenCanvas, so the spy counts the main thread's rasters only.
    const raster = vi.spyOn(OffscreenCanvas.prototype, 'transferToImageBitmap');
    const rastersWhenConverted: number[] = [];

    await Promise.all([0, 1, 2].map(async () => {
      await optimizeImage(svg(), IMAGE_PRESETS.token);
      rastersWhenConverted.push(raster.mock.calls.length);
    }));
    raster.mockRestore();

    expect(rastersWhenConverted).toEqual([1, 2, 3]);
  });

  it('fits a map wider than the limit to its side and reports what it lost', async () => {
    const result = await optimizeImage(await png(20000, 9000), IMAGE_PRESETS.map);

    expect(result.scaledDown).toEqual({ from: { width: 20000, height: 9000 }, to: { width: MAP_SIDE, height: 7372 } });
    expect((await decoded(result.image)).size).toEqual({ width: MAP_SIDE, height: 7372 });
  });

  it('fits a map with more pixels than the limit to 144 megapixels', async () => {
    const result = await optimizeImage(await png(13000, 13000), IMAGE_PRESETS.map);
    const { size } = await decoded(result.image);

    expect(size).toEqual({ width: 12000, height: 12000 });
    expect(size.width * size.height).toBeLessThanOrEqual(144_000_000);
    expect(result.scaledDown?.from).toEqual({ width: 13000, height: 13000 });
  });

  it('never encodes a WebP side over 16383, whatever the bounds allow', async () => {
    const result = await optimizeImage(await png(20000, 90), { maxWidth: 30000, maxHeight: 30000, quality: 0.8 });

    expect((await decoded(result.image)).size).toEqual({ width: WEBP_MAX_SIDE, height: 74 });
    expect(result.scaledDown?.to).toEqual({ width: WEBP_MAX_SIDE, height: 74 });
  });

  it('reports nothing for a map within the limit', async () => {
    const result = await optimizeImage(await png(4000, 40), IMAGE_PRESETS.map);

    expect(result.scaledDown).toBeUndefined();
    expect((await decoded(result.image)).size).toEqual({ width: 4000, height: 40 });
  });

  it('decodes a large JPEG at a smaller scale and fits it as a whole decode would', async () => {
    const result = await optimizeImage(grayJpeg(20000, 9000), IMAGE_PRESETS.map);
    const map = await decoded(result.image);

    expect(map.size).toEqual({ width: MAP_SIDE, height: 7372 });
    expect(result.scaledDown).toEqual({ from: { width: 20000, height: 9000 }, to: { width: MAP_SIDE, height: 7372 } });
    expect(map.luminanceAt(MAP_SIDE / 2, 3686)).toBeCloseTo(128, -1);
  });

  it('refuses an image larger than the browser decodes, naming its size', async () => {
    // Only the header is read: a PNG signature and an IHDR of 30000 × 30000.
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x75, 0x30, 0, 0, 0x75, 0x30, 8, 6, 0, 0, 0]);
    const png = optimizeImage(new Blob([header], { type: 'image/png' }), IMAGE_PRESETS.map);
    await expect(png).rejects.toBeInstanceOf(ImageTooLargeError);
    await expect(png).rejects.toThrow(/30,000 × 30,000 px/);
    // DCT scaling does not help: the decoder refuses the source's size, not the size it is asked for.
    await expect(optimizeImage(grayJpeg(23171, 23171), IMAGE_PRESETS.map)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
