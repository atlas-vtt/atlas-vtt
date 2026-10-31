import type { Band, BandDecoder, BandDecodeOptions, BandImageInfo } from '../../../../src/app/imageProcessing/band/bandTypes';
import { reducedSize } from '../../../../src/app/imageProcessing/band/bandTypes';

/** A deterministic RGBA image: a gradient with a transparent stripe, so halving and alpha show. */
export function pixelAt(x: number, y: number, width: number): [number, number, number, number] {
  return [(x * 3 + y) & 255, (y * 5) & 255, (x ^ y) & 255, x >= width / 4 && x < width / 3 ? 0 : 255];
}

export function wholeImage(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixelAt(x, y, width), (y * width + x) * 4);
  }
  return data;
}

/** The image at an eighth as the fake reduces it: each 8 × 8 block's plain mean, the block's own pixels only at the edges. */
export function reducedImage(width: number, height: number): Uint8ClampedArray {
  const { width: w, height: h } = reducedSize({ width, height }, 8);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sums = [0, 0, 0, 0];
      let count = 0;
      for (let dy = 0; dy < 8 && y * 8 + dy < height; dy++) {
        for (let dx = 0; dx < 8 && x * 8 + dx < width; dx++) {
          const p = pixelAt(x * 8 + dx, y * 8 + dy, width);
          for (let c = 0; c < 4; c++) sums[c]! += p[c]!;
          count++;
        }
      }
      data.set(sums.map((sum) => Math.round(sum / count)), (y * w + x) * 4);
    }
  }
  return data;
}

export interface FakeDecoderOptions {
  width: number;
  height: number;
  /** Rows per band at reduce 1 (at 8, an eighth of it, at least 1). */
  bandRows?: number;
  /** Called before each band; a test can stop the decode here. */
  beforeBand?: (y: number, reduce: 1 | 8) => void | Promise<void>;
}

/** A band decoder of the deterministic image, ignoring its bytes but for their length. */
export function fakeBandDecoder(options: FakeDecoderOptions): BandDecoder & { decodes: Array<1 | 8> } {
  const { width, height, bandRows = 37 } = options;
  const decodes: Array<1 | 8> = [];
  return {
    decodes,
    inspect: (): BandImageInfo => ({ width, height, hasAlpha: true }),
    async decode(_bytes: Uint8Array, { reduce, onBand, signal }: BandDecodeOptions): Promise<void> {
      decodes.push(reduce);
      const image = reduce === 1 ? wholeImage(width, height) : reducedImage(width, height);
      const size = reducedSize({ width, height }, reduce);
      const rows = reduce === 1 ? bandRows : Math.max(1, Math.floor(bandRows / 8));
      for (let y = 0; y < size.height; y += rows) {
        await options.beforeBand?.(y, reduce);
        signal?.throwIfAborted();
        const take = Math.min(rows, size.height - y);
        const band: Band = { y, rows: take, width: size.width, data: image.subarray(y * size.width * 4, (y + take) * size.width * 4) };
        await onBand(band);
      }
    },
  };
}
