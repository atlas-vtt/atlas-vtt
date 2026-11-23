import { expect, it } from 'vitest';
import { IVY_LEAF, ivyPalette, repaintDrawing } from '../../src/app/appearance/ivyPaint';

/** Relative luminance, enough to compare shades. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

it('keeps the drawings\' own greens for their own leaf green', () => {
  for (const [green, painted] of ivyPalette(IVY_LEAF)) {
    // Within a step of rounding through OKLab and back.
    for (const at of [1, 3, 5]) {
      expect(Math.abs(parseInt(painted.slice(at, at + 2), 16) - parseInt(green.slice(at, at + 2), 16))).toBeLessThanOrEqual(1);
    }
  }
});

it('paints the leaves in the picked colour and keeps the shading in order', () => {
  for (const picked of ['#c0392b', '#3b82c4', '#c9a227', '#8b5cf6', '#ffffff', '#101010']) {
    const palette = ivyPalette(picked);
    const shades = ['#2a3c08', '#567119', '#789532', '#94b24a'].map((green) => palette.get(green)!);
    expect(shades.every((shade) => /^#[0-9a-f]{6}$/.test(shade))).toBe(true);
    if (picked !== '#ffffff' && picked !== '#101010') expect(shades[2]).toBe(picked);
    // Darkest to lightest, as the drawing shades them; the outline stays ink.
    for (let at = 1; at < shades.length; at += 1) expect(luminance(shades[at]!)).toBeGreaterThanOrEqual(luminance(shades[at - 1]!));
    expect(luminance(shades[0]!)).toBeLessThan(luminance('#2a3c08') + 0.1);
  }
});

it('repaints only the drawing\'s greens', () => {
  const palette = ivyPalette('#3b82c4');
  const drawing = "url(\"data:image/svg+xml,%3Cpath fill='%23789532' stroke='%232A3C08'/%3E%3Crect fill='%23e9decb'/%3E\")";
  const painted = repaintDrawing(drawing, palette);
  expect(painted).toContain(`fill='%23${palette.get('#789532')!.slice(1)}'`);
  expect(painted).toContain(`stroke='%23${palette.get('#2a3c08')!.slice(1)}'`);
  expect(painted).toContain("fill='%23e9decb'");
});
