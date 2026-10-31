/**
 * libjpeg's accurate integer inverse DCT (jidctint.c, `jpeg_idct_islow`), which Chromium decodes
 * with: 13-bit fixed-point constants, two extra bits of precision between the column and the row
 * pass, and the same rounding, so its samples match libjpeg-turbo's exactly.
 */
const CONST_BITS = 13;
const PASS1_BITS = 2;
const FIX_0_298631336 = 2446;
const FIX_0_390180644 = 3196;
const FIX_0_541196100 = 4433;
const FIX_0_765366865 = 6270;
const FIX_0_899976223 = 7373;
const FIX_1_175875602 = 9633;
const FIX_1_501321110 = 12299;
const FIX_1_847759065 = 15137;
const FIX_1_961570560 = 16069;
const FIX_2_053119869 = 16819;
const FIX_2_562915447 = 20995;
const FIX_3_072711026 = 25172;
const PASS1_SHIFT = CONST_BITS - PASS1_BITS;
const PASS1_ROUND = 1 << (PASS1_SHIFT - 1);
const PASS2_SHIFT = CONST_BITS + PASS1_BITS + 3;
const PASS2_ROUND = 1 << (PASS2_SHIFT - 1);

/** The sample every pixel of a block with no AC coefficients takes: what the IDCT's all-zero shortcuts give. */
export function dcOnlySample(dc: number, quant: Int32Array): number {
  return ((dc * (quant[0] ?? 0) * 4 + 16) >> 5) + 128;
}

/** Fills an 8 × 8 block of `out` at `offset` (row stride `stride`) with one sample; the clamped array clamps it. */
export function fillBlock(sample: number, out: Uint8ClampedArray, offset: number, stride: number): void {
  for (let row = 0; row < 8; row++) out.fill(sample, offset + row * stride, offset + row * stride + 8);
}

/** Dequantises `coef` (natural order) and writes its inverse transform into `out`; `work` is 64 entries of scratch. */
export function idctBlock(coef: Int32Array, quant: Int32Array, work: Int32Array, out: Uint8ClampedArray, offset: number, stride: number): void {
  for (let col = 0; col < 8; col++) {
    const c1 = coef[col + 8]! * quant[col + 8]!;
    const c2 = coef[col + 16]! * quant[col + 16]!;
    const c3 = coef[col + 24]! * quant[col + 24]!;
    const c4 = coef[col + 32]! * quant[col + 32]!;
    const c5 = coef[col + 40]! * quant[col + 40]!;
    const c6 = coef[col + 48]! * quant[col + 48]!;
    const c7 = coef[col + 56]! * quant[col + 56]!;
    const c0 = coef[col]! * quant[col]!;
    if (c1 === 0 && c2 === 0 && c3 === 0 && c4 === 0 && c5 === 0 && c6 === 0 && c7 === 0) {
      const dc = c0 << PASS1_BITS;
      for (let row = 0; row < 64; row += 8) work[row + col] = dc;
      continue;
    }
    transform(c0, c1, c2, c3, c4, c5, c6, c7, work, col, 8, PASS1_ROUND, PASS1_SHIFT, 0);
  }
  for (let row = 0; row < 64; row += 8) {
    const w0 = work[row]!;
    const w1 = work[row + 1]!;
    const w2 = work[row + 2]!;
    const w3 = work[row + 3]!;
    const w4 = work[row + 4]!;
    const w5 = work[row + 5]!;
    const w6 = work[row + 6]!;
    const w7 = work[row + 7]!;
    const at = offset + (row >> 3) * stride;
    if (w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 0) {
      const sample = ((w0 + 16) >> 5) + 128;
      out.fill(sample, at, at + 8);
      continue;
    }
    transform(w0, w1, w2, w3, w4, w5, w6, w7, out, at, 1, PASS2_ROUND, PASS2_SHIFT, 128);
  }
}

/** One 8-point pass of jpeg_idct_islow, written to `out[at + i * step]` after rounding, shifting and adding `bias`. */
function transform(
  x0: number, x1: number, x2: number, x3: number, x4: number, x5: number, x6: number, x7: number,
  out: Int32Array | Uint8ClampedArray, at: number, step: number, round: number, shift: number, bias: number,
): void {
  // Even part.
  let z1 = (x2 + x6) * FIX_0_541196100;
  const tmp2 = z1 - x6 * FIX_1_847759065;
  const tmp3 = z1 + x2 * FIX_0_765366865;
  const tmp0 = (x0 + x4) << CONST_BITS;
  const tmp1 = (x0 - x4) << CONST_BITS;
  const tmp10 = tmp0 + tmp3 + round;
  const tmp13 = tmp0 - tmp3 + round;
  const tmp11 = tmp1 + tmp2 + round;
  const tmp12 = tmp1 - tmp2 + round;
  // Odd part.
  z1 = x7 + x1;
  let z2 = x5 + x3;
  let z3 = x7 + x3;
  let z4 = x5 + x1;
  const z5 = (z3 + z4) * FIX_1_175875602;
  z1 *= -FIX_0_899976223;
  z2 *= -FIX_2_562915447;
  z3 = z3 * -FIX_1_961570560 + z5;
  z4 = z4 * -FIX_0_390180644 + z5;
  const odd0 = x7 * FIX_0_298631336 + z1 + z3;
  const odd1 = x5 * FIX_2_053119869 + z2 + z4;
  const odd2 = x3 * FIX_3_072711026 + z2 + z3;
  const odd3 = x1 * FIX_1_501321110 + z1 + z4;
  out[at] = ((tmp10 + odd3) >> shift) + bias;
  out[at + 7 * step] = ((tmp10 - odd3) >> shift) + bias;
  out[at + step] = ((tmp11 + odd2) >> shift) + bias;
  out[at + 6 * step] = ((tmp11 - odd2) >> shift) + bias;
  out[at + 2 * step] = ((tmp12 + odd1) >> shift) + bias;
  out[at + 5 * step] = ((tmp12 - odd1) >> shift) + bias;
  out[at + 3 * step] = ((tmp13 + odd0) >> shift) + bias;
  out[at + 4 * step] = ((tmp13 - odd0) >> shift) + bias;
}
