import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type Band, BandUnsupportedError, reducedSize } from '../../../src/app/imageProcessing/band/bandTypes';
import { pngBandDecoder } from '../../../src/app/imageProcessing/band/pngBandDecoder';

const FIXTURES = new URL('../../fixtures/images/', import.meta.url);

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, FIXTURES)));
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

interface PngSpec {
  width: number;
  height: number;
  colourType: 0 | 2 | 3 | 4 | 6;
  bitDepth: 1 | 2 | 4 | 8 | 16;
  /** The sample of channel `c` of pixel (x, y), within the bit depth. */
  sample: (x: number, y: number, c: number) => number;
  palette?: number[][];
  trns?: number[];
  interlace?: 0 | 1;
  /** Bytes per IDAT chunk, so rows straddle chunks. */
  idatSize?: number;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, 'latin1'), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Raw scanlines packed by the spec, each filtered with type `y % 5`, so all five filters are read back. */
function scanlines(spec: PngSpec): Uint8Array {
  const channels = CHANNELS[spec.colourType]!;
  const bits = channels * spec.bitDepth;
  const rowBytes = Math.ceil((spec.width * bits) / 8);
  const bpp = Math.max(1, bits >> 3);
  const out = new Uint8Array(spec.height * (rowBytes + 1));
  let previous = new Uint8Array(rowBytes);
  for (let y = 0; y < spec.height; y++) {
    const raw = new Uint8Array(rowBytes);
    for (let x = 0; x < spec.width; x++) {
      for (let c = 0; c < channels; c++) {
        const value = spec.sample(x, y, c);
        const bit = (x * channels + c) * spec.bitDepth;
        if (spec.bitDepth === 16) {
          raw[bit >> 3] = value >> 8;
          raw[(bit >> 3) + 1] = value & 255;
        } else {
          raw[bit >> 3]! |= value << (8 - spec.bitDepth - (bit & 7));
        }
      }
    }
    const filter = y % 5;
    const base = y * (rowBytes + 1);
    out[base] = filter;
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? raw[i - bpp]! : 0;
      const b = previous[i]!;
      const c = i >= bpp ? previous[i - bpp]! : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]!;
      out[base + 1 + i] = (raw[i]! - predictor) & 255;
    }
    previous = raw;
  }
  return out;
}

function encodePng(spec: PngSpec): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, spec.width);
  view.setUint32(4, spec.height);
  header.set([spec.bitDepth, spec.colourType, 0, 0, spec.interlace ?? 0], 8);
  const compressed = deflateSync(scanlines(spec));
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header)];
  if (spec.palette) parts.push(chunk('PLTE', new Uint8Array(spec.palette.flat())));
  if (spec.trns) parts.push(chunk('tRNS', new Uint8Array(spec.trns)));
  const size = spec.idatSize ?? compressed.length;
  for (let at = 0; at < compressed.length; at += size) parts.push(chunk('IDAT', compressed.subarray(at, at + size)));
  parts.push(chunk('IEND', new Uint8Array(0)));
  return new Uint8Array(Buffer.concat(parts));
}

/** What the decoder should give for a pixel, worked out from the spec's rules directly. */
function expectedPixel(spec: PngSpec, x: number, y: number): [number, number, number, number] {
  const s = (c: number): number => spec.sample(x, y, c);
  const to8 = (v: number): number => (spec.bitDepth === 16 ? v >> 8 : Math.round((v * 255) / ((1 << spec.bitDepth) - 1)));
  const key = (i: number): number | undefined => (spec.trns ? (spec.trns[i * 2]! << 8) | spec.trns[i * 2 + 1]! : undefined);
  switch (spec.colourType) {
    case 0:
      return [to8(s(0)), to8(s(0)), to8(s(0)), s(0) === key(0) ? 0 : 255];
    case 2:
      return [to8(s(0)), to8(s(1)), to8(s(2)), s(0) === key(0) && s(1) === key(1) && s(2) === key(2) ? 0 : 255];
    case 3: {
      const [r, g, b] = spec.palette![s(0)]!;
      return [r!, g!, b!, spec.trns?.[s(0)] ?? 255];
    }
    case 4:
      return [to8(s(0)), to8(s(0)), to8(s(0)), to8(s(1))];
    case 6:
      return [to8(s(0)), to8(s(1)), to8(s(2)), to8(s(3))];
  }
}

function expectedImage(spec: PngSpec): Uint8Array {
  const out = new Uint8Array(spec.width * spec.height * 4);
  for (let y = 0; y < spec.height; y++) {
    for (let x = 0; x < spec.width; x++) out.set(expectedPixel(spec, x, y), (y * spec.width + x) * 4);
  }
  return out;
}

