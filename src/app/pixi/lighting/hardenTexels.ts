/**
 * Hardens the texels of a composed mask, given as RGBA bytes: opaque black wherever a texel, or
 * one of the eight around it, holds any black at all, and clear elsewhere. Beyond the mask
 * counts as clear.
 */
export function hardenTexels(data: Uint8ClampedArray, width: number, height: number): void {
  const count = width * height;
  // Whether a texel or one of its two neighbours in its row holds black.
  const inRow = new Uint8Array(count);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      inRow[i] = data[i * 4 + 3]! > 0 || (x > 0 && data[i * 4 - 1]! > 0) || (x < width - 1 && data[i * 4 + 7]! > 0) ? 1 : 0;
    }
  }
  data.fill(0);
  for (let i = 0; i < count; i++) {
    if (inRow[i] || (i >= width && inRow[i - width]) || (i < count - width && inRow[i + width])) data[i * 4 + 3] = 255;
  }
}
