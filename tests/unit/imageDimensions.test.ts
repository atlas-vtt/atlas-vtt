import { describe, expect, it } from 'vitest';
import { imageDimensions, imageHeader } from '../../src/app/imageProcessing/imageDimensions';

/** jsdom's Blob lacks `slice().arrayBuffer()`; this stand-in serves the header bytes the reader asks for. */
function file(...parts: number[][]): Blob {
  const bytes = new Uint8Array(parts.flat());
  return { slice: (start: number, end: number) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer }) } as unknown as Blob;
}
const text = (value: string): number[] => [...value].map(c => c.charCodeAt(0));
const u16be = (n: number): number[] => [n >> 8, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, n >> 8];
const u32be = (n: number): number[] => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32le = (n: number): number[] => u32be(n).reverse();

describe('imageDimensions', () => {
  it('reads PNG, GIF and BMP headers', async () => {
    expect(await imageDimensions(file([0x89], text('PNG\r\n\x1a\n'), u32be(13), text('IHDR'), u32be(11708), u32be(12917)))).toEqual({ width: 11708, height: 12917 });
    expect(await imageDimensions(file(text('GIF89a'), u16le(320), u16le(200)))).toEqual({ width: 320, height: 200 });
    expect(await imageDimensions(file(text('BM'), new Array(12).fill(0), u32le(40), u32le(640), u32le(-480 >>> 0)))).toEqual({ width: 640, height: 480 });
  });

  it('finds the JPEG frame header after other segments', async () => {
    const app1 = [0xff, 0xe1, ...u16be(6), 1, 2, 3, 4];
    const sof2 = [0xff, 0xc2, ...u16be(17), 8, ...u16be(3326), ...u16be(5886), 3];
    expect(await imageDimensions(file([0xff, 0xd8], app1, sof2, new Array(12).fill(0)))).toEqual({ width: 5886, height: 3326 });
    expect(await imageHeader(file([0xff, 0xd8], app1, sof2, new Array(12).fill(0)))).toEqual({ format: 'jpeg', width: 5886, height: 3326 });
  });

  it('reads lossy, lossless and extended WebP headers', async () => {
    const riff = (chunk: string, body: number[]): Blob => file(text('RIFF'), u32le(100), text('WEBP'), text(chunk), u32le(body.length), body);
    expect(await imageDimensions(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(2048), ...u16le(1024)]))).toEqual({ width: 2048, height: 1024 });
    expect((await imageHeader(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(2048), ...u16le(1024)])))?.format).toBe('webp');
    const lossless = (400 - 1) | ((300 - 1) << 14);
    expect(await imageDimensions(riff('VP8L', [0x2f, ...u32le(lossless), 0]))).toEqual({ width: 400, height: 300 });
    expect(await imageDimensions(riff('VP8X', [0, 0, 0, 0, ...[0xff, 0x1f, 0], ...[0xff, 0x0f, 0]]))).toEqual({ width: 8192, height: 4096 });
  });

  it('knows nothing about SVG or truncated files', async () => {
    expect(await imageDimensions(file(text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')))).toBeNull();
    expect(await imageDimensions(file([0x89], text('PNG')))).toBeNull();
    expect(await imageDimensions(file([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull();
  });
});