/** A box average of 8 × 8 blocks, colour weighted by alpha where any is visible. */
function boxAverage(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const { width: w, height: h } = reducedSize({ width, height }, 8);
  const out = new Uint8Array(w * h * 4);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      const weighted = [0, 0, 0];
      const plain = [0, 0, 0];
      let alpha = 0;
      let count = 0;
      for (let y = by * 8; y < Math.min(height, by * 8 + 8); y++) {
        for (let x = bx * 8; x < Math.min(width, bx * 8 + 8); x++) {
          const i = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            weighted[c]! += rgba[i + c]! * rgba[i + 3]!;
            plain[c]! += rgba[i + c]!;
          }
          alpha += rgba[i + 3]!;
          count++;
        }
      }
      const colour = alpha > 0 ? weighted.map((v) => Math.round(v / alpha)) : plain.map((v) => Math.round(v / count));
      out.set([...colour, Math.round(alpha / count)], (by * w + bx) * 4);
    }
  }
  return out;
}

interface Decoded {
  bands: Array<Pick<Band, 'y' | 'rows' | 'width'>>;
  pixels: Uint8Array;
}

async function decodeAll(bytes: Uint8Array, reduce: 1 | 8): Promise<Decoded> {
  const size = reducedSize(pngBandDecoder.inspect(bytes), reduce);
  const pixels = new Uint8Array(size.width * size.height * 4);
  const bands: Decoded['bands'] = [];
  await pngBandDecoder.decode(bytes, {
    reduce,
    onBand: (band) => {
      expect(band.data.length).toBe(band.width * band.rows * 4);
      bands.push({ y: band.y, rows: band.rows, width: band.width });
      pixels.set(band.data, band.y * band.width * 4);
    },
  });
  return { bands, pixels };
}

async function refusal(promiseOrCall: Promise<unknown> | (() => unknown)): Promise<BandUnsupportedError> {
  try {
    await (typeof promiseOrCall === 'function' ? promiseOrCall() : promiseOrCall);
  } catch (error) {
    expect(error).toBeInstanceOf(BandUnsupportedError);
    return error as BandUnsupportedError;
  }
  throw new Error('expected a refusal');
}

const pattern = (x: number, y: number, c: number): number => (x * 7 + y * 13 + c * 61 + ((x * y) >> 3)) & 255;

const RGBA_SPEC: PngSpec = { width: 1000, height: 333, colourType: 6, bitDepth: 8, sample: pattern, idatSize: 4099 };

