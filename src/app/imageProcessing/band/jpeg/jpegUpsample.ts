/**
 * Chroma upsampling as libjpeg-turbo does it by default (jdsample.c), which Chromium uses: "fancy"
 * triangle filters that weigh the nearer sample 3/4 and the further 1/4, with libjpeg's alternating
 * rounding biases. Each function writes one output row of chroma from index 0 of `out`. `width` is
 * the component's own width in samples (`downsampled_width`), so the last column is replicated at the
 * image's edge rather than read from the block padding.
 */

/** h2v1_fancy_upsample: twice as wide, one input row. Needs `width > 2` (libjpeg's condition for fancy upsampling). */
export function upsampleH2V1(row: Uint8ClampedArray, at: number, width: number, out: Uint8ClampedArray): void {
  let previous = row[at]!;
  let current = previous;
  out[0] = current;
  out[1] = (current * 3 + row[at + 1]! + 2) >> 2;
  let o = 2;
  for (let x = 1; x < width - 1; x++) {
    previous = current;
    current = row[at + x]!;
    const near = current * 3;
    out[o++] = (near + previous + 1) >> 2;
    out[o++] = (near + row[at + x + 1]! + 2) >> 2;
  }
  previous = current;
  current = row[at + width - 1]!;
  out[o++] = (current * 3 + previous + 1) >> 2;
  out[o] = current;
}

/** h2v2_fancy_upsample: twice as wide, from the nearer input row and the further one above or below. Needs `width > 2`. */
export function upsampleH2V2(near: Uint8ClampedArray, nearAt: number, far: Uint8ClampedArray, farAt: number, width: number, out: Uint8ClampedArray): void {
  let thisSum = near[nearAt]! * 3 + far[farAt]!;
  let nextSum = near[nearAt + 1]! * 3 + far[farAt + 1]!;
  out[0] = (thisSum * 4 + 8) >> 4;
  out[1] = (thisSum * 3 + nextSum + 7) >> 4;
  let lastSum = thisSum;
  thisSum = nextSum;
  let o = 2;
  for (let x = 2; x < width; x++) {
    nextSum = near[nearAt + x]! * 3 + far[farAt + x]!;
    out[o++] = (thisSum * 3 + lastSum + 8) >> 4;
    out[o++] = (thisSum * 3 + nextSum + 7) >> 4;
    lastSum = thisSum;
    thisSum = nextSum;
  }
  out[o++] = (thisSum * 3 + lastSum + 8) >> 4;
  out[o] = (thisSum * 4 + 7) >> 4;
}

/** h1v2_fancy_upsample: as wide, from the nearer and the further input row; `bias` is 1 for the upper output row and 2 for the lower. */
export function upsampleH1V2(near: Uint8ClampedArray, nearAt: number, far: Uint8ClampedArray, farAt: number, width: number, bias: number, out: Uint8ClampedArray): void {
  for (let x = 0; x < width; x++) out[x] = (near[nearAt + x]! * 3 + far[farAt + x]! + bias) >> 2;
}

/** h2v1_upsample and h2v2_upsample's rows: each sample twice, which libjpeg uses where a component is too narrow for the filter. */
export function upsampleH2Box(row: Uint8ClampedArray, at: number, width: number, out: Uint8ClampedArray): void {
  for (let x = 0; x < width; x++) {
    const sample = row[at + x]!;
    out[2 * x] = sample;
    out[2 * x + 1] = sample;
  }
}
