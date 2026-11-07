import { greyToRgba, ycbcrToRgba } from './jpegColor';
import { EntropyReader } from './jpegEntropy';
import { dcOnlySample, fillBlock, idctBlock } from './jpegIdct';
import { jpegLayout, type JpegLayout, type McuRowDecoder } from './jpegLayout';
import type { JpegHeader, JpegScanComponent } from './jpegMarkers';
import { upsampleH1V2, upsampleH2Box, upsampleH2V1, upsampleH2V2 } from './jpegUpsample';

/** One component's samples: two MCU rows in turn, so the row below a band is decoded before the band is emitted. */
interface Plane {
  readonly scan: JpegScanComponent;
  readonly scanIndex: number;
  readonly stride: number;
  /** Sample rows per MCU row. */
  readonly rows: number;
  /** The component's own size in samples (libjpeg's `downsampled_width` and `downsampled_height`). */
  readonly width: number;
  readonly height: number;
  readonly hRatio: number;
  readonly vRatio: number;
  readonly slots: readonly [Uint8ClampedArray, Uint8ClampedArray];
  /** The last row of the MCU row above, which the upsampler reads for the band's first row. */
  readonly above: Uint8ClampedArray;
  readonly upsampled: Uint8ClampedArray;
}

/**
 * Decodes every pixel. libjpeg's fancy vertical upsampling reads one chroma row beyond the MCU row on
 * either side ("context rows", jdmainct.c), so band `n` is emitted only once MCU row `n + 1` is decoded.
 * At the image's top and bottom the context row is the first or last real row, as libjpeg repeats it.
 */
export class FullResolutionDecoder implements McuRowDecoder {
  readonly width: number;
  readonly bandRows: number;
  readonly bandCount: number;
  private readonly layout: JpegLayout;
  private readonly height: number;
  private readonly reader: EntropyReader;
  private readonly planes: readonly Plane[];
  /** The planes in frame order: Y, then Cb and Cr. */
  private readonly colour: readonly Plane[];
  private readonly coef = new Int32Array(64);
  private readonly work = new Int32Array(64);

  constructor(header: JpegHeader, bytes: Uint8Array) {
    this.layout = jpegLayout(header);
    const { hMax, vMax, mcusX, mcusY } = this.layout;
    this.width = header.width;
    this.height = header.height;
    this.bandRows = 8 * vMax;
    this.bandCount = mcusY;
    this.reader = new EntropyReader(bytes, header.scanStart, header.restartInterval);
    this.planes = header.scan.map((scan, scanIndex): Plane => {
      const stride = mcusX * scan.h * 8;
      const rows = scan.v * 8;
      return {
        scan,
        scanIndex,
        stride,
        rows,
        width: Math.ceil((header.width * scan.h) / hMax),
        height: Math.ceil((header.height * scan.v) / vMax),
        hRatio: hMax / scan.h,
        vRatio: vMax / scan.v,
        slots: [new Uint8ClampedArray(stride * rows), new Uint8ClampedArray(stride * rows)],
        above: new Uint8ClampedArray(stride),
        upsampled: new Uint8ClampedArray(stride * (hMax / scan.h)),
      };
    });
    this.colour = [...this.planes].sort((a, b) => a.scan.frameIndex - b.scan.frameIndex);
  }

