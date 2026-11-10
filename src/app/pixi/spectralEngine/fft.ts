/**
 * Minimal radix-2 FFT used by grid auto-detection. Sizes must be powers of two.
 */

/** In-place iterative FFT on separate real/imaginary arrays. */
export function fftInPlace(re: Float32Array, im: Float32Array, inverse: boolean = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    const half = len >> 1;
    for (let start = 0; start < n; start += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const tRe = re[b]! * curRe - im[b]! * curIm;
        const tIm = re[b]! * curIm + im[b]! * curRe;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

/**
 * Power spectrum of a real n×n image (row-major). The result is centred so the
 * DC term sits at (n/2, n/2); index as `power[v * n + u]`.
 */
export function powerSpectrum2D(image: Float32Array, n: number): Float32Array {
  const re = Float32Array.from(image);
  const im = new Float32Array(n * n);
  const rowRe = new Float32Array(n);
  const rowIm = new Float32Array(n);

  for (let y = 0; y < n; y++) {
    rowRe.set(re.subarray(y * n, y * n + n));
    rowIm.fill(0);
    fftInPlace(rowRe, rowIm);
    re.set(rowRe, y * n);
    im.set(rowIm, y * n);
  }

  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      rowRe[y] = re[y * n + x]!;
      rowIm[y] = im[y * n + x]!;
    }
    fftInPlace(rowRe, rowIm);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = rowRe[y]!;
      im[y * n + x] = rowIm[y]!;
    }
  }

  const half = n / 2;
  const power = new Float32Array(n * n);
  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      const su = (u + half) % n;
      const sv = (v + half) % n;
      const i = sv * n + su;
      power[v * n + u] = re[i]! * re[i]! + im[i]! * im[i]!;
    }
  }
  return power;
}
