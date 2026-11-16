import type { JpegHeader } from './jpegMarkers';

/** How a scan's MCUs tile the image: the largest sampling factors and the MCUs across and down. */
export interface JpegLayout {
  readonly hMax: number;
  readonly vMax: number;
  readonly mcusX: number;
  readonly mcusY: number;
}

/** A band's worth of output rows comes from one row of MCUs, `vMax` blocks tall (spec A.2.3). */
export function jpegLayout(header: JpegHeader): JpegLayout {
  const hMax = Math.max(...header.scan.map((c) => c.h));
  const vMax = Math.max(...header.scan.map((c) => c.v));
  return { hMax, vMax, mcusX: Math.ceil(header.width / (8 * hMax)), mcusY: Math.ceil(header.height / (8 * vMax)) };
}

/** Emits one band of decoded rows per MCU row; `band(n, out)` writes band `n` into `out` and returns its row count. */
export interface McuRowDecoder {
  readonly width: number;
  readonly bandRows: number;
  readonly bandCount: number;
  band(n: number, out: Uint8ClampedArray): number;
}
