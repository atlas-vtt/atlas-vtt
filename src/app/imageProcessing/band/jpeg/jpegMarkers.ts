import { BandUnsupportedError } from '../bandTypes';
import { readAppSegment, type JpegAppInfo } from './jpegAppSegments';
import { buildHuffmanTable, type HuffmanTable } from './jpegHuffman';
import { ZIGZAG } from './jpegZigzag';

export interface JpegFrameComponent {
  readonly id: number;
  readonly h: number;
  readonly v: number;
  readonly quantTable: number;
}

/** A component of the scan, in scan order, with the tables it decodes and dequantises with. */
export interface JpegScanComponent {
  readonly frameIndex: number;
  readonly h: number;
  readonly v: number;
  /** Dequantisation factors in natural (row-major) order. */
  readonly quant: Int32Array;
  readonly dc: HuffmanTable;
  readonly ac: HuffmanTable;
}

/** Everything before a baseline JPEG's one scan that decoding needs. */
export interface JpegHeader {
  readonly width: number;
  readonly height: number;
  readonly components: readonly JpegFrameComponent[];
  readonly scan: readonly JpegScanComponent[];
  readonly restartInterval: number;
  /** Offset of the scan's entropy-coded data. */
  readonly scanStart: number;
}

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly components: readonly JpegFrameComponent[];
}

interface Tables {
  readonly quant: (Int32Array | undefined)[];
  readonly dc: (HuffmanTable | undefined)[];
  readonly ac: (HuffmanTable | undefined)[];
  restartInterval: number;
}

const SAMPLING_OF_LUMA = new Set(['1x1', '2x1', '1x2', '2x2']);
/** Component ids libjpeg reads as RGB when neither JFIF nor Adobe names the colour space. */
const RGB_IDS = [0x52, 0x47, 0x42];

function corrupt(message: string): never {
  throw new BandUnsupportedError('corrupt', message);
}

/** Reads every segment up to the first scan and refuses what the band decoder does not read. */
export function readJpegHeader(bytes: Uint8Array): JpegHeader {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) corrupt('Not a JPEG: no start of image.');
  const tables: Tables = { quant: [], dc: [], ac: [], restartInterval: 0 };
  const app: JpegAppInfo = { sawJfif: false, adobeTransform: undefined, orientation: undefined };
  let frame: Frame | undefined;
  let pos = 2;
  for (;;) {
    // libjpeg's next_marker skips stray bytes and any number of 0xFF fill bytes before a marker.
    while (pos < bytes.length && bytes[pos] !== 0xff) pos++;
    while (pos < bytes.length && bytes[pos] === 0xff) pos++;
    if (pos >= bytes.length) corrupt('The file ends before its first scan.');
    const marker = bytes[pos++] ?? 0;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8 || marker === 0xd9) corrupt('The file holds no scan.');
    if (pos + 2 > bytes.length) corrupt('A segment is cut off.');
    const length = ((bytes[pos] ?? 0) << 8) | (bytes[pos + 1] ?? 0);
    const start = pos + 2;
    const end = pos + length;
    if (length < 2 || end > bytes.length) corrupt('A segment is cut off.');
    if (marker === 0xda) {
      if (!frame) corrupt('A scan comes before the frame header.');
      checkColourSpace(frame, app);
      return { ...frame, scan: readScan(bytes, start, end, frame, tables), restartInterval: tables.restartInterval, scanStart: end };
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (frame) corrupt('The file has a second frame header.');
      frame = readFrame(bytes, marker, start, end);
    } else if (marker === 0xc4) readHuffmanTables(bytes, start, end, tables);
    else if (marker === 0xdb) readQuantTables(bytes, start, end, tables);
    else if (marker === 0xdd) {
      if (length !== 4) corrupt('The restart interval segment has the wrong length.');
      tables.restartInterval = ((bytes[start] ?? 0) << 8) | (bytes[start + 1] ?? 0);
    } else if (marker === 0xcc || marker === 0xde || marker === 0xdf) {
      throw new BandUnsupportedError('coding', 'Arithmetic coding or a hierarchical JPEG.');
    } else if (marker === 0xdc) corrupt('A DNL segment before the scan.');
    else if (marker >= 0xe0 && marker <= 0xef) {
      readAppSegment(bytes, marker, start, end, app);
      // Values outside 1 to 8 are no orientation; browsers show such a file as stored.
      if (app.orientation !== undefined && app.orientation !== 1 && app.orientation >= 2 && app.orientation <= 8) {
        throw new BandUnsupportedError('orientation', `EXIF orientation ${app.orientation} turns or mirrors the stored rows.`);
      }
    }
    pos = end;
  }
}

