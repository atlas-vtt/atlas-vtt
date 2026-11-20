import { afterAll, describe, expect, it } from 'vitest';
import { disposeImageProcessing } from '../../src/app/imageProcessing/imageProcessing';
import { prepareSaveImage } from '../../src/app/packages/components/asset-manager/token-creator/prepareSaveImages';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';

/** A small subject surrounded by transparent padding, like token artwork imported from a sheet. */
async function paddedArt(width: number, height: number): Promise<File> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e8261c';
  context.fillRect(width * 0.375, height * 0.375, width * 0.25, height * 0.25);
  return new File([await canvas.convertToBlob({ type: 'image/png' })], 'padded-token.png', { type: 'image/png' });
}

interface ArtBounds {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** The opaque subject's bounds in output-frame units; transparent padding never counts. */
async function subjectBounds(image: Blob): Promise<ArtBounds> {
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3]! < 128) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  expect(right).toBeGreaterThan(left);
  expect(pixels[3]).toBe(0);
  return { width: (right - left + 1) / width, height: (bottom - top + 1) / height, centerX: (left + right + 1) / (2 * width), centerY: (top + bottom + 1) / (2 * height) };
}

describe('saving ringless token artwork with the real image workers', () => {
  afterAll(disposeImageProcessing);

  it.each([200, 400].flatMap(width => [200, 400].flatMap(height => [0.5, 2].map(scale => ({ width, height, scale })))))
    ('preserves transparent padding and scale for $width × $height art at $scale', async ({ width, height, scale }) => {
      const file = await paddedArt(width, height);
      const preview: TokenPreview = {
        id: 'token', name: 'Token', file, previewUrl: '', showRing: false,
        imageScale: scale, imagePosition: { x: 0.1, y: -0.1 }, isSelected: true, isOptimizing: false,
      };
      const saved = await prepareSaveImage(file, preview, { mode: 'token', waitForOptimized: async () => undefined });
      for (const image of [saved.image, saved.thumbnail!]) {
        const bounds = await subjectBounds(image);
        expect(bounds.width).toBeCloseTo(0.25 * scale * width / Math.max(width, height), 2);
        expect(bounds.height).toBeCloseTo(0.25 * scale * height / Math.max(width, height), 2);
        expect(bounds.centerX).toBeCloseTo(0.6, 2);
        expect(bounds.centerY).toBeCloseTo(0.4, 2);
      }
    });

  it('keeps the whole image and its original aspect ratio at default fit', async () => {
    const file = await paddedArt(200, 400);
    const preview: TokenPreview = {
      id: 'token', name: 'Token', file, previewUrl: '', showRing: false,
      imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
    };
    const saved = await prepareSaveImage(file, preview, { mode: 'token', waitForOptimized: async () => undefined });
    const bitmap = await createImageBitmap(saved.image);
    expect([bitmap.width, bitmap.height]).toEqual([200, 400]);
    bitmap.close();
    expect(await saved.image.arrayBuffer()).toEqual(await file.arrayBuffer());
  });
});
