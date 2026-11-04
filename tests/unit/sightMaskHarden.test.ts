import { describe, expect, it } from 'vitest';
import { hardenTexels } from '../../src/app/pixi/lighting/hardenTexels';

/** RGBA bytes of a mask, from its texels' alphas row by row; the colour is noise, which hardening drops. */
function texels(alphas: readonly number[]): Uint8ClampedArray {
  return Uint8ClampedArray.from(alphas.flatMap((alpha, index) => [index % 7, 3, 9, alpha]));
}

function alphasOf(data: Uint8ClampedArray): number[] {
  return Array.from(data).filter((_, index) => index % 4 === 3);
}

/**
 * The rule that makes the line-of-sight mask conservative, without a canvas: the browser tests
 * hold the picture, this holds the rule where they do not run.
 */
describe('hardening the sight mask\'s texels', () => {
  it('leaves a mask without any black clear', () => {
    const data = texels(new Array<number>(20).fill(0));
    hardenTexels(data, 5, 4);
    expect(Array.from(data)).toEqual(new Array<number>(80).fill(0));
  });

  it('makes a texel with any black at all opaque black, with the eight around it', () => {
    const data = texels([
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
    ]);
    hardenTexels(data, 6, 5);
    expect(alphasOf(data)).toEqual([
      0, 0, 0, 0, 0, 0,
      0, 255, 255, 255, 0, 0,
      0, 255, 255, 255, 0, 0,
      0, 255, 255, 255, 0, 0,
      0, 0, 0, 0, 0, 0,
    ]);
    // Black, not the canvas' colour at half strength.
    expect(Array.from(data).filter((_, index) => index % 4 !== 3).every((channel) => channel === 0)).toBe(true);
  });

  it('never wraps from the end of a row to the start of the next, and stops at the mask\'s edge', () => {
    const data = texels([
      0, 0, 0, 128,
      0, 0, 0, 0,
      0, 0, 0, 0,
      254, 0, 0, 0,
    ]);
    hardenTexels(data, 4, 4);
    expect(alphasOf(data)).toEqual([
      0, 0, 255, 255,
      0, 0, 255, 255,
      255, 255, 0, 0,
      255, 255, 0, 0,
    ]);
  });

  it('holds only clear and opaque texels, whatever the canvas blended', () => {
    const alphas = Array.from({ length: 30 * 20 }, (_, index) => (index * 37) % 11 === 0 ? (index * 53) % 256 : 0);
    const data = texels(alphas);
    hardenTexels(data, 30, 20);
    const hardened = alphasOf(data);
    expect(hardened.every((alpha) => alpha === 0 || alpha === 255)).toBe(true);
    // No texel that held black is clear, and none is opaque without black in it or beside it.
    alphas.forEach((alpha, index) => {
      const [x, y] = [index % 30, Math.floor(index / 30)];
      const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => x + dx >= 0 && x + dx < 30 && y + dy >= 0 && y + dy < 20 && alphas[(y + dy) * 30 + x + dx]! > 0));
      expect(hardened[index]).toBe(near ? 255 : 0);
      if (alpha > 0) expect(hardened[index]).toBe(255);
    });
  });
});
