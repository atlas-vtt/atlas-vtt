import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Band, BandUnsupportedError, type BandUnsupportedReason, reducedSize } from '../../../src/app/imageProcessing/band/bandTypes';
import { jpegBandDecoder } from '../../../src/app/imageProcessing/band/jpegBandDecoder';
import { grayJpeg } from '../../../src/app/imageProcessing/__tests__/grayJpeg';

const FIXTURES = new URL('../../fixtures/images/', import.meta.url);

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, FIXTURES)));
}

async function grey(width: number, height: number, orientation?: number): Promise<Uint8Array> {
  return new Uint8Array(await grayJpeg(width, height, orientation).arrayBuffer());
}

interface BandRecord {
  y: number;
  rows: number;
  width: number;
  bytes: number;
}

/** Decodes `bytes`, copying every band into one image and noting each band's place. */
async function decodeAll(bytes: Uint8Array, reduce: 1 | 8): Promise<{ width: number; height: number; pixels: Uint8Array; bands: BandRecord[] }> {
  const { width, height } = reducedSize(jpegBandDecoder.inspect(bytes), reduce);
  const pixels = new Uint8Array(width * height * 4);
  const bands: BandRecord[] = [];
  await jpegBandDecoder.decode(bytes, {
    reduce,
    onBand: (band: Band) => {
      bands.push({ y: band.y, rows: band.rows, width: band.width, bytes: band.data.length });
      pixels.set(band.data, band.y * width * 4);
    },
  });
  return { width, height, pixels, bands };
}

async function refusal(bytes: Uint8Array): Promise<BandUnsupportedReason | 'none'> {
  try {
    jpegBandDecoder.inspect(bytes);
    await jpegBandDecoder.decode(bytes, { reduce: 1, onBand: () => undefined });
    return 'none';
  } catch (error) {
    if (error instanceof BandUnsupportedError) return error.reason;
    throw error;
  }
}

/** The offset of the first segment with `marker`. */
function segmentAt(bytes: Uint8Array, marker: number): number {
  for (let i = 2; i < bytes.length - 1; i++) if (bytes[i] === 0xff && bytes[i + 1] === marker) return i;
  throw new Error(`No marker 0x${marker.toString(16)}`);
}

function patched(bytes: Uint8Array, at: number, values: number[]): Uint8Array {
  const copy = bytes.slice();
  copy.set(values, at);
  return copy;
}

function spliced(bytes: Uint8Array, at: number, removed: number, inserted: number[]): Uint8Array {
  return new Uint8Array([...bytes.subarray(0, at), ...inserted, ...bytes.subarray(at + removed)]);
}

const BASELINE = ['baseline-420.jpg', 'baseline-422.jpg', 'baseline-444.jpg', 'baseline-420-restart.jpg', 'baseline-gray.jpg', 'baseline-420-tall.jpg', 'baseline-exif-upright.jpg'];

