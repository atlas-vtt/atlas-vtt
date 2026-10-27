import { afterAll, describe, expect, it } from 'vitest';
import { imageHeader } from '../../src/app/imageProcessing/imageDimensions';
import { IMAGE_PRESETS, disposeImageProcessing, optimizeBitmap } from '../../src/app/imageProcessing/imageProcessing';
import { THUMBNAIL_SPEC } from '../../src/app/services/AssetThumbnailService';

/** A picture drawn off the main thread goes to the image workers as a bitmap, with no PNG between. */

afterAll(() => { disposeImageProcessing(); });

function drawing(width: number, height: number): ImageBitmap {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#2a1d12';
  ctx.fillRect(100, 100, 400, 300);
  return canvas.transferToImageBitmap();
}

async function pixelAt(blob: Blob, x: number, y: number): Promise<number[]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return [...ctx.getImageData(x, y, 1, 1).data];
}

describe('encoding a bitmap as a map stores it', () => {
  it('encodes a bitmap that fits as it is: a WebP of its size and pixels, with a thumbnail', async () => {
    const result = await optimizeBitmap(drawing(1200, 800), { ...IMAGE_PRESETS.map, quality: 0.85 }, { thumbnail: THUMBNAIL_SPEC });

    expect(await imageHeader(result.image)).toMatchObject({ format: 'webp', width: 1200, height: 800 });
    expect(result.scaledDown).toBeUndefined();
    const ink = await pixelAt(result.image, 300, 250);
    const paper = await pixelAt(result.image, 800, 600);
    expect(Math.max(...ink.slice(0, 3))).toBeLessThan(60);
    expect(Math.min(...paper.slice(0, 3))).toBeGreaterThan(170);
    expect(result.thumbnail && (await imageHeader(result.thumbnail))?.format).toBe('webp');
  });

  it('scales a bitmap down to the preset, as an upload would be', async () => {
    const result = await optimizeBitmap(drawing(1200, 800), { maxWidth: 600, maxHeight: 600, quality: 0.85 });

    expect(await imageHeader(result.image)).toMatchObject({ format: 'webp', width: 600, height: 400 });
    expect(result.scaledDown).toEqual({ from: { width: 1200, height: 800 }, to: { width: 600, height: 400 } });
  });
});
