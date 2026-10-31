/**
 * libjpeg's reduced-size inverse DCTs (jidctred.c), which it uses to decode at 1/8 scale: one
 * sample per block from the DC term (`jpeg_idct_1x1`), or 2 × 2 samples (`jpeg_idct_2x2`) for a
 * component sampled at half the luma's resolution both ways, so that 4:2:0 chroma needs no
 * upsampling at that scale (jdmaster.c gives such a component twice the scaled DCT size).
 */
const CONST_BITS = 13;
const PASS1_BITS = 2;
const FIX_0_720959822 = 5906;
const FIX_0_850430095 = 6967;
const FIX_1_272758580 = 10426;
const FIX_3_624509785 = 29692;
const PASS1_SHIFT = CONST_BITS - PASS1_BITS + 2;
const PASS2_SHIFT = CONST_BITS + PASS1_BITS + 3 + 2;

/** `jpeg_idct_1x1`: the dequantised DC over 8, rounded, centred on 128. */
export function reducedSample(dc: number, quant: Int32Array): number {
  return ((dc * (quant[0] ?? 0) + 4) >> 3) + 128;
}

/** `jpeg_idct_2x2`: writes the 2 × 2 samples of `coef` (natural order) into `quad`, row by row; `work` holds 16 entries of scratch. */
export function idct2x2(coef: Int32Array, quant: Int32Array, work: Int32Array, quad: Uint8ClampedArray): void {
  // Columns 2, 4 and 6 do not reach a 2-point output, nor do rows 2, 4 and 6.
  for (let col = 0; col < 8; col++) {
    if (col === 2 || col === 4 || col === 6) continue;
    const c0 = coef[col]! * quant[col]!;
    const c1 = coef[col + 8]! * quant[col + 8]!;
    const c3 = coef[col + 24]! * quant[col + 24]!;
    const c5 = coef[col + 40]! * quant[col + 40]!;
    const c7 = coef[col + 56]! * quant[col + 56]!;
    if (c1 === 0 && c3 === 0 && c5 === 0 && c7 === 0) {
      work[col] = c0 << PASS1_BITS;
      work[col + 8] = c0 << PASS1_BITS;
      continue;
    }
    const even = c0 * (1 << (CONST_BITS + 2)) + (1 << (PASS1_SHIFT - 1));
    const odd = oddPart(c1, c3, c5, c7);
    work[col] = (even + odd) >> PASS1_SHIFT;
    work[col + 8] = (even - odd) >> PASS1_SHIFT;
  }
  for (let row = 0; row < 2; row++) {
    const w = row * 8;
    const at = row * 2;
    const w0 = work[w]!;
    const w1 = work[w + 1]!;
    const w3 = work[w + 3]!;
    const w5 = work[w + 5]!;
    const w7 = work[w + 7]!;
    if (w1 === 0 && w3 === 0 && w5 === 0 && w7 === 0) {
      const sample = ((w0 + 16) >> 5) + 128;
      quad[at] = sample;
      quad[at + 1] = sample;
      continue;
    }
    const even = w0 * (1 << (CONST_BITS + 2)) + (1 << (PASS2_SHIFT - 1));
    const odd = oddPart(w1, w3, w5, w7);
    quad[at] = ((even + odd) >> PASS2_SHIFT) + 128;
    quad[at + 1] = ((even - odd) >> PASS2_SHIFT) + 128;
  }
}

function oddPart(x1: number, x3: number, x5: number, x7: number): number {
  return x7 * -FIX_0_720959822 + x5 * FIX_0_850430095 + x3 * -FIX_1_272758580 + x1 * FIX_3_624509785;
}
