import { afterAll, describe, expect, it, vi } from 'vitest';
import { DECODED_MAX_PIXELS, WEBP_MAX_SIDE } from '../decodeLimits';
import { imageHeader } from '../imageDimensions';
import { disposeImageProcessing, IMAGE_PRESETS, ImageTooLargeError, MAP_MAX_PIXELS, MAP_MAX_SIDE, optimizeImage, renderThumbnail } from '../imageProcessing';
import type { Size } from '../imageLayout';
import { grayJpeg } from './grayJpeg';


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

    expect(map.size).toEqual({ width: 23170, height: 11585 });
    expect(map.size.width * map.size.height).toBeLessThan(DECODED_MAX_PIXELS);
    expect(result.scaledDown).toBeUndefined();
    const lineY = map.size.height / 2;
    const darkest = Math.min(...[-1, 0, 1].map((dy) => map.luminanceAt(map.size.width / 2, lineY + dy)));
    expect(darkest).toBeLessThan(140);
    expect(map.luminanceAt(map.size.width / 2, lineY + 8)).toBeGreaterThan(240);
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
    // A canvas cannot paint a map wider than the side a map may have, so the limit is lowered for the test.
    const result = await optimizeImage(await png(40000, 400), { ...IMAGE_PRESETS.map, maxWidth: 32767 });

    expect(result.scaledDown).toEqual({ from: { width: 40000, height: 400 }, to: { width: 32767, height: 328 } });
    expect((await decoded(result.image)).size).toEqual({ width: 32767, height: 328 });
    expect(MAP_MAX_SIDE).toBe(65535);
  });

  it('keeps a PNG the browser cannot decode as it is and reads its thumbnail in bands', async () => {
    const upload = await png(16384, 16384);
    expect(16384 * 16384).toBe(DECODED_MAX_PIXELS);

    const result = await optimizeImage(upload, IMAGE_PRESETS.map, { thumbnail: { size: 256, quality: 0.8 } });

    expect(new Uint8Array(await result.image.arrayBuffer())).toEqual(new Uint8Array(await upload.arrayBuffer()));
    expect(result.scaledDown).toBeUndefined();
    const thumbnail = await decoded(result.thumbnail!);
    expect(thumbnail.size).toEqual({ width: 256, height: 256 });
    // The parchment colour the map was painted with, read through the band decoder's eighth.
    expect(thumbnail.luminanceAt(128, 128)).toBeCloseTo(0.299 * 0xe9 + 0.587 * 0xdc + 0.114 * 0xc0, -1);
  }, 120_000);

  it('makes a thumbnail of a PNG the browser cannot decode from the eighth, as the asset cards need', async () => {
    const upload = await png(16384, 16384);

    const thumbnail = await renderThumbnail(upload, { size: 256, quality: 0.8 });

    expect(await imageHeader(new Blob([thumbnail]))).toMatchObject({ format: 'webp', width: 256, height: 256 });
  }, 120_000);

  it('fits a map with more pixels than the band decoders take to 400 megapixels only where the browser can decode it', async () => {
    const result = await optimizeImage(await png(16000, 16000), IMAGE_PRESETS.map);

    expect((await decoded(result.image)).size).toEqual({ width: 16000, height: 16000 });
    expect(result.scaledDown).toBeUndefined();
  });

  it('writes a scaled picture wider than a WebP can be as PNG, keeping every pixel it has', async () => {
    const result = await optimizeImage(await png(20000, 90), { maxWidth: 18000, maxHeight: 18000, quality: 0.8 });

    expect(await imageHeader(result.image)).toMatchObject({ format: 'png', width: 18000, height: 81 });
    expect(result.scaledDown?.to).toEqual({ width: 18000, height: 81 });
    const result2 = await optimizeImage(await png(20000, 90), { maxWidth: WEBP_MAX_SIDE, maxHeight: WEBP_MAX_SIDE, quality: 0.8 });
    expect(await imageHeader(result2.image)).toMatchObject({ format: 'webp', width: WEBP_MAX_SIDE, height: 74 });
  });

  it('reports nothing for a map within the limit', async () => {
    const result = await optimizeImage(await png(4000, 40), IMAGE_PRESETS.map);

    expect(result.scaledDown).toBeUndefined();
    expect((await decoded(result.image)).size).toEqual({ width: 4000, height: 40 });
  });

  it('decodes a large JPEG at a smaller scale and fits it as a whole decode would', async () => {
    // 240 MP, wider than the side allowed here: decoded at 7/8 (35000 px), the smallest decode that covers the fit.
    const result = await optimizeImage(grayJpeg(40000, 6000), { ...IMAGE_PRESETS.map, maxWidth: 32767 });
    const map = await decoded(result.image);

    expect(map.size).toEqual({ width: 32767, height: 4915 });
    expect(result.scaledDown).toEqual({ from: { width: 40000, height: 6000 }, to: { width: 32767, height: 4915 } });
    expect((await imageHeader(result.image))?.format).toBe('png');
    expect(map.luminanceAt(16383, 2457)).toBeCloseTo(128, -1);
  });

  it('keeps a JPEG map the browser could decode byte for byte and reads it back', async () => {
    const upload = grayJpeg(16383, 16383);
    const result = await optimizeImage(upload, IMAGE_PRESETS.map, { thumbnail: { size: 256, quality: 0.8 } });

    // The worker hands the source back; a structured clone, so compare bytes.
    expect(new Uint8Array(await result.image.arrayBuffer())).toEqual(new Uint8Array(await upload.arrayBuffer()));
    expect(result.scaledDown).toBeUndefined();
    expect(await imageHeader(result.thumbnail!)).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('refuses an image past a gigapixel, naming its size', async () => {
    // Only the header is read: a PNG signature and an IHDR of 40000 × 30000.
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x9c, 0x40, 0, 0, 0x75, 0x30, 8, 6, 0, 0, 0]);
    const png = optimizeImage(new Blob([header], { type: 'image/png' }), IMAGE_PRESETS.map);
    await expect(png).rejects.toBeInstanceOf(ImageTooLargeError);
    await expect(png).rejects.toThrow(/40,000 × 30,000 px/);
    await expect(png).rejects.toThrow(/1,000 megapixels/);
    await expect(optimizeImage(grayJpeg(31623, 31624), IMAGE_PRESETS.map)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('reads a JPEG the browser cannot decode in bands: kept as it is, its thumbnail from the DC terms', async () => {
    const upload = grayJpeg(20000, 20000);
    const result = await optimizeImage(upload, IMAGE_PRESETS.map, { thumbnail: { size: 128, quality: 0.8 } });

    expect(result.image.size).toBe(upload.size);
    expect(result.scaledDown).toBeUndefined();
    const thumbnail = await decoded(result.thumbnail!);
    expect(thumbnail.size).toEqual({ width: 128, height: 128 });
    expect(thumbnail.luminanceAt(64, 64)).toBeCloseTo(128, -1);
  }, 120_000);
});
