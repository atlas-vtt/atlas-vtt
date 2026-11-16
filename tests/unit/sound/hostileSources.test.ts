import { describe, expect, it } from 'vitest';
import { demuxMp4 } from '@/app/sound/codec/demux/mp4Demux';
import { BlobWindow } from '@/app/sound/codec/demux/blobWindow';
import type { EncodedSource } from '@/app/sound/codec/demux/demuxTypes';
import { openSoundSource } from '@/app/sound/codec/demux/openSoundSource';
import { MAX_PACKET_BYTES, OggCorruptError, packetsOfPage, readPage, writePage } from '@/app/sound/codec/oggPages';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';

/**
 * Sound files are the one thing Atlas reads that came from anywhere: a header must never decide how much is
 * allocated. Each of these small files once asked for gigabytes, or for a table or a loop that never ended.
 */

const bytesOf = (...parts: readonly (number | Uint8Array)[]): Uint8Array<ArrayBuffer> => {
  const flat = parts.flatMap((part) => (typeof part === 'number' ? [part] : [...part]));
  return Uint8Array.from(flat);
};

const u32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const box = (name: string, ...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const body = parts.reduce((sum, part) => sum + part.length, 0);
  return bytesOf(u32(8 + body), text(name), ...parts);
};

const ESDS = box('esds', new Uint8Array(4), bytesOf(3, 0x20, 0, 0, 0, 4, 0x15, 0x40, new Uint8Array(12), 5, 2, 0x12, 0x10));
const MP4A = box('mp4a', new Uint8Array(16), bytesOf(0, 2, 0, 16, 0, 0, 0, 0), bytesOf(0xac, 0x44, 0, 0), ESDS);
const STSD = box('stsd', new Uint8Array(4), u32(1), MP4A);

interface Tables { stsz?: Uint8Array; stsc?: Uint8Array; stco?: Uint8Array; padding?: number }

const stsz = (fixed: number, count: number, sizes: readonly number[] = []): Uint8Array => box('stsz', new Uint8Array(4), u32(fixed), u32(count), ...sizes.map(u32));
const stsc = (runs: number, ...entries: readonly (readonly [number, number])[]): Uint8Array => box('stsc', new Uint8Array(4), u32(runs), ...entries.flatMap(([first, per]) => [u32(first), u32(per), u32(1)]));
const stco = (count: number, ...offsets: readonly number[]): Uint8Array => box('stco', new Uint8Array(4), u32(count), ...offsets.map(u32));

/** A whole MP4 with one sound track of these tables; a good one by default. */
function mp4({ stsz: sizes = stsz(0, 2, [1, 1]), stsc: runs = stsc(1, [1, 2]), stco: chunks = stco(1, 8), padding = 8 }: Tables): Blob {
  const stbl = box('stbl', STSD, sizes, runs, chunks);
  const minf = box('minf', box('smhd', new Uint8Array(8)), stbl);
  const mdia = box('mdia', box('mdhd', new Uint8Array(12), u32(44100), new Uint8Array(8)), minf);
  return new Blob([box('ftyp', text('isom')), box('moov', box('trak', mdia)), new Uint8Array(padding)]);
}

const wav = (sampleRate: number, channels = 2): Blob => {
  const view = new DataView(new ArrayBuffer(44));
  text('RIFF').forEach((byte, at) => view.setUint8(at, byte));
  text('WAVEfmt ').forEach((byte, at) => view.setUint8(8 + at, byte));
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint16(34, 16, true);
  text('data').forEach((byte, at) => view.setUint8(36 + at, byte));
  view.setUint32(40, 400, true);
  return new Blob([view.buffer, new Uint8Array(400)]);
};

const refused = async (file: Blob): Promise<void> => {
  const started = performance.now();
  await expect(openSoundSource(file)).rejects.toMatchObject({ reason: 'unreadable' });
  expect(performance.now() - started).toBeLessThan(2000);
};

describe('a WAV', () => {
  it.each([1, 7999, 192_001, 100_000_007])('is refused at a rate of %i Hz, which a resampler would turn into gigabytes', async (rate) => {
    await refused(wav(rate));
  });

  it.each([8000, 44_100, 192_000])('is read at %i Hz', async (rate) => {
    await expect(openSoundSource(wav(rate))).resolves.toMatchObject({ type: 'pcm', sampleRate: rate });
  });

  it('is refused with more channels than any layout has, each a plane to allocate', async () => {
    await refused(wav(48_000, 65_535));
  });
});

