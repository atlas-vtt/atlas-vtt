/** The side of the block a reduced decode averages into one pixel. */
export const BLOCK = 8;

/**
 * Averages RGBA rows into one pixel per 8 × 8 block. Where alpha varies inside a block, its colour
 * is weighted by alpha, so transparent pixels (whose colour nobody sees) do not tint it; alpha
 * itself is a plain average. Blocks cut off by the right or bottom edge average the pixels they
 * have. An image without alpha sums its colour alone.
 */
export class BlockAverager {
  readonly outputWidth: number;
  /** Per output pixel: weighted R, G, B, then alpha, then plain R, G, B. */
  private readonly sums: Float64Array;
  private rows = 0;

  constructor(private readonly width: number, private readonly hasAlpha: boolean) {
    this.outputWidth = Math.ceil(width / BLOCK);
    this.sums = new Float64Array(this.outputWidth * 7);
  }

  /** Whether a whole block's height of rows has been added. */
  get full(): boolean {
    return this.rows === BLOCK;
  }

  /** Adds one row of `width` RGBA pixels. */
  add(row: Uint8Array): void {
    if (this.hasAlpha) this.addWeighted(row);
    else this.addOpaque(row);
    this.rows++;
  }

  /** Writes the averaged row of blocks into `out` from `offset` and starts the next. */
  flush(out: Uint8Array, offset: number): void {
    const { sums, width, outputWidth } = this;
    for (let block = 0, s = 0, j = offset; block < outputWidth; block++, s += 7, j += 4) {
      const count = Math.min(BLOCK, width - block * BLOCK) * this.rows;
      if (!this.hasAlpha) {
        out[j] = Math.round(sums[s + 4]! / count);
        out[j + 1] = Math.round(sums[s + 5]! / count);
        out[j + 2] = Math.round(sums[s + 6]! / count);
        out[j + 3] = 255;
        continue;
      }
      const alpha = sums[s + 3]!;
      // A block with no visible pixel has no weight to give; its plain colour stands in.
      const [divisor, first] = alpha > 0 ? [alpha, s] : [count, s + 4];
      out[j] = Math.round(sums[first]! / divisor);
      out[j + 1] = Math.round(sums[first + 1]! / divisor);
      out[j + 2] = Math.round(sums[first + 2]! / divisor);
      out[j + 3] = Math.round(alpha / count);
    }
    sums.fill(0);
    this.rows = 0;
  }

  private addOpaque(row: Uint8Array): void {
    const { sums, width, outputWidth } = this;
    for (let block = 0, s = 0; block < outputWidth; block++, s += 7) {
      const end = Math.min(width, (block + 1) * BLOCK) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = block * BLOCK * 4; i < end; i += 4) {
        r += row[i]!;
        g += row[i + 1]!;
        b += row[i + 2]!;
      }
      sums[s + 4] = sums[s + 4]! + r;
      sums[s + 5] = sums[s + 5]! + g;
      sums[s + 6] = sums[s + 6]! + b;
    }
  }

  private addWeighted(row: Uint8Array): void {
    const { sums, width, outputWidth } = this;
    for (let block = 0, s = 0; block < outputWidth; block++, s += 7) {
      const end = Math.min(width, (block + 1) * BLOCK) * 4;
      let ra = 0;
      let ga = 0;
      let ba = 0;
      let alpha = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = block * BLOCK * 4; i < end; i += 4) {
        const a = row[i + 3]!;
        ra += row[i]! * a;
        ga += row[i + 1]! * a;
        ba += row[i + 2]! * a;
        alpha += a;
        r += row[i]!;
        g += row[i + 1]!;
        b += row[i + 2]!;
      }
      sums[s] = sums[s]! + ra;
      sums[s + 1] = sums[s + 1]! + ga;
      sums[s + 2] = sums[s + 2]! + ba;
      sums[s + 3] = sums[s + 3]! + alpha;
      sums[s + 4] = sums[s + 4]! + r;
      sums[s + 5] = sums[s + 5]! + g;
      sums[s + 6] = sums[s + 6]! + b;
    }
  }
}