describe('jpegBandDecoder.inspect', () => {
  it('reads the stored size of every baseline fixture', () => {
    expect(jpegBandDecoder.inspect(fixture('baseline-420.jpg'))).toEqual({ width: 97, height: 61, hasAlpha: false });
    expect(jpegBandDecoder.inspect(fixture('baseline-gray.jpg'))).toEqual({ width: 97, height: 61, hasAlpha: false });
    expect(jpegBandDecoder.inspect(fixture('baseline-420-tall.jpg'))).toEqual({ width: 50, height: 300, hasAlpha: false });
    expect(jpegBandDecoder.inspect(fixture('baseline-exif-upright.jpg'))).toEqual({ width: 97, height: 61, hasAlpha: false });
  });

  it('refuses what it cannot stream, saying why', async () => {
    const jpeg = fixture('baseline-420.jpg');
    const sof = segmentAt(jpeg, 0xc0);
    const sos = segmentAt(jpeg, 0xda);
    expect(await refusal(fixture('progressive.jpg'))).toBe('progressive');
    expect(await refusal(fixture('baseline-exif-turned.jpg'))).toBe('orientation');
    expect(await refusal(await grey(64, 64, 8))).toBe('orientation');
    expect(await refusal(await grey(64, 64, 1))).toBe('none');
    expect(await refusal(patched(jpeg, sof + 1, [0xc9]))).toBe('coding');
    expect(await refusal(patched(jpeg, sof + 1, [0xc3]))).toBe('coding');
    expect(await refusal(patched(jpeg, sof + 4, [12]))).toBe('coding');
    expect(await refusal(spliced(jpeg, 2, 0, [0xff, 0xcc, 0x00, 0x04, 0x00, 0x00]))).toBe('coding');
    // The second component (Cb) sampled 2 × 1.
    expect(await refusal(patched(jpeg, sof + 10 + 3 + 1, [0x21]))).toBe('components');
    const adobeRgb = [0xff, 0xee, 0x00, 0x0e, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00];
    expect(await refusal(spliced(jpeg, 2, 0, adobeRgb))).toBe('components');
    expect(await refusal(spliced(jpeg, 2, 0, adobeRgb.map((byte, i) => (i === 15 ? 1 : byte))))).toBe('none');
    const sosLength = ((jpeg[sos + 2] ?? 0) << 8) | (jpeg[sos + 3] ?? 0);
    expect(await refusal(spliced(jpeg, sos, 2 + sosLength, [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]))).toBe('scans');
  });

  it('refuses malformed and truncated files as corrupt', async () => {
    const jpeg = fixture('baseline-420.jpg');
    const sof = segmentAt(jpeg, 0xc0);
    expect(await refusal(fixture('rgb8.png'))).toBe('corrupt');
    expect(await refusal(jpeg.subarray(0, 200))).toBe('corrupt');
    expect(await refusal(jpeg.subarray(0, jpeg.length - 400))).toBe('corrupt');
    expect(await refusal(patched(jpeg, sof + 5, [0, 0]))).toBe('corrupt');
    expect(await refusal(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe('corrupt');
  });
});

describe('jpegBandDecoder.decode', () => {
  it('emits one band per MCU row, top to bottom, the last one shorter', async () => {
    const at420 = await decodeAll(fixture('baseline-420.jpg'), 1);
    expect(at420.bands).toEqual([0, 16, 32, 48].map((y) => ({ y, rows: y === 48 ? 13 : 16, width: 97, bytes: 97 * (y === 48 ? 13 : 16) * 4 })));
    const at444 = await decodeAll(fixture('baseline-444.jpg'), 1);
    expect(at444.bands.map((band) => [band.y, band.rows])).toEqual([[0, 8], [8, 8], [16, 8], [24, 8], [32, 8], [40, 8], [48, 8], [56, 5]]);
    const tall = await decodeAll(fixture('baseline-420-tall.jpg'), 1);
    expect(tall.bands).toHaveLength(19);
    expect(tall.bands.at(-1)).toEqual({ y: 288, rows: 12, width: 50, bytes: 50 * 12 * 4 });
  });

  it('gives a reduced decode the size reducedSize gives, a band per MCU row', async () => {
    for (const name of BASELINE) {
      const bytes = fixture(name);
      const size = reducedSize(jpegBandDecoder.inspect(bytes), 8);
      const { bands } = await decodeAll(bytes, 8);
      expect(bands.every((band) => band.width === size.width && band.bytes === size.width * band.rows * 4)).toBe(true);
      expect(bands.reduce((rows, band) => rows + band.rows, 0)).toBe(size.height);
    }
    expect((await decodeAll(fixture('baseline-420.jpg'), 8)).bands.map((band) => [band.y, band.rows])).toEqual([[0, 2], [2, 2], [4, 2], [6, 2]]);
    expect((await decodeAll(fixture('baseline-gray.jpg'), 8)).bands.map((band) => band.rows)).toEqual(new Array(8).fill(1));
  });

  it('waits for each band before decoding the next', async () => {
    const order: string[] = [];
    await jpegBandDecoder.decode(fixture('baseline-420.jpg'), {
      reduce: 1,
      onBand: async (band) => {
        order.push(`start ${band.y}`);
        await new Promise((resolve) => setTimeout(resolve, 1));
        order.push(`end ${band.y}`);
      },
    });
    expect(order).toEqual(['start 0', 'end 0', 'start 16', 'end 16', 'start 32', 'end 32', 'start 48', 'end 48']);
  });

  it('stops between bands when aborted, with the signal\'s reason', async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    const decoding = jpegBandDecoder.decode(fixture('baseline-420.jpg'), {
      reduce: 1,
      signal: controller.signal,
      onBand: (band) => {
        seen.push(band.y);
        controller.abort();
      },
    });
    await expect(decoding).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toEqual([0]);

    const reason = new Error('closed');
    const aborted = new AbortController();
    aborted.abort(reason);
    let bands = 0;
    await expect(jpegBandDecoder.decode(fixture('baseline-420.jpg'), { reduce: 8, signal: aborted.signal, onBand: () => void bands++ })).rejects.toBe(reason);
    expect(bands).toBe(0);
  });

  it('decodes a large uniform grey JPEG to mid grey at both scales', async () => {
    const bytes = await grey(2000, 600);
    for (const reduce of [1, 8] as const) {
      const { width, height, pixels } = await decodeAll(bytes, reduce);
      expect({ width, height }).toEqual(reducedSize({ width: 2000, height: 600 }, reduce));
      let worst = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        worst = Math.max(worst, Math.abs((pixels[i] ?? 0) - 128), Math.abs((pixels[i + 1] ?? 0) - 128), Math.abs((pixels[i + 2] ?? 0) - 128));
        if (pixels[i + 3] !== 255) throw new Error('A pixel is not opaque.');
      }
      expect(worst).toBeLessThanOrEqual(1);
    }
  });

  it('reads restart markers: the same image with and without them decodes the same', async () => {
    const plain = await decodeAll(fixture('baseline-420.jpg'), 1);
    const restarted = await decodeAll(fixture('baseline-420-restart.jpg'), 1);
    expect(restarted.pixels).toEqual(plain.pixels);
  });

  // Each digest is of pixels identical to libjpeg-turbo's djpeg (accurate integer IDCT, fancy upsampling;
  // `-scale 1/8` for reduce 8), compared when the decoder was written. 4:2:2 at 1/8 is the exception:
  // libjpeg spreads its chroma DC over two luma blocks, where the decoder gives each block its half.
  it('reassembles every fixture to a stable image', async () => {
    const digests: Record<string, string> = {};
    for (const name of BASELINE) {
      for (const reduce of [1, 8] as const) {
        const first = await decodeAll(fixture(name), reduce);
        const second = await decodeAll(fixture(name), reduce);
        expect(second.pixels).toEqual(first.pixels);
        digests[`${name} ${reduce}`] = createHash('sha256').update(first.pixels).digest('hex').slice(0, 16);
      }
    }
    expect(digests).toMatchInlineSnapshot(`
      {
        "baseline-420-restart.jpg 1": "04254726dc146128",
        "baseline-420-restart.jpg 8": "5663c1b0c7a44de1",
        "baseline-420-tall.jpg 1": "05f3b825ba2870d6",
        "baseline-420-tall.jpg 8": "87f9237e34829fa9",
        "baseline-420.jpg 1": "04254726dc146128",
        "baseline-420.jpg 8": "5663c1b0c7a44de1",
        "baseline-422.jpg 1": "9a614781d1c73dea",
        "baseline-422.jpg 8": "c4ad03743c6e8766",
        "baseline-444.jpg 1": "d7a80fcdaf7ea8e4",
        "baseline-444.jpg 8": "96902eb4cd20e7cd",
        "baseline-exif-upright.jpg 1": "04254726dc146128",
        "baseline-exif-upright.jpg 8": "5663c1b0c7a44de1",
        "baseline-gray.jpg 1": "f8568b1c9406f3a4",
        "baseline-gray.jpg 8": "27ad58203d98e53b",
      }
    `);
  });
});
