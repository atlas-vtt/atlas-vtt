import { greyToRgba, ycbcrToRgba } from './jpegColor';
import { EntropyReader } from './jpegEntropy';
import { idct2x2, reducedSample } from './jpegIdctReduced';
import { jpegLayout, type JpegLayout, type McuRowDecoder } from './jpegLayout';
import type { JpegHeader, JpegScanComponent } from './jpegMarkers';

/** One component's samples for one MCU row at 1/8 scale: a sample per luma block, whatever its sampling. */
interface BlockRow {
  readonly scan: JpegScanComponent;
  readonly scanIndex: number;
  /** Samples per block across and down: 2 where the component has half the luma's resolution that way. */
  readonly across: number;
  readonly down: number;
  readonly samples: Uint8ClampedArray;
}

/**
 * Decodes at 1/8 scale: a sample per luma block from its DC term alone, the AC terms read past and
 * never transformed. A subsampled chroma block gives a sample per luma block it covers through
 * libjpeg's 2-point reduced transform, as libjpeg does for 4:2:0 (`jpeg_idct_2x2`). For 4:2:2 and
 * 4:4:0 libjpeg spreads the chroma DC over both luma blocks instead; the same transform along the
 * subsampled axis alone gives each luma block the mean of the chroma it covers, which the block
 * means of the full image hold to far better where chroma has detail.
 */
export class ReducedDecoder implements McuRowDecoder {
  readonly width: number;
  readonly bandRows: number;
  readonly bandCount: number;
  private readonly layout: JpegLayout;
  private readonly height: number;
  private readonly stride: number;
  private readonly reader: EntropyReader;
  private readonly blockRows: readonly BlockRow[];
  private readonly colour: readonly BlockRow[];
  private readonly coef = new Int32Array(64);
  private readonly work = new Int32Array(16);
  private readonly quad = new Uint8ClampedArray(4);

  constructor(header: JpegHeader, bytes: Uint8Array) {
    this.layout = jpegLayout(header);
    const { hMax, vMax, mcusX, mcusY } = this.layout;
    this.width = Math.ceil(header.width / 8);
    this.height = Math.ceil(header.height / 8);
    this.bandRows = vMax;
    this.bandCount = mcusY;
    this.stride = mcusX * hMax;
    this.reader = new EntropyReader(bytes, header.scanStart, header.restartInterval);
    this.blockRows = header.scan.map((scan, scanIndex): BlockRow => ({
      scan,
      scanIndex,
      across: hMax / scan.h,
      down: vMax / scan.v,
      samples: new Uint8ClampedArray(this.stride * vMax),
    }));
    this.colour = [...this.blockRows].sort((a, b) => a.scan.frameIndex - b.scan.frameIndex);
  }

  band(n: number, out: Uint8ClampedArray): number {
    this.decodeMcuRow();
    const rows = Math.min(this.bandRows, this.height - n * this.bandRows);
    const [luma, cb, cr] = this.colour;
    if (!luma) return rows;
    for (let r = 0; r < rows; r++) {
      const at = r * this.stride;
      if (!cb || !cr) greyToRgba(luma.samples, at, this.width, out, r * this.width * 4);
      else ycbcrToRgba(luma.samples, at, cb.samples, at, cr.samples, at, this.width, out, r * this.width * 4);
    }
    return rows;
  }

  private decodeMcuRow(): void {
    const { reader, coef, stride } = this;
    for (let mx = 0; mx < this.layout.mcusX; mx++) {
      reader.startMcu();
      for (const row of this.blockRows) {
        const { scan, across, down, samples } = row;
        for (let by = 0; by < scan.v; by++) {
          for (let bx = 0; bx < scan.h; bx++) {
            const dc = reader.decodeDc(scan.dc, row.scanIndex);
            const offset = by * down * stride + (mx * scan.h + bx) * across;
            if (across === 1 && down === 1) {
              reader.skipAc(scan.ac);
              samples[offset] = reducedSample(dc, scan.quant);
            } else {
              reader.decodeAc(scan.ac, coef);
              coef[0] = dc;
              this.writeHalves(row, offset);
            }
          }
        }
      }
    }
    reader.checkNotPastEnd();
  }

  /** Writes a subsampled block's `across` × `down` samples. Along an axis it is not halved, only the mean counts: its AC terms are dropped. */
  private writeHalves(row: BlockRow, offset: number): void {
    const { coef, quad, stride } = this;
    if (row.down === 1) coef.fill(0, 8);
    if (row.across === 1) for (let k = 0; k < 64; k += 8) coef.fill(0, k + 1, k + 8);
    idct2x2(coef, row.scan.quant, this.work, quad);
    const samples = row.samples;
    samples[offset] = quad[0]!;
    if (row.across === 2) samples[offset + 1] = quad[1]!;
    if (row.down === 2) {
      samples[offset + stride] = quad[2]!;
      if (row.across === 2) samples[offset + stride + 1] = quad[3]!;
    }
  }
}
