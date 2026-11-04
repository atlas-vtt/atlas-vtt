import { describe, expect, it, vi } from 'vitest';
import { jpegScaledSize } from '../decodeLimits';
import { renderImageJob } from '../imageRenderer';
import { grayJpeg } from './grayJpeg';

/** The size `ImageDecoder` decodes `jpeg` at when asked for `desired`, or the error it raises. */
async function decodedSize(jpeg: Blob, desired: { width: number; height: number }): Promise<string> {
  const decoder = new ImageDecoder({ data: jpeg.stream(), type: 'image/jpeg', desiredWidth: desired.width, desiredHeight: desired.height });
  try {
    const { image } = await decoder.decode();
    const size = `${image.displayWidth} × ${image.displayHeight}`;
    image.close();
    return size;
  } catch (error) {
    return error instanceof Error ? error.name : 'error';
  } finally {
    decoder.close();
  }
}

describe('decoding a JPEG at a smaller scale', () => {
  it('gives exactly the eighth steps jpegScaledSize computes', async () => {
    const jpeg = grayJpeg(1001, 999);
    for (let eighths = 1; eighths <= 8; eighths++) {
      const size = jpegScaledSize({ width: 1001, height: 999 }, eighths);
      expect(await decodedSize(jpeg, size)).toBe(`${size.width} × ${size.height}`);
    }
  });

  it('cannot open a JPEG the decoder refuses, at any scale', async () => {
    const jpeg = grayJpeg(23171, 23171);
    expect(await decodedSize(jpeg, jpegScaledSize({ width: 23171, height: 23171 }, 1))).toBe('EncodingError');
    expect(await decodedSize(grayJpeg(23170, 23170), jpegScaledSize({ width: 23170, height: 23170 }, 1))).toBe('2897 × 2897');
  });

  it('sizes the output from the natural source, not from the scaled decode', async () => {
    const source = { width: 4000, height: 3000 };
    const result = await renderImageJob({
      source: grayJpeg(source.width, source.height),
      layout: { kind: 'fit', maxWidth: 1000, maxHeight: 1000 },
      quality: 0.8,
      scaledDecode: { source, decoded: jpegScaledSize(source, 2) },
    });
    const bitmap = await createImageBitmap(result.image);

    expect([bitmap.width, bitmap.height]).toEqual([1000, 750]);
    expect(result.scaledDown).toEqual({ from: source, to: { width: 1000, height: 750 } });
    bitmap.close();
  });

  it('keeps the turn of a JPEG whose EXIF rotates it', async () => {
    const stored = { width: 4000, height: 3000 };
    const result = await renderImageJob({
      source: grayJpeg(stored.width, stored.height, 6),
      layout: { kind: 'fit', maxWidth: 1000, maxHeight: 1000 },
      quality: 0.8,
      scaledDecode: { source: stored, decoded: jpegScaledSize(stored, 2) },
    });
    const bitmap = await createImageBitmap(result.image);

    expect([bitmap.width, bitmap.height]).toEqual([750, 1000]);
    expect(result.scaledDown).toEqual({ from: { width: 3000, height: 4000 }, to: { width: 750, height: 1000 } });
    bitmap.close();
  });

  it('keeps the turn where ImageDecoder is missing and the JPEG is decoded whole', async () => {
    vi.stubGlobal('ImageDecoder', undefined);
    try {
      const stored = { width: 4000, height: 3000 };
      const result = await renderImageJob({
        source: grayJpeg(stored.width, stored.height, 6),
        layout: { kind: 'fit', maxWidth: 1000, maxHeight: 1000 },
        quality: 0.8,
        scaledDecode: { source: stored, decoded: jpegScaledSize(stored, 2) },
      });
      const bitmap = await createImageBitmap(result.image);

      expect([bitmap.width, bitmap.height]).toEqual([750, 1000]);
      expect(result.scaledDown).toEqual({ from: { width: 3000, height: 4000 }, to: { width: 750, height: 1000 } });
      bitmap.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
