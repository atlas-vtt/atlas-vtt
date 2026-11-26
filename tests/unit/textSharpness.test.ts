import { describe, expect, it } from 'vitest';
import { MIN_TEXT_RESOLUTION, TEXT_TEXTURE_LIMITS, steppedResolution, textResolution, textureSide, type TextSize } from '../../src/app/pixi/textSharpness';

/** "Guard room" at 24 px: a label as the text tool makes it. */
const LABEL: TextSize = { width: 130, height: 29 };

/** The texture's pixels for `size` at `resolution`, as PIXI allocates it. */
const texturePixels = (size: TextSize, resolution: number): number =>
  textureSide(size.width, resolution) * textureSide(size.height, resolution);

describe('steppedResolution', () => {
  it('is the power of two at or above the pixels a screen shows to each unit', () => {
    expect(steppedResolution(1)).toBe(1);
    expect(steppedResolution(1.25)).toBe(2);
    expect(steppedResolution(2)).toBe(2);
    expect(steppedResolution(2.01)).toBe(4);
    expect(steppedResolution(10)).toBe(16);
  });

  it('never goes below the least resolution, whatever it is given', () => {
    for (const value of [0.1, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(steppedResolution(value)).toBe(MIN_TEXT_RESOLUTION);
    }
  });

  it('keeps a zoom on its step that misses it by a rounding error', () => {
    expect(steppedResolution(0.1 * 20)).toBe(2);
    expect(steppedResolution(4 + 1e-12)).toBe(4);
  });

  it('changes once per doubling over the whole zoom range', () => {
    const steps = new Set<number>();
    for (let zoom = 0.1; zoom <= 5; zoom *= 1.01) steps.add(steppedResolution(zoom * 2));
    expect([...steps]).toEqual([1, 2, 4, 8, 16]);
  });
});

describe('textResolution', () => {
  it.each([
    { zoom: 0.25, deviceRatio: 1, scale: 1, expected: 1 },
    { zoom: 1, deviceRatio: 1, scale: 1, expected: 1 },
    { zoom: 1, deviceRatio: 2, scale: 1, expected: 2 },
    { zoom: 3, deviceRatio: 1, scale: 1, expected: 4 },
    { zoom: 5, deviceRatio: 2, scale: 1, expected: 16 },
    { zoom: 1, deviceRatio: 1, scale: 3, expected: 4 },
    { zoom: 2, deviceRatio: 1.5, scale: 0.5, expected: 2 },
  ])('draws a label at step $expected for zoom $zoom, $deviceRatio pixels to a point and scale $scale', ({ zoom, deviceRatio, scale, expected }) => {
    const resolution = textResolution(zoom * deviceRatio * scale, LABEL);
    expect(resolution).toBe(expected);
    // Never stretched on screen.
    expect(resolution).toBeGreaterThanOrEqual(Math.max(1, zoom * deviceRatio * scale));
  });

  it('holds a long text to the longest side, as fine as that side allows', () => {
    const title: TextSize = { width: 700, height: 86 };
    const resolution = textResolution(10, title);
    expect(resolution).toBeLessThan(16);
    expect(textureSide(title.width, resolution)).toBe(4096);
    // The side is used whole: a pixel more of the text would double it.
    expect(Math.ceil(title.width * resolution)).toBe(4096);
  });

  it('holds a tall text to the pixel budget', () => {
    const paragraph: TextSize = { width: 600, height: 400 };
    const resolution = textResolution(8, paragraph);
    expect(texturePixels(paragraph, resolution)).toBeLessThanOrEqual(TEXT_TEXTURE_LIMITS.maxPixels);
    expect(textureSide(paragraph.width, resolution)).toBeLessThanOrEqual(TEXT_TEXTURE_LIMITS.maxSide);
    // The finest that fits: the next texture up is over the budget.
    expect(texturePixels(paragraph, resolution * 1.01)).toBeGreaterThan(TEXT_TEXTURE_LIMITS.maxPixels);
  });

  it('goes below the least resolution for a text too large for one texture', () => {
    const resolution = textResolution(2, { width: 10_000, height: 60 });
    expect(resolution).toBeLessThan(1);
    expect(textureSide(10_000, resolution)).toBe(4096);
  });

  it('respects a graphics card with smaller textures, and one whose limit is no power of two', () => {
    const size: TextSize = { width: 500, height: 40 };
    expect(textureSide(size.width, textResolution(16, size, { maxSide: 2048, maxPixels: 1e9 }))).toBe(2048);
    expect(textureSide(size.width, textResolution(16, size, { maxSide: 3000, maxPixels: 1e9 }))).toBe(2048);
  });

  it('stays within the limits for every size and zoom', () => {
    const limits = { maxSide: 4096, maxPixels: 4096 * 2048 };
    for (const width of [1, 7, 130, 999, 4097, 20_000]) {
      for (const height of [1, 29, 400, 3000, 9000]) {
        for (const pixelsPerUnit of [0.05, 1, 2.5, 10, 50, 1000]) {
          const resolution = textResolution(pixelsPerUnit, { width, height }, limits);
          expect(resolution).toBeGreaterThan(0);
          expect(resolution).toBeLessThanOrEqual(steppedResolution(pixelsPerUnit));
          expect(textureSide(width, resolution)).toBeLessThanOrEqual(limits.maxSide);
          expect(textureSide(height, resolution)).toBeLessThanOrEqual(limits.maxSide);
          expect(texturePixels({ width, height }, resolution)).toBeLessThanOrEqual(limits.maxPixels);
        }
      }
    }
  });

  it('reads a size that is no size as one pixel', () => {
    expect(textResolution(4, { width: Number.NaN, height: 0 })).toBe(4);
  });
});
