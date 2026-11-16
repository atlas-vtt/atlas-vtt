import { type Band, type BandDecodeOptions, type BandDecoder, type BandImageInfo, BandUnsupportedError, reducedSize } from './bandTypes';
import { BLOCK, BlockAverager } from './png/pngBlockAverage';
import { pngHasAlpha, readPngStructure, type PngStructure } from './png/pngChunks';
import { inflateImageData } from './png/pngInflate';
import { PixelConverter } from './png/pngPixels';
import { unfilterLine } from './png/pngUnfilter';

/** Rows of a full-size band; a reduced decode emits bands of `BAND_ROWS / BLOCK` rows, from as many source rows. */
const BAND_ROWS = 64;

/** Where each decoded RGBA row goes: straight into the band, or through the block averager. */
interface RowSink {
  /** The buffer source rows are converted into: the band itself, or one row for the averager. */
  readonly out: Uint8Array;
  /** Where in `out` source row `y` goes. */
  readonly offsetOf: (y: number) => number;
  /** Called after row `y` is written; resolves once any band it completed has been handed on. */
  readonly rowDone: (y: number) => Promise<void> | null;
}

class BandEmitter {
  private readonly data: Uint8ClampedArray;
  readonly bytes: Uint8Array;
  private y = 0;

  constructor(readonly width: number, height: number, bandRows: number, private readonly options: BandDecodeOptions) {
    this.data = new Uint8ClampedArray(width * Math.min(bandRows, height) * 4);
    this.bytes = new Uint8Array(this.data.buffer);
  }

  /** Hands on the band of output rows from the last one handed on up to `end`. */
  async emit(end: number): Promise<void> {
    const rows = end - this.y;
    const band: Band = { y: this.y, rows, width: this.width, data: this.data.subarray(0, this.width * rows * 4) };
    this.y = end;
    await this.options.onBand(band);
    this.options.signal?.throwIfAborted();
  }
}

function fullSizeSink(png: PngStructure, emitter: BandEmitter): RowSink {
  const rowBytes = png.width * 4;
  return {
    out: emitter.bytes,
    offsetOf: (y) => (y % BAND_ROWS) * rowBytes,
    rowDone: (y) => ((y + 1) % BAND_ROWS === 0 || y + 1 === png.height ? emitter.emit(y + 1) : null),
  };
}

function reducedSink(png: PngStructure, emitter: BandEmitter): RowSink {
  const rgba = new Uint8Array(png.width * 4);
  const averager = new BlockAverager(png.width, pngHasAlpha(png));
  const bandRows = BAND_ROWS / BLOCK;
  return {
    out: rgba,
    offsetOf: () => 0,
    rowDone: (y) => {
      averager.add(rgba);
      const last = y + 1 === png.height;
      if (!averager.full && !last) return null;
      const outputRow = Math.floor(y / BLOCK);
      averager.flush(emitter.bytes, (outputRow % bandRows) * averager.outputWidth * 4);
      return (outputRow + 1) % bandRows === 0 || last ? emitter.emit(outputRow + 1) : null;
    },
  };
}

function corruptData(message: string): BandUnsupportedError {
  return new BandUnsupportedError('corrupt', message);
}

/** The next inflated chunk, with the inflater's errors (damaged compressed data) told as corrupt. */
async function nextChunk(chunks: AsyncGenerator<Uint8Array>): Promise<Uint8Array | null> {
  try {
    const next = await chunks.next();
    return next.done ? null : next.value;
  } catch (error) {
    throw corruptData(`The PNG's image data is damaged: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Inflates, unfilters and converts the scanlines in order, holding only the current and previous
 * scanline besides the band. A scanline is the filter byte and `ceil(width × bits per pixel / 8)`
 * bytes (PNG spec, 7.2).
 */
async function decodeRows(bytes: Uint8Array, png: PngStructure, sink: RowSink): Promise<void> {
  const lineLength = 1 + Math.ceil((png.width * png.bitsPerPixel) / 8);
  const bytesPerPixel = Math.max(1, png.bitsPerPixel >> 3);
  const converter = new PixelConverter(png);
  let line = new Uint8Array(lineLength);
  let previous = new Uint8Array(lineLength);
  let filled = 0;
  let y = 0;
  const chunks = inflateImageData(bytes, png.imageData);
  try {
    for (let chunk = await nextChunk(chunks); chunk; chunk = await nextChunk(chunks)) {
      let at = 0;
      while (at < chunk.length) {
        const take = Math.min(lineLength - filled, chunk.length - at);
        line.set(chunk.subarray(at, at + take), filled);
        filled += take;
        at += take;
        if (filled < lineLength) break;
        if (!unfilterLine(line, previous, bytesPerPixel)) throw corruptData(`Row ${y} of the PNG has an unknown filter type.`);
        converter.convert(line, sink.out, sink.offsetOf(y));
        [line, previous] = [previous, line];
        filled = 0;
        const handedOn = sink.rowDone(y);
        if (handedOn) await handedOn;
        if (++y === png.height) return;
      }
    }
  } finally {
    await chunks.return(undefined);
  }
  throw corruptData(`The PNG's image data ends after ${y} of ${png.height} rows.`);
}

/** Reads non-interlaced PNGs of every colour type and bit depth in bands of rows, as 8-bit RGBA. */
export const pngBandDecoder: BandDecoder = {
  inspect(bytes: Uint8Array): BandImageInfo {
    const png = readPngStructure(bytes);
    return { width: png.width, height: png.height, hasAlpha: pngHasAlpha(png) };
  },

  async decode(bytes: Uint8Array, options: BandDecodeOptions): Promise<void> {
    options.signal?.throwIfAborted();
    const png = readPngStructure(bytes);
    const reduced = options.reduce === BLOCK;
    const { width, height } = reducedSize(png, options.reduce);
    const emitter = new BandEmitter(width, height, BAND_ROWS / options.reduce, options);
    const sink = reduced ? reducedSink(png, emitter) : fullSizeSink(png, emitter);
    await decodeRows(bytes, png, sink);
  },
};
