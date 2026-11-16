import { describe, expect, it } from 'vitest';
import { pngBandDecoder } from '../band/pngBandDecoder';

const FIXTURES = ['rgb8.png', 'rgba8.png', 'gray8.png', 'gray16.png', 'gray1.png', 'graya8.png', 'palette8.png', 'palette4-trns.png', 'rgb8-trns.png'];

async function fixture(name: string): Promise<Uint8Array> {
  const response = await fetch(`/tests/fixtures/images/${name}`);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The pixels Chromium decodes, read back from a canvas (premultiplied there, so only opaque pixels are exact). */
async function chromiumPixels(bytes: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function bandPixels(bytes: Uint8Array): Promise<Uint8ClampedArray> {
  const { width, height } = pngBandDecoder.inspect(bytes);
  const pixels = new Uint8ClampedArray(width * height * 4);
  await pngBandDecoder.decode(bytes, { reduce: 1, onBand: (band) => pixels.set(band.data, band.y * width * 4) });
  return pixels;
}

/** Megapixels of the opt-in throughput run: `VITE_PNG_BAND_MP=400 npm run test:gpu -- pngBandDecoder`. */
const BENCH_MEGAPIXELS = Number(import.meta.env.VITE_PNG_BAND_MP ?? 0);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  // CRCs are left 0: the decoder does not read them.
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(Array.from(type, (char) => char.charCodeAt(0)), 4);
  out.set(data, 8);
  return out;
}

/** A square RGB PNG of noisy gradients, its rows filtered with types 1 to 4 in turn, as encoders mix them. */
async function syntheticPng(side: number): Promise<Uint8Array> {
  const rowBytes = side * 3;
  const compressor = new CompressionStream('deflate');
  const writer = compressor.writable.getWriter();
  const compressed: Uint8Array[] = [];
  const reader = compressor.readable.getReader();
  const reading = (async (): Promise<void> => {
    for (let part = await reader.read(); !part.done; part = await reader.read()) compressed.push(part.value);
  })();
  let previous = new Uint8Array(rowBytes);
  let raw = new Uint8Array(rowBytes);
  let seed = 12345;
  for (let y = 0; y < side; y++) {
    const line = new Uint8Array(rowBytes + 1);
    const filter = 1 + (y % 4);
    line[0] = filter;
    for (let i = 0; i < rowBytes; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      raw[i] = ((i * 3 + y * 5) >> 4) + (seed & 7);
      const a = i >= 3 ? raw[i - 3]! : 0;
      const b = previous[i]!;
      const c = i >= 3 ? previous[i - 3]! : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      line[i + 1] = raw[i]! - [a, b, (a + b) >> 1, paeth][filter - 1]!;
    }
    await writer.write(line);
    [previous, raw] = [raw, previous];
  }
  await writer.close();
  await reading;
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, side);
  new DataView(header.buffer).setUint32(4, side);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header), ...compressed.map((part) => pngChunk('IDAT', part)), pngChunk('IEND', new Uint8Array(0))];
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((at, part) => (bytes.set(part, at), at + part.length), 0);
  return bytes;
}

describe('pngBandDecoder against Chromium', () => {
  it.runIf(BENCH_MEGAPIXELS > 0)('decodes a large PNG fast enough', async () => {
    const side = Math.round(Math.sqrt(BENCH_MEGAPIXELS * 1e6));
    const bytes = await syntheticPng(side);
    for (const reduce of [1, 8] as const) {
      let bands = 0;
      const start = performance.now();
      await pngBandDecoder.decode(bytes, { reduce, onBand: () => void bands++ });
      const seconds = (performance.now() - start) / 1000;
      console.log(`${side} × ${side} RGB, reduce ${reduce}: ${seconds.toFixed(2)} s, ${((side * side) / 1e6 / seconds).toFixed(1)} MP/s, ${bands} bands`);
    }
  });

  it.each(FIXTURES)('decodes %s as Chromium does', async (name) => {
    const bytes = await fixture(name);
    const ours = await bandPixels(bytes);
    const theirs = await chromiumPixels(bytes);
    expect(theirs.data.length).toBe(ours.length);
    let opaque = 0;
    const mismatches: string[] = [];
    for (let i = 0; i < ours.length; i += 4) {
      const alpha = theirs.data[i + 3]!;
      if (alpha === 255) {
        opaque++;
        const same = ours[i] === theirs.data[i] && ours[i + 1] === theirs.data[i + 1] && ours[i + 2] === theirs.data[i + 2] && ours[i + 3] === 255;
        if (!same && mismatches.length < 5) mismatches.push(`pixel ${i / 4}: ours ${Array.from(ours.subarray(i, i + 4))}, Chromium's ${Array.from(theirs.data.subarray(i, i + 4))}`);
      } else {
        // The canvas keeps colour only premultiplied: compare that within rounding.
        for (let c = 0; c < 3; c++) {
          if (Math.abs((ours[i + c]! * ours[i + 3]!) / 255 - (theirs.data[i + c]! * alpha) / 255) > 1.5 && mismatches.length < 5) {
            mismatches.push(`translucent pixel ${i / 4}: ours ${Array.from(ours.subarray(i, i + 4))}, Chromium's ${Array.from(theirs.data.subarray(i, i + 4))}`);
          }
        }
        if (Math.abs(ours[i + 3]! - alpha) > 0) mismatches.push(`alpha of pixel ${i / 4}: ours ${ours[i + 3]}, Chromium's ${alpha}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(opaque).toBeGreaterThan(0);
  });
});
