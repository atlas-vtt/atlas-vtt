/**
 * Two rows of a level halved into one row of the next: every 2 × 2 block becomes one pixel, its
 * colour the alpha-weighted mean of the block (so a transparent pixel lends no colour to its
 * neighbours, as a premultiplied resize does) and its alpha the plain mean. Level sizes round up,
 * so an odd width's last pixel is the mean of one column, and the last row of an odd height comes
 * alone (`below` null). Rows are RGBA with straight alpha, `width * 4` bytes; `out` holds
 * `ceil(width / 2) * 4`.
 */
export function halveRows(above: Uint8ClampedArray, below: Uint8ClampedArray | null, width: number, out: Uint8ClampedArray): void {
  const outWidth = Math.ceil(width / 2);
  for (let x = 0; x < outWidth; x++) {
    const left = x * 2 * 4;
    const twoColumns = x * 2 + 1 < width;
    let count = 0;
    let alpha = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    const add = (row: Uint8ClampedArray, at: number): void => {
      const a = row[at + 3]!;
      count += 1;
      alpha += a;
      red += row[at]! * a;
      green += row[at + 1]! * a;
      blue += row[at + 2]! * a;
    };
    add(above, left);
    if (twoColumns) add(above, left + 4);
    if (below) {
      add(below, left);
      if (twoColumns) add(below, left + 4);
    }
    const o = x * 4;
    if (alpha === 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
    } else {
      // Rounded half up by hand: a Uint8ClampedArray rounds half to even, which would turn one pixel's 7 into 8.
      out[o] = Math.floor((red + alpha / 2) / alpha);
      out[o + 1] = Math.floor((green + alpha / 2) / alpha);
      out[o + 2] = Math.floor((blue + alpha / 2) / alpha);
      out[o + 3] = Math.floor((alpha + count / 2) / count);
    }
  }
}
