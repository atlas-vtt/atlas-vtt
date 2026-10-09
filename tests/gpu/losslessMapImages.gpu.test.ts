import { afterAll, describe, expect, it } from 'vitest';
import { imageHeader } from '../../src/app/imageProcessing/imageDimensions';
import { IMAGE_PRESETS, disposeImageProcessing, optimizeImage } from '../../src/app/imageProcessing/imageProcessing';
import { browserGraphicsPrimitives, createTileGraphics } from '../../src/app/pixi/mapImage/tileGraphics';

/**
 * Map images reach the table without lossy compression: an upload that fits is kept as it is,
 * one that must be scaled down is written as lossless WebP, and so is every tile of the cache.
 * Only a real encoder can tell, so this runs in the browser.
 */

/** A map with what lossy WebP spoils: one-pixel lines of saturated colour. */
function drawMap(width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2eb9b8';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e8261c';
  for (let x = 5; x < width; x += 37) ctx.fillRect(x, 0, 1, height);
  return canvas;
}

const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());
/** The bitstream of a WebP file: `VP8L` is lossless, `VP8 ` lossy (after `VP8X` and `ALPH` where the image has alpha). */
async function webpBitstream(blob: Blob): Promise<string | null> {
  const bytes = await bytesOf(blob);
  const view = new DataView(bytes.buffer);
  for (let at = 12; at + 8 <= bytes.length;) {
    const chunk = new TextDecoder().decode(bytes.slice(at, at + 4));
    if (chunk === 'VP8L' || chunk === 'VP8 ') return chunk;
    const size = view.getUint32(at + 4, true);
    at += 8 + size + (size % 2);
  }
  return null;
}

async function pixels(image: Blob | ImageBitmap, width: number, height: number): Promise<Uint8ClampedArray> {
  const bitmap = image instanceof Blob ? await createImageBitmap(image) : image;
  const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

afterAll(() => disposeImageProcessing());

describe('map images without lossy compression', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('keeps a %s map that fits byte for byte', async (type) => {
    const upload = await drawMap(1200, 800).convertToBlob({ type, quality: 0.9 });

    const { image, scaledDown } = await optimizeImage(upload, IMAGE_PRESETS.map);

    expect(await bytesOf(image)).toEqual(await bytesOf(upload));
    expect(scaledDown).toBeUndefined();
  });

  it('re-encodes a GIF map, which is not kept', async () => {
    const upload = new Blob([Uint8Array.from(atob('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='), c => c.charCodeAt(0))], { type: 'image/gif' });

    const { image } = await optimizeImage(upload, IMAGE_PRESETS.map);

    expect((await imageHeader(image))?.format).toBe('webp');
  });

  it('writes a map it must scale down as lossless WebP', async () => {
    const upload = await drawMap(16500, 64).convertToBlob({ type: 'image/png' });

    const { image, scaledDown } = await optimizeImage(upload, IMAGE_PRESETS.map);

    expect(scaledDown).toBeDefined();
    expect(await imageHeader(image)).toMatchObject({ format: 'webp', width: 16383 });
    expect(await webpBitstream(image)).toBe('VP8L');
  });

  it('encodes cache tiles losslessly: a tile decodes to the very pixels it was cut from', async () => {
    const graphics = createTileGraphics(browserGraphicsPrimitives());
    const source = await createImageBitmap(drawMap(1024, 1024));
    const rect = { x: 509, y: 0, width: 512, height: 512 };

    const tile = await graphics.encodeTile(source, rect);

    expect(await webpBitstream(tile)).toBe('VP8L');
    const cut = await createImageBitmap(source, rect.x, rect.y, rect.width, rect.height);
    expect(await pixels(tile, 512, 512)).toEqual(await pixels(cut, 512, 512));
  });
});
