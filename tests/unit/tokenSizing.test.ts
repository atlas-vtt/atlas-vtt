import { describe, expect, it } from 'vitest';
import { computeTokenPixelSize, resizedTokenSize, TOKEN_SIZE_OPTIONS, tokenDiameterInCells, tokenSizeFromCreatureSize } from '../../src/app/pixi/token-renderer/tokenSizing';

describe('token size options', () => {
  it('names the footprint each stored multiplier renders', () => {
    for (const option of TOKEN_SIZE_OPTIONS) {
      const cells = tokenDiameterInCells(option.size);
      expect(option.label).toContain(`${cells}×${cells}`);
    }
  });

  it('maps creature size words to stored multipliers and ignores unknown values', () => {
    expect(tokenSizeFromCreatureSize('Large')).toBe(1.5);
    expect(tokenSizeFromCreatureSize(' huge or larger ')).toBe(2);
    expect(tokenSizeFromCreatureSize('Tiny')).toBe(0.75);
    expect(tokenSizeFromCreatureSize(' Small humanoid ')).toBe(0.875);
    expect(tokenSizeFromCreatureSize('Colossal')).toBeUndefined();
    expect(tokenSizeFromCreatureSize(undefined)).toBeUndefined();
  });

  it.each([35, 70, 140])('renders Small and Tiny at 75%% and 50%% of Medium on a %s px grid', (gridSize) => {
    const medium = computeTokenPixelSize(gridSize, 1);
    expect(computeTokenPixelSize(gridSize, 0.875)).toBe(medium * 0.75);
    expect(computeTokenPixelSize(gridSize, 0.75)).toBe(medium * 0.5);
  });

  it('lets handles shrink through Small to Tiny, grow back, and retain the existing upper limit', () => {
    expect(resizedTokenSize(1, -1)).toBe(0.875);
    expect(resizedTokenSize(1, -2)).toBe(0.75);
    expect(resizedTokenSize(0.75, 1)).toBe(0.875);
    expect(resizedTokenSize(0.875, 1)).toBe(1);
    expect(resizedTokenSize(0.75, 3)).toBe(1.5);
    expect(resizedTokenSize(1.5, 1)).toBe(2);
    expect(resizedTokenSize(1, -100)).toBe(0.75);
    expect(resizedTokenSize(1, 100)).toBe(5);
    expect(resizedTokenSize(0.875, 0)).toBe(0.875);
  });
});