function readFrame(bytes: Uint8Array, marker: number, start: number, end: number): Frame {
  if (marker === 0xc2) throw new BandUnsupportedError('progressive', 'A progressive JPEG.');
  if (marker !== 0xc0 && marker !== 0xc1) throw new BandUnsupportedError('coding', `Frame type 0x${marker.toString(16)} is lossless, hierarchical or arithmetic coded.`);
  if (end - start < 6) corrupt('The frame header is cut off.');
  const precision = bytes[start] ?? 0;
  if (precision !== 8) throw new BandUnsupportedError('coding', `${precision}-bit samples.`);
  const height = ((bytes[start + 1] ?? 0) << 8) | (bytes[start + 2] ?? 0);
  const width = ((bytes[start + 3] ?? 0) << 8) | (bytes[start + 4] ?? 0);
  const count = bytes[start + 5] ?? 0;
  if (height === 0) corrupt('The height is given by a DNL segment, which is not read.');
  if (width === 0) corrupt('The frame is 0 pixels wide.');
  if (count !== 1 && count !== 3) throw new BandUnsupportedError('components', `${count} components.`);
  if (end - start < 6 + 3 * count) corrupt('The frame header is cut off.');
  const components: JpegFrameComponent[] = [];
  for (let i = 0; i < count; i++) {
    const at = start + 6 + 3 * i;
    const sampling = bytes[at + 1] ?? 0;
    const component = { id: bytes[at] ?? 0, h: sampling >> 4, v: sampling & 15, quantTable: bytes[at + 2] ?? 0 };
    if (component.h < 1 || component.h > 4 || component.v < 1 || component.v > 4) corrupt('A sampling factor outside 1 to 4.');
    if (component.quantTable > 3) corrupt('A component names a quantisation table beyond the fourth.');
    if (components.some((other) => other.id === component.id)) corrupt('Two components share an id.');
    components.push(component);
  }
  const [luma, ...chroma] = components;
  if (count === 3 && (!SAMPLING_OF_LUMA.has(`${luma?.h}x${luma?.v}`) || chroma.some((c) => c.h !== 1 || c.v !== 1))) {
    throw new BandUnsupportedError('components', `Sampling ${components.map((c) => `${c.h}x${c.v}`).join(', ')}.`);
  }
  return { width, height, components };
}

/** Three components are read as YCbCr, so refuse what libjpeg would read as RGB (Adobe transform 0, or R, G, B ids). */
function checkColourSpace(frame: Frame, app: JpegAppInfo): void {
  if (frame.components.length !== 3) return;
  const rgb = app.adobeTransform !== undefined
    ? app.adobeTransform !== 1
    : !app.sawJfif && frame.components.every((c, i) => c.id === RGB_IDS[i]);
  if (rgb) throw new BandUnsupportedError('components', 'The components are RGB, not YCbCr.');
}

function readScan(bytes: Uint8Array, start: number, end: number, frame: Frame, tables: Tables): JpegScanComponent[] {
  const count = bytes[start] ?? 0;
  if (end - start !== 4 + 2 * count) corrupt('The scan header has the wrong length.');
  if (count !== frame.components.length) throw new BandUnsupportedError('scans', 'The first scan does not hold every component.');
  const spectral = start + 1 + 2 * count;
  if (bytes[spectral] !== 0 || bytes[spectral + 1] !== 63 || bytes[spectral + 2] !== 0) corrupt('A sequential scan with a partial spectrum.');
  const grey = count === 1;
  const scan: JpegScanComponent[] = [];
  for (let i = 0; i < count; i++) {
    const id = bytes[start + 1 + 2 * i];
    const selectors = bytes[start + 2 + 2 * i] ?? 0;
    const frameIndex = frame.components.findIndex((c) => c.id === id);
    const component = frame.components[frameIndex];
    if (!component || scan.some((s) => s.frameIndex === frameIndex)) corrupt('The scan names an unknown or repeated component.');
    const quant = tables.quant[component.quantTable];
    const dc = tables.dc[selectors >> 4];
    const ac = tables.ac[selectors & 15];
    if (!quant || !dc || !ac) corrupt('The scan uses a table that was never defined.');
    // A scan of one component is not interleaved: its MCU is one block whatever the factors say (spec A.2.2).
    scan.push({ frameIndex, h: grey ? 1 : component.h, v: grey ? 1 : component.v, quant, dc, ac });
  }
  return scan;
}

function readQuantTables(bytes: Uint8Array, start: number, end: number, tables: Tables): void {
  let pos = start;
  while (pos < end) {
    const spec = bytes[pos++] ?? 0;
    const wide = spec >> 4;
    const index = spec & 15;
    if (wide > 1 || index > 3) corrupt('A quantisation table with a bad precision or index.');
    if (pos + 64 * (wide + 1) > end) corrupt('A quantisation table is cut off.');
    const table = new Int32Array(64);
    for (let k = 0; k < 64; k++) {
      const value = wide ? ((bytes[pos] ?? 0) << 8) | (bytes[pos + 1] ?? 0) : bytes[pos] ?? 0;
      table[ZIGZAG[k] ?? 0] = value;
      pos += wide + 1;
    }
    tables.quant[index] = table;
  }
}

function readHuffmanTables(bytes: Uint8Array, start: number, end: number, tables: Tables): void {
  let pos = start;
  while (pos < end) {
    const spec = bytes[pos++] ?? 0;
    const tableClass = spec >> 4;
    const index = spec & 15;
    if (tableClass > 1 || index > 3) corrupt('A Huffman table with a bad class or index.');
    if (pos + 16 > end) corrupt('A Huffman table is cut off.');
    const counts = bytes.slice(pos, pos + 16);
    pos += 16;
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total > 256 || pos + total > end) corrupt('A Huffman table is cut off or too long.');
    const table = buildHuffmanTable(counts, bytes.slice(pos, pos + total));
    pos += total;
    (tableClass === 0 ? tables.dc : tables.ac)[index] = table;
  }
}
