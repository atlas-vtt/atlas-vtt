import { describe, expect, it } from 'vitest';
import { WEBP_MAX_SIDE } from '../../src/app/imageProcessing/decodeLimits';
import { IMAGE_PRESETS } from '../../src/app/imageProcessing/imageProcessing';
import { fitSize, fitWithin, frameImageRect, frameSize, scaleDown, vectorRasterSize } from '../../src/app/imageProcessing/imageLayout';
import { renderedImageRect, TOKEN_CROP_FRACTION, tokenCropPlacement } from '../../src/app/packages/components/asset-manager/token-creator/cropMath';

describe('fitWithin', () => {
  it('scales down to the tighter bound and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 11708, height: 12917 }, 8192, 8192)).toEqual({ width: 7425, height: 8192 });
    expect(fitWithin({ width: 2048, height: 1024 }, 400, 400)).toEqual({ width: 400, height: 200 });
  });

  it('never scales up', () => {
    expect(fitWithin({ width: 300, height: 120 }, 400, 400)).toEqual({ width: 300, height: 120 });
    expect(fitWithin({ width: 300, height: 120 }, 400, 400, 1_000_000)).toEqual({ width: 300, height: 120 });
  });

  it('keeps the area within maxPixels', () => {
    expect(fitWithin({ width: 13000, height: 13000 }, 16383, 16383, 144_000_000)).toEqual({ width: 12000, height: 12000 });
    const wide = fitWithin({ width: 16000, height: 12000 }, 16383, 16383, 144_000_000);
    expect(wide.width * wide.height).toBeLessThanOrEqual(144_000_000);
    expect(wide.width / wide.height).toBeCloseTo(16000 / 12000, 3);
  });

  it('rounds down where rounding would take the area over maxPixels', () => {
    // At the exact area scale 1001 × 999 rounds to 999 × 998, two pixels over.
    const fitted = fitWithin({ width: 1001, height: 999 }, 4000, 4000, 997_000);
    expect(fitted).toEqual({ width: 999, height: 997 });
  });

  it('lets the tighter of sides and area decide', () => {
    expect(fitWithin({ width: 20000, height: 9000 }, 16383, 16383, 144_000_000)).toEqual({ width: 16383, height: 7372 });
    expect(fitWithin({ width: 60000, height: 2000 }, 16383, 16383, 144_000_000)).toEqual({ width: 16383, height: 546 });
  });
});

describe('fitSize', () => {
  it('fits a map within 16383 px a side and 144 MP', () => {
    const map = { kind: 'fit', ...IMAGE_PRESETS.map } as const;
    expect(fitSize({ width: 20000, height: 9000 }, map)).toEqual({ width: 16383, height: 7372 });
    expect(fitSize({ width: 13000, height: 13000 }, map)).toEqual({ width: 12000, height: 12000 });
    expect(fitSize({ width: 16383, height: 8000 }, map)).toEqual({ width: 16383, height: 8000 });
    // 144.17 MP, just over the limit
    expect(fitSize({ width: 16383, height: 8800 }, map)).toEqual({ width: 16373, height: 8794 });
  });

  it('never makes a side longer than a WebP can have, whatever the layout allows', () => {
    const generous = { kind: 'fit', maxWidth: 40000, maxHeight: 40000 } as const;
    expect(fitSize({ width: 30000, height: 100 }, generous)).toEqual({ width: WEBP_MAX_SIDE, height: 55 });
    expect(fitSize({ width: 100, height: 20000 }, generous)).toEqual({ width: 82, height: WEBP_MAX_SIDE });
  });
});

describe('scaleDown', () => {
  const map = { kind: 'fit', maxWidth: 8192, maxHeight: 8192 } as const;

  it('reports the pixels a fit took from the source', () => {
    const source = { width: 9000, height: 90 };
    expect(scaleDown(map, source, fitWithin(source, 8192, 8192))).toEqual({ from: source, to: { width: 8192, height: 82 } });
  });

  it('reports nothing when the output keeps every pixel, or for a frame', () => {
    const source = { width: 4000, height: 40 };
    expect(scaleDown(map, source, fitWithin(source, 8192, 8192))).toBeUndefined();
    const frame = { kind: 'frame', placement: tokenCropPlacement(1, { x: 0, y: 0 }), minSize: 256, maxSize: 400 } as const;
    expect(scaleDown(frame, { width: 2048, height: 2048 }, { width: 400, height: 400 })).toBeUndefined();
  });
});

describe('vectorRasterSize', () => {
  it('fills the bounds of a fit, however small the vector says it is', () => {
    const map = { kind: 'fit', maxWidth: 8192, maxHeight: 8192 } as const;
    expect(vectorRasterSize({ width: 2592, height: 1728 }, map)).toEqual({ width: 8192, height: 5461 });
    expect(vectorRasterSize({ width: 30000, height: 40000 }, map)).toEqual({ width: 6144, height: 8192 });
    expect(vectorRasterSize({ width: 24, height: 24 }, { kind: 'fit', maxWidth: 400, maxHeight: 400 })).toEqual({ width: 400, height: 400 });
  });

  it('fills a map within its area limit', () => {
    const map = { kind: 'fit', ...IMAGE_PRESETS.map } as const;
    expect(vectorRasterSize({ width: 400, height: 200 }, map)).toEqual({ width: 16383, height: 8192 });
    expect(vectorRasterSize({ width: 100, height: 100 }, map)).toEqual({ width: 12000, height: 12000 });
  });

  it('gives a frame enough pixels to crop from', () => {
    const frame = { kind: 'frame', placement: tokenCropPlacement(1, { x: 0, y: 0 }), minSize: 256, maxSize: 400 } as const;
    expect(vectorRasterSize({ width: 100, height: 50 }, frame)).toEqual({ width: 2048, height: 1024 });
  });
});

describe('token frames', () => {
  it('give the frame as many pixels as the source has across it, within the bounds', () => {
    const placement = tokenCropPlacement(1, { x: 0, y: 0 });
    expect(frameSize({ width: 2048, height: 2048 }, placement, 256, 400)).toBe(400);
    expect(frameSize({ width: 350, height: 350 }, placement, 256, 400)).toBe(280);
    expect(frameSize({ width: 100, height: 100 }, placement, 256, 400)).toBe(256);
    expect(frameSize({ width: 2048, height: 2048 }, tokenCropPlacement(3, { x: 0, y: 0 }), 256, 400)).toBe(400);
    expect(frameSize({ width: 40000, height: 40000 }, placement, 256, 40000)).toBe(WEBP_MAX_SIDE);
  });

  it('place the image exactly where the crop editor shows it', () => {
    const aspect = { width: 1600, height: 900 };
    const scale = 1.7;
    const position = { x: 0.12, y: -0.08 };
    const size = 400;
    const actual = frameImageRect(aspect, tokenCropPlacement(scale, position), size);

    // The crop editor's rectangle in well units, mapped onto the square around the token circle.
    const well = renderedImageRect(scale, position, aspect);
    const origin = (1 - TOKEN_CROP_FRACTION) / 2;
    const pixelsPerUnit = size / TOKEN_CROP_FRACTION;
    expect(actual.left).toBeCloseTo((well.left - origin) * pixelsPerUnit, 9);
    expect(actual.top).toBeCloseTo((well.top - origin) * pixelsPerUnit, 9);
    expect(actual.width).toBeCloseTo(well.width * pixelsPerUnit, 9);
    expect(actual.height).toBeCloseTo(well.height * pixelsPerUnit, 9);
  });
});
