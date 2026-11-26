import { describe, expect, it } from 'vitest';
import { clampImagePosition, cropReset, renderedImageRect, TOKEN_CROP_FRACTION } from '../cropMath';

const square = { width: 100, height: 100 };
const portrait = { width: 100, height: 200 };

it('starts and resets ringless uploads and stored images at whole-image fit', () => {
  expect(cropReset({ file: null, showRing: false })).toEqual({ imageScale: 1, imagePosition: { x: 0, y: 0 } });
  expect(cropReset({ file: new File(['art'], 'token.png'), showRing: false }).imageScale).toBe(1);
  expect(cropReset({ file: null, showRing: true }).imageScale).toBe(TOKEN_CROP_FRACTION);
});

describe('renderedImageRect', () => {
  it('centres an unzoomed square image in the well', () => {
    expect(renderedImageRect(1, { x: 0, y: 0 }, square)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it('scales about the centre and follows the natural aspect', () => {
    const rect = renderedImageRect(2, { x: 0, y: 0 }, portrait);
    expect(rect).toEqual({ left: -0.5, top: -1.5, width: 2, height: 4 });
  });

  it('applies the offset in well units', () => {
    expect(renderedImageRect(1, { x: 0.25, y: -0.25 }, square)).toEqual({ left: 0.25, top: -0.25, width: 1, height: 1 });
  });
});

describe('clampImagePosition', () => {
  it('uses the contained portrait dimensions for ringless drag limits', () => {
    expect(clampImagePosition({ x: 9, y: -9 }, 1, portrait, 'contain')).toEqual({ x: 0.25, y: -0.5 });
  });

  it('lets every part of a zoomed image reach the crop', () => {
    const scale = 3;
    const corner = clampImagePosition({ x: 5, y: 5 }, scale, square);
    const rect = renderedImageRect(scale, corner, square);
    const cropEdge = (1 - TOKEN_CROP_FRACTION) / 2;
    expect(rect.left).toBeGreaterThanOrEqual(cropEdge);
    expect(rect.top).toBeGreaterThanOrEqual(cropEdge);
    expect(corner).toEqual({ x: 1.5, y: 1.5 });
  });

  it('never lets the image leave the crop centre', () => {
    const clamped = clampImagePosition({ x: -9, y: 9 }, 1, portrait);
    expect(clamped).toEqual({ x: -0.5, y: 1 });
    const rect = renderedImageRect(1, clamped, portrait);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(0.5);
    expect(rect.top).toBeLessThanOrEqual(0.5);
  });

  it('leaves positions already inside the limits untouched', () => {
    expect(clampImagePosition({ x: 0.1, y: -0.2 }, 1.5, null)).toEqual({ x: 0.1, y: -0.2 });
  });
});