describe('an MP4', () => {
  it('reads a good table', async () => {
    const source = await demuxMp4(new BlobWindow(mp4({ stsz: stsz(0, 2, [3, 4]), stco: stco(1, 40), padding: 64 })));
    const sizes: number[] = [];
    for await (const packet of source.packets()) sizes.push(packet.data.length);
    expect(sizes).toEqual([3, 4]);
  });

  it('reads a table of samples of one size that fit the file', async () => {
    await expect(openSoundSource(mp4({ stsz: stsz(4, 2), padding: 64 }))).resolves.toMatchObject({ type: 'encoded' });
  });

  it.each<[string, Tables]>([
    ['more samples of one size than the file can hold', { stsz: stsz(1, 0xffffffff) }],
    ['just more of them than the file can hold', { stsz: stsz(100, 100) }],
    ['a size table longer than its box', { stsz: stsz(0, 0xffffffff, [1]) }],
    ['a size table one entry longer than its box', { stsz: stsz(0, 3, [1, 1]) }],
    ['samples that together are longer than the file', { stsz: stsz(0, 2, [1 << 19, 1 << 19]) }],
    ['one sample larger than any frame', { stsz: stsz(1 << 21, 1), padding: 1 << 22 }],
    ['one listed sample larger than any frame', { stsz: stsz(0, 1, [1 << 21]), padding: 1 << 22 }],
    ['more samples than any table is allocated for', { stsz: stsz(1, (1 << 24) + 1), padding: (1 << 24) + 8 }],
    ['a chunk table longer than its box', { stco: stco(0x40000000, 8) }],
    ['a run table longer than its box', { stsc: stsc(0x40000000, [1, 2]) }],
    ['a run of chunks without a sample, which would never end', { stsc: stsc(2, [1, 0], [1, 0]) }],
    ['a chunk numbered 0', { stsc: stsc(1, [0, 2]) }],
    ['a run beyond the chunks', { stsc: stsc(1, [9, 2]) }],
  ])('is refused with %s', async (_what, tables) => {
    await refused(mp4(tables));
  });
});

describe('an Ogg file', () => {
  const opusHead = (): Uint8Array => writePage({ flags: 2, granule: 0, serial: 1, sequence: 0, segments: [19], body: [writeOpusHead(2, 312)] });
  const body = new Uint8Array(255 * 255).fill(7);
  /** A page in the middle of a packet that goes on. */
  const goingOn = writePage({ flags: 1, granule: -1, serial: 1, sequence: 2, segments: new Array<number>(255).fill(255), body: [body] });
  const pagesFor = (bytes: number): number => Math.ceil(bytes / body.length);

  it('is refused where its comments go on past any packet, without copying them on every page', async () => {
    const pages = new Array<Uint8Array>(pagesFor(MAX_PACKET_BYTES) + 2).fill(goingOn);
    const started = performance.now();
    await expect(openSoundSource(new Blob([opusHead(), ...pages] as BlobPart[]))).rejects.toBeInstanceOf(OggCorruptError);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it('is refused where a packet of sound goes on past any packet', async () => {
    const comments = writePage({ flags: 0, granule: 0, serial: 1, sequence: 1, segments: [8], body: [text('OpusTags')] });
    const pages = new Array<Uint8Array>(pagesFor(MAX_PACKET_BYTES) + 2).fill(goingOn);
    const source = await openSoundSource(new Blob([opusHead(), comments, ...pages] as BlobPart[])) as EncodedSource;
    await expect((async () => { for await (const packet of source.packets()) void packet; })()).rejects.toBeInstanceOf(OggCorruptError);
  });

  it('keeps a packet that goes on over pages as pieces, and joins it once it ends', () => {
    const first = readPage(writePage({ flags: 0, granule: -1, serial: 1, sequence: 0, segments: [255], body: [new Uint8Array(255).fill(1)] }), 0)!;
    const middle = readPage(writePage({ flags: 1, granule: -1, serial: 1, sequence: 1, segments: [255], body: [new Uint8Array(255).fill(2)] }), 0)!;
    const last = readPage(writePage({ flags: 1, granule: 960, serial: 1, sequence: 2, segments: [5], body: [new Uint8Array(5).fill(3)] }), 0)!;
    const one = packetsOfPage(first, null).tail;
    const two = packetsOfPage(middle, one).tail;
    expect(two?.pieces).toHaveLength(2);
    expect(two?.length).toBe(510);
    const [packet] = packetsOfPage(last, two).packets;
    expect(packet?.length).toBe(515);
    expect([packet?.[0], packet?.[255], packet?.[514]]).toEqual([1, 2, 3]);
  });

  it('that says it is Vorbis at a rate no sound has is refused', async () => {
    const ident = bytesOf(1, text('vorbis'), new Uint8Array(4), 2, 1, 0, 0, 0, new Uint8Array(13));
    const pages = [
      writePage({ flags: 2, granule: 0, serial: 1, sequence: 0, segments: [ident.length], body: [ident] }),
      writePage({ flags: 0, granule: 0, serial: 1, sequence: 1, segments: [7, 7], body: [bytesOf(3, text('vorbis')), bytesOf(5, text('vorbis'))] }),
    ];
    await refused(new Blob(pages as BlobPart[]));
  });
});

it('a FLAC file at a rate no sound has is refused', async () => {
  const info = new Uint8Array(34);
  info[12] = 0x10;
  await refused(new Blob([text('fLaC'), bytesOf(0x80, 0, 0, 34), info]));
});

it('an ADTS stream at a rate below 8 kHz is refused', async () => {
  const frame = bytesOf(0xff, 0xf1, (1 << 6) | (12 << 2), 2 << 6, 0, 0, 0, new Uint8Array(32));
  await refused(new Blob([frame]));
});
