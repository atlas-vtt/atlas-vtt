/**
 * JFIF YCbCr to RGB with libjpeg's tables and rounding (jdcolor.c, `build_ycc_rgb_table`): 16-bit
 * fixed point, red and blue offsets rounded into the table, green's rounded once after its two
 * products are summed.
 */
const SCALE_BITS = 16;
const ONE_HALF = 1 << (SCALE_BITS - 1);
const fix = (x: number): number => Math.round(x * (1 << SCALE_BITS));

const CR_TO_R = new Int32Array(256);
const CB_TO_B = new Int32Array(256);
const CR_TO_G = new Int32Array(256);
const CB_TO_G = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  const x = i - 128;
  CR_TO_R[i] = (fix(1.402) * x + ONE_HALF) >> SCALE_BITS;
  CB_TO_B[i] = (fix(1.772) * x + ONE_HALF) >> SCALE_BITS;
  CR_TO_G[i] = -fix(0.71414) * x;
  CB_TO_G[i] = -fix(0.34414) * x + ONE_HALF;
}

/** Writes `width` RGBA pixels (alpha 255) into `out` from `at`; the clamped array does libjpeg's range limiting. */
export function ycbcrToRgba(
  y: Uint8ClampedArray, yAt: number, cb: Uint8ClampedArray, cbAt: number, cr: Uint8ClampedArray, crAt: number,
  width: number, out: Uint8ClampedArray, at: number,
): void {
  let o = at;
  for (let x = 0; x < width; x++) {
    const luma = y[yAt + x]!;
    const blue = cb[cbAt + x]!;
    const red = cr[crAt + x]!;
    out[o] = luma + CR_TO_R[red]!;
    out[o + 1] = luma + ((CB_TO_G[blue]! + CR_TO_G[red]!) >> SCALE_BITS);
    out[o + 2] = luma + CB_TO_B[blue]!;
    out[o + 3] = 255;
    o += 4;
  }
}

/** Writes `width` grey RGBA pixels (alpha 255) into `out` from `at`. */
export function greyToRgba(y: Uint8ClampedArray, yAt: number, width: number, out: Uint8ClampedArray, at: number): void {
  let o = at;
  for (let x = 0; x < width; x++) {
    const luma = y[yAt + x]!;
    out[o] = luma;
    out[o + 1] = luma;
    out[o + 2] = luma;
    out[o + 3] = 255;
    o += 4;
  }
}
