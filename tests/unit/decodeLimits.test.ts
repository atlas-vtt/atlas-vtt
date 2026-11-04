import { describe, expect, it } from 'vitest';
import { BAND_MAX_PIXELS, bandDecodable, DECODED_MAX_PIXELS, DECODER_MAX_SIDE, decodable, jpegScaledSize, scaledJpegDecodeSize } from '../../src/app/imageProcessing/decodeLimits';
import { IMAGE_PRESETS } from '../../src/app/imageProcessing/imageProcessing';
import { decodedSizeCost, MAX_DECODED_LEVELS_BYTES, MAX_SOURCE_PIXELS } from '../../src/app/pixi/mosaicCanvas/decodedLevels';

describe('decodable', () => {
  it('takes images below 2^28 pixels, where Chromium 156 ends the renderer', () => {
    expect(DECODED_MAX_PIXELS).toBe(268_435_456);
    expect(decodable({ width: 16383, height: 16383 })).toBe(true);
    expect(decodable({ width: 16384, height: 16383 })).toBe(true);
    expect(decodable({ width: 16384, height: 16384 })).toBe(false);
    expect(decodable({ width: 30000, height: 8947 })).toBe(true);
    expect(decodable({ width: 30000, height: 8948 })).toBe(false);
  });

  it('refuses sides over 65535', () => {
    expect(decodable({ width: 65535, height: 10 })).toBe(true);
    expect(decodable({ width: 65536, height: 10 })).toBe(false);
    expect(decodable({ width: 10, height: 70000 })).toBe(false);
  });
});

describe('scaled JPEG decoding', () => {
  it('rounds each side of an eighth step up, as ImageDecoder requires', () => {
    expect(jpegScaledSize({ width: 1001, height: 999 }, 1)).toEqual({ width: 126, height: 125 });
    expect(jpegScaledSize({ width: 1001, height: 999 }, 7)).toEqual({ width: 876, height: 875 });
    expect(jpegScaledSize({ width: 1001, height: 999 }, 8)).toEqual({ width: 1001, height: 999 });
  });

  it('picks the smallest step that keeps every pixel of the target', () => {
    expect(scaledJpegDecodeSize({ width: 30000, height: 17000 }, { width: 15941, height: 9033 })).toEqual({ width: 18750, height: 10625 });
    expect(scaledJpegDecodeSize({ width: 20000, height: 9000 }, { width: 16383, height: 7372 })).toEqual({ width: 17500, height: 7875 });
  });

  it('decodes at full size when no smaller step reaches the target', () => {
    expect(scaledJpegDecodeSize({ width: 17000, height: 12000 }, { width: 16383, height: 11565 })).toBeNull();
    expect(scaledJpegDecodeSize({ width: 4000, height: 3000 }, { width: 4000, height: 3000 })).toBeNull();
  });
});

describe('the tessera worker’s limit on a source', () => {
  it('decodes every map the browser can, refuses what the decoders would die on, and leaves the rest to the band decoders', () => {
    const { maxPixels, maxWidth } = IMAGE_PRESETS.map;
    expect(MAX_SOURCE_PIXELS).toBe(DECODED_MAX_PIXELS - 1);
    expect(decodedSizeCost(MAX_SOURCE_PIXELS, 1)).toBeLessThanOrEqual(MAX_DECODED_LEVELS_BYTES);
    expect(decodable({ width: 16383, height: 16383 })).toBe(true);
    expect(bandDecodable({ format: 'jpeg', width: 16384, height: 16384 })).toBe(true);
    expect(bandDecodable({ format: 'png', width: 20000, height: 20000 })).toBe(true);
    expect(bandDecodable({ format: 'jpeg', width: 16383, height: 16383 })).toBe(false);
    expect(bandDecodable({ format: 'webp', width: 20000, height: 20000 })).toBe(false);
    expect(bandDecodable({ format: 'png', width: 31622, height: 31622 })).toBe(true);
    expect(bandDecodable({ format: 'png', width: 31623, height: 31623 })).toBe(false);
    expect(bandDecodable({ format: 'jpeg', width: 65536, height: 100 })).toBe(false);
    expect(maxPixels).toBe(BAND_MAX_PIXELS);
    expect(maxWidth).toBeLessThanOrEqual(DECODER_MAX_SIDE);
  });
});
