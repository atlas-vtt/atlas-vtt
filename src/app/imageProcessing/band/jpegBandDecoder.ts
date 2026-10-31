import type { BandDecodeOptions, BandDecoder, BandImageInfo } from './bandTypes';
import { FullResolutionDecoder } from './jpeg/jpegFullDecode';
import { readJpegHeader } from './jpeg/jpegMarkers';
import { ReducedDecoder } from './jpeg/jpegReducedDecode';

/**
 * Baseline JPEGs (SOF0 and SOF1, 8-bit, Huffman coded, one interleaved scan) decoded a row of MCUs
 * at a time, with libjpeg-turbo's default IDCT and upsampling so the pixels match Chromium's.
 */
export const jpegBandDecoder: BandDecoder = {
  inspect(bytes: Uint8Array): BandImageInfo {
    const header = readJpegHeader(bytes);
    return { width: header.width, height: header.height, hasAlpha: false };
  },

  async decode(bytes: Uint8Array, { reduce, onBand, signal }: BandDecodeOptions): Promise<void> {
    const header = readJpegHeader(bytes);
    const decoder = reduce === 8 ? new ReducedDecoder(header, bytes) : new FullResolutionDecoder(header, bytes);
    const { width, bandRows } = decoder;
    const data = new Uint8ClampedArray(width * bandRows * 4);
    for (let n = 0; n < decoder.bandCount; n++) {
      throwIfAborted(signal);
      const rows = decoder.band(n, data);
      await onBand({ y: n * bandRows, rows, width, data: rows === bandRows ? data : data.subarray(0, width * rows * 4) });
    }
    throwIfAborted(signal);
  },
};

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The decode was aborted.', 'AbortError');
}