describe('pngBandDecoder', () => {
  it.each([
    ['rgb8.png', false], ['rgba8.png', true], ['gray8.png', false], ['gray16.png', false], ['gray1.png', false],
    ['graya8.png', true], ['palette8.png', false], ['palette4-trns.png', true], ['rgb8-trns.png', true],
  ])('inspects %s', async (name, hasAlpha) => {
    const bytes = fixture(name);
    expect(pngBandDecoder.inspect(bytes)).toEqual({ width: 97, height: 61, hasAlpha });
    const { bands } = await decodeAll(bytes, 1);
    expect(bands).toEqual([{ y: 0, rows: 61, width: 97 }]);
  });

  it('refuses an interlaced PNG', async () => {
    const bytes = encodePng({ ...RGBA_SPEC, width: 16, height: 16, interlace: 1 });
    expect((await refusal(() => pngBandDecoder.inspect(bytes))).reason).toBe('interlaced');
    expect((await refusal(pngBandDecoder.decode(bytes, { reduce: 1, onBand: () => undefined }))).reason).toBe('interlaced');
  });

  it('refuses garbage, truncated files and invalid headers as corrupt', async () => {
    const rgb = fixture('rgb8.png');
    const badDepth = encodePng({ ...RGBA_SPEC, width: 4, height: 4 });
    badDepth[24] = 4;
    const noData = rgb.slice(0, 33);
    for (const bytes of [new Uint8Array(100).fill(7), rgb.subarray(0, 20), rgb.subarray(0, rgb.length >> 1), badDepth, noData]) {
      expect((await refusal(() => pngBandDecoder.inspect(bytes))).reason).toBe('corrupt');
    }
  });

  it('refuses image data that ends before the last row', async () => {
    const spec: PngSpec = { ...RGBA_SPEC, width: 50, height: 40 };
    const whole = deflateSync(scanlines(spec));
    const cut = encodePng(spec);
    // Rebuild with a third of the compressed stream: the chunk list is whole, the data is not.
    const header = cut.subarray(0, 33);
    const bytes = new Uint8Array(Buffer.concat([header, chunk('IDAT', whole.subarray(0, whole.length / 3)), chunk('IEND', new Uint8Array(0))]));
    expect(pngBandDecoder.inspect(bytes).width).toBe(50);
    expect((await refusal(pngBandDecoder.decode(bytes, { reduce: 1, onBand: () => undefined }))).reason).toBe('corrupt');
  });

  it('emits full-size bands in order, the last one shorter', async () => {
    const { bands } = await decodeAll(encodePng(RGBA_SPEC), 1);
    expect(bands.map((band) => band.y)).toEqual([0, 64, 128, 192, 256, 320]);
    expect(bands.map((band) => band.rows)).toEqual([64, 64, 64, 64, 64, 13]);
    expect(new Set(bands.map((band) => band.width))).toEqual(new Set([1000]));
  });

  it('emits reduced bands of the reduced size', async () => {
    const { bands } = await decodeAll(encodePng(RGBA_SPEC), 8);
    const size = reducedSize(RGBA_SPEC, 8);
    expect(bands.map((band) => band.y)).toEqual([0, 8, 16, 24, 32, 40]);
    expect(bands.map((band) => band.rows)).toEqual([8, 8, 8, 8, 8, 2]);
    expect(bands.reduce((rows, band) => rows + band.rows, 0)).toBe(size.height);
    expect(bands[0]!.width).toBe(size.width);
  });

  it('stops between bands once aborted', async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    const decoding = pngBandDecoder.decode(encodePng(RGBA_SPEC), {
      reduce: 1,
      signal: controller.signal,
      onBand: async (band) => {
        seen.push(band.y);
        await Promise.resolve();
        controller.abort();
      },
    });
    await expect(decoding).rejects.toThrow(/abort/i);
    expect(seen).toEqual([0]);
  });

  const cases: Array<[string, PngSpec]> = [
    ['RGBA 8', RGBA_SPEC],
    ['RGB 8', { ...RGBA_SPEC, colourType: 2, width: 333, height: 101 }],
    ['RGB 8 with a colour key', { ...RGBA_SPEC, colourType: 2, width: 77, height: 70, sample: (x, y, c) => ((x + y) % 5 === 0 ? [10, 20, 30][c]! : pattern(x, y, c)), trns: [0, 10, 0, 20, 0, 30] }],
    ['RGB 16 with a colour key', { ...RGBA_SPEC, colourType: 2, bitDepth: 16, width: 61, height: 75, sample: (x, y, c) => ((x * y) % 7 === 0 ? 0x1234 : pattern(x, y, c) * 257 + c), trns: [0x12, 0x34, 0x12, 0x34, 0x12, 0x34] }],
    ['RGBA 16', { ...RGBA_SPEC, bitDepth: 16, width: 45, height: 67, sample: (x, y, c) => pattern(x, y, c) * 251 + x }],
    ['grey 1', { ...RGBA_SPEC, colourType: 0, bitDepth: 1, width: 83, height: 70, sample: (x, y) => (x ^ y) & 1 }],
    ['grey 2 with a key', { ...RGBA_SPEC, colourType: 0, bitDepth: 2, width: 81, height: 66, sample: (x, y) => (x + 2 * y) & 3, trns: [0, 2] }],
    ['grey 4', { ...RGBA_SPEC, colourType: 0, bitDepth: 4, width: 79, height: 65, sample: (x, y) => (x * 3 + y) & 15 }],
    ['grey 8 with a key', { ...RGBA_SPEC, colourType: 0, width: 70, height: 70, sample: pattern, trns: [0, 40] }],
    ['grey 16 with a key', { ...RGBA_SPEC, colourType: 0, bitDepth: 16, width: 70, height: 70, sample: (x, y) => ((x + y) % 4 === 0 ? 0xabcd : pattern(x, y, 0) * 256 + y), trns: [0xab, 0xcd] }],
    ['grey and alpha 8', { ...RGBA_SPEC, colourType: 4, width: 90, height: 72, sample: pattern }],
    ['grey and alpha 16', { ...RGBA_SPEC, colourType: 4, bitDepth: 16, width: 90, height: 72, sample: (x, y, c) => pattern(x, y, c) * 257 }],
    ['palette 4 with tRNS', { ...RGBA_SPEC, colourType: 3, bitDepth: 4, width: 87, height: 70, sample: (x, y) => (x + y * 3) % 12, palette: Array.from({ length: 12 }, (_, i) => [i * 20, 255 - i * 9, i * 7]), trns: [0, 128, 255, 30] }],
    ['palette 1', { ...RGBA_SPEC, colourType: 3, bitDepth: 1, width: 85, height: 70, sample: (x, y) => (x >> 2 ^ y) & 1, palette: [[200, 10, 10], [10, 10, 200]] }],
    ['palette 8', { ...RGBA_SPEC, colourType: 3, width: 70, height: 70, sample: pattern, palette: Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 3) & 255]) }],
  ];

  it.each(cases)('decodes %s pixel for pixel, at full size and reduced', async (_, spec) => {
    const bytes = encodePng(spec);
    const expected = expectedImage(spec);
    expect((await decodeAll(bytes, 1)).pixels).toEqual(expected);
    expect((await decodeAll(bytes, 8)).pixels).toEqual(boxAverage(expected, spec.width, spec.height));
  });
});