  band(n: number, out: Uint8ClampedArray): number {
    if (n === 0) this.decodeMcuRow(0);
    for (const plane of this.planes) {
      if (plane.vRatio === 1) continue;
      const source = n === 0 ? slotOf(plane, 0) : slotOf(plane, n - 1).subarray((plane.rows - 1) * plane.stride);
      plane.above.set(source.subarray(0, plane.stride));
    }
    if (n + 1 < this.bandCount) this.decodeMcuRow(n + 1);
    const rows = Math.min(this.bandRows, this.height - n * this.bandRows);
    const [luma, cb, cr] = this.colour;
    if (!luma) return rows;
    for (let r = 0; r < rows; r++) {
      const at = r * this.width * 4;
      if (!cb || !cr) {
        greyToRgba(slotOf(luma, n), r * luma.stride, this.width, out, at);
        continue;
      }
      const blue = this.chromaRow(cb, n, r);
      const red = this.chromaRow(cr, n, r);
      ycbcrToRgba(slotOf(luma, n), r * luma.stride, blue, blue === cb.upsampled ? 0 : r * cb.stride, red, red === cr.upsampled ? 0 : r * cr.stride, this.width, out, at);
    }
    return rows;
  }

  /** The chroma samples of output row `r` of band `n`: the plane's own row where it is not subsampled, else `upsampled`. */
  private chromaRow(plane: Plane, n: number, r: number): Uint8ClampedArray {
    const slot = slotOf(plane, n);
    if (plane.vRatio === 1) {
      if (plane.hRatio === 1) return slot;
      if (plane.width > 2) upsampleH2V1(slot, r * plane.stride, plane.width, plane.upsampled);
      else upsampleH2Box(slot, r * plane.stride, plane.width, plane.upsampled);
      return plane.upsampled;
    }
    const near = r >> 1;
    const far = r & 1 ? near + 1 : near - 1;
    if (plane.hRatio === 2 && plane.width <= 2) {
      upsampleH2Box(slot, near * plane.stride, plane.width, plane.upsampled);
      return plane.upsampled;
    }
    const farRow = this.contextRow(plane, n, far);
    const farAt = farRow === slot ? this.clampedRow(plane, n, far) * plane.stride : 0;
    if (plane.hRatio === 2) upsampleH2V2(slot, near * plane.stride, farRow, farAt, plane.width, plane.upsampled);
    else upsampleH1V2(slot, near * plane.stride, farRow, farAt, plane.width, r & 1 ? 2 : 1, plane.upsampled);
    return plane.upsampled;
  }

  /** Where row `i` of MCU row `n` lies, `i` from -1 to `rows`: the row above, this MCU row's slot, or the next MCU row's. */
  private contextRow(plane: Plane, n: number, i: number): Uint8ClampedArray {
    const local = this.clampedRow(plane, n, i);
    if (local < 0) return plane.above;
    return slotOf(plane, local < plane.rows ? n : n + 1);
  }

  /** Row `i` of MCU row `n` moved inside the component's real rows, as libjpeg repeats its first and last row. */
  private clampedRow(plane: Plane, n: number, i: number): number {
    const first = n * plane.rows;
    return Math.min(Math.max(first + i, 0), plane.height - 1) - first;
  }

  /** Decodes MCU row `n` into its plane slots. */
  private decodeMcuRow(n: number): void {
    const reader = this.reader;
    const { coef, work } = this;
    for (let mx = 0; mx < this.layout.mcusX; mx++) {
      reader.startMcu();
      for (const plane of this.planes) {
        const { scan, stride } = plane;
        const samples = slotOf(plane, n);
        for (let by = 0; by < scan.v; by++) {
          for (let bx = 0; bx < scan.h; bx++) {
            const dc = reader.decodeDc(scan.dc, plane.scanIndex);
            const last = reader.decodeAc(scan.ac, coef);
            const offset = by * 8 * stride + (mx * scan.h + bx) * 8;
            if (last === 0) fillBlock(dcOnlySample(dc, scan.quant), samples, offset, stride);
            else {
              coef[0] = dc;
              idctBlock(coef, scan.quant, work, samples, offset, stride);
            }
          }
        }
      }
    }
    reader.checkNotPastEnd();
  }
}

/** The slot MCU row `n` is decoded into: even rows in the first, odd rows in the second. */
function slotOf(plane: Plane, n: number): Uint8ClampedArray {
  return n & 1 ? plane.slots[1] : plane.slots[0];
}
