/**
 * Reverses a scanline's filter (PNG spec, 9.2). `line` and `previous` hold the filter type byte at
 * index 0 and the scanline's bytes after it; `previous` is all zeros for the first scanline, which
 * is how the spec treats the row above it. `bytesPerPixel` is the spec's bpp: the bytes of one
 * pixel rounded up, and 1 for depths below 8 bits.
 */
export function unfilterLine(line: Uint8Array, previous: Uint8Array, bytesPerPixel: number): boolean {
  const filter = line[0]!;
  const length = line.length;
  switch (filter) {
    case 0:
      return true;
    case 1:
      for (let i = 1 + bytesPerPixel; i < length; i++) line[i] = line[i]! + line[i - bytesPerPixel]!;
      return true;
    case 2:
      for (let i = 1; i < length; i++) line[i] = line[i]! + previous[i]!;
      return true;
    case 3:
      unfilterAverage(line, previous, bytesPerPixel);
      return true;
    case 4:
      unfilterPaeth(line, previous, bytesPerPixel);
      return true;
    default:
      return false;
  }
}

function unfilterAverage(line: Uint8Array, previous: Uint8Array, bytesPerPixel: number): void {
  const length = line.length;
  const first = Math.min(length, 1 + bytesPerPixel);
  for (let i = 1; i < first; i++) line[i] = line[i]! + (previous[i]! >> 1);
  for (let i = first; i < length; i++) line[i] = line[i]! + ((line[i - bytesPerPixel]! + previous[i]!) >> 1);
}

/**
 * The Paeth predictor (PNG spec, 9.4), written with the distances it compares worked out and the
 * choice made with masks instead of branches: on photographic rows the branches mispredict so often
 * that this loop was five times slower than the other filters.
 */
function unfilterPaeth(line: Uint8Array, previous: Uint8Array, bytesPerPixel: number): void {
  const length = line.length;
  const first = Math.min(length, 1 + bytesPerPixel);
  // Without a left neighbour a and c are 0, so the predictor is b.
  for (let i = 1; i < first; i++) line[i] = line[i]! + previous[i]!;
  for (let i = first; i < length; i++) {
    const a = line[i - bytesPerPixel]!;
    const b = previous[i]!;
    const c = previous[i - bytesPerPixel]!;
    const db = b - c;
    const da = a - c;
    const dc = da + db;
    const pa = (db ^ (db >> 31)) - (db >> 31);
    const pb = (da ^ (da >> 31)) - (da >> 31);
    const pc = (dc ^ (dc >> 31)) - (dc >> 31);
    // notA is all ones when pa > pb or pa > pc; useC when pb > pc.
    const notA = ((pb - pa) | (pc - pa)) >> 31;
    const useC = (pc - pb) >> 31;
    line[i] = line[i]! + ((a & ~notA) | (((b & ~useC) | (c & useC)) & notA));
  }
}
