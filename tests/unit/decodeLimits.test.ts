import { describe, expect, it } from 'vitest';
import { decodable, jpegScaledSize, scaledJpegDecodeSize } from '../../src/app/imageProcessing/decodeLimits';
import { IMAGE_PRESETS } from '../../src/app/imageProcessing/imageProcessing';
import { decodedSizeCost, MAX_DECODED_LEVELS_BYTES, MAX_SOURCE_PIXELS } from '../../src/app/pixi/mapImage/decodedLevels';

describe('decodable', () => {
  it('takes images whose RGBA pixels fit in 2 GiB less a byte', () => {
    expect(decodable({ width: 23170, height: 23170 })).toBe(true);
    expect(decodable({ width: 23171, height: 23171 })).toBe(false);
    expect(decodable({ width: 30000, height: 17000 })).toBe(true);
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

describe('the tile worker’s limit on a source', () => {
  it('opens every map an import writes, and refuses less than the decoders take', () => {
    const { maxPixels } = IMAGE_PRESETS.map;
    expect(decodedSizeCost(maxPixels, 1)).toBeLessThan(MAX_DECODED_LEVELS_BYTES / 2);
    expect(MAX_SOURCE_PIXELS).toBeGreaterThan(maxPixels);
    expect(decodable({ width: 20000, height: 20000 })).toBe(true);
    expect(20000 * 20000).toBeLessThanOrEqual(MAX_SOURCE_PIXELS);
    expect(decodedSizeCost(MAX_SOURCE_PIXELS, 1)).toBeLessThanOrEqual(MAX_DECODED_LEVELS_BYTES);
  });
});
