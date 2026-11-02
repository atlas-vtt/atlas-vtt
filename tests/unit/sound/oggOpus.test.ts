import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OggOpusWriter } from '@/app/sound/codec/oggOpusWriter';
import { openOggOpus, readPacketRange } from '@/app/sound/codec/oggOpusReader';
import { FLAG_LAST, lacingOf, oggCrc, OggCorruptError, packetsOfPage, readPage, writePage, type CarriedPacket } from '@/app/sound/codec/oggPages';
import { opusPacketFrames, readOpusComment, readOpusHead, writeOpusHead, writeOpusTags } from '@/app/sound/codec/opusFormat';
import { decodeSeekTable, encodeSeekTable, SEEK_COMMENT, SEEK_INTERVAL_FRAMES, seekIndexFor } from '@/app/sound/codec/seekTable';
import type { SoundBytes } from '@/app/sound/soundTypes';

const FRAME_20MS = 960;
/** A TOC byte for CELT fullband 20 ms, one frame, plus a body telling packets apart. */
function packet(index: number, length = 60): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = 31 << 3;
  bytes[1] = index & 0xff;
  bytes[2] = (index >> 8) & 0xff;
  return bytes;
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function source(bytes: Uint8Array): SoundBytes & { reads: Array<[number, number]> } {
  const reads: Array<[number, number]> = [];
  return {
    reads,
    byteLength: bytes.length,
    read: (start, end) => {
      reads.push([start, end]);
      return Promise.resolve(bytes.slice(start, end));
    },
  };
}

function written(packets: number, frames: number, preSkip = 312): Blob {
  const writer = new OggOpusWriter(writeOpusHead(2, preSkip));
  for (let i = 0; i < packets; i++) writer.addPacket(packet(i));
  return writer.finish(frames);
}

function pagesOf(bytes: Uint8Array): NonNullable<ReturnType<typeof readPage>>[] {
  const pages = [];
  let offset = 0;
  for (;;) {
    const page = readPage(bytes, offset);
    if (!page) return pages;
    pages.push(page);
    offset = page.end;
  }
}

describe('Ogg pages', () => {
  it('has the check value of the Ogg CRC', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f);
  });

  it('reads back what it wrote, and refuses a page with a changed byte', () => {
    const body = new Uint8Array(1000).fill(7);
    const page = writePage({ flags: 0, granule: 123456789012, serial: 9, sequence: 3, segments: lacingOf(1000), body: [body] });
    const read = readPage(page, 0);
    expect(read?.granule).toBe(123456789012);
    expect(read?.serial).toBe(9);
    expect(read?.body.length).toBe(1000);
    const broken = page.slice();
    broken[page.length - 1] = 9;
    expect(() => readPage(broken, 0)).toThrow(OggCorruptError);
  });

  it('gives a multiple of 255 a closing zero, so the packet ends', () => {
    expect(lacingOf(510)).toEqual([255, 255, 0]);
    expect(lacingOf(0)).toEqual([0]);
    expect(lacingOf(256)).toEqual([255, 1]);
  });

  it('joins a packet that runs across pages', () => {
    const tail = packetsOfPage(readPage(writePage({ flags: 0, granule: -1, serial: 1, sequence: 0, segments: [255], body: [new Uint8Array(255).fill(1)] }), 0)!, null).tail;
    const { packets } = packetsOfPage(readPage(writePage({ flags: 1, granule: 960, serial: 1, sequence: 1, segments: [5], body: [new Uint8Array(5).fill(2)] }), 0)!, tail);
    expect(packets[0]?.length).toBe(260);
    expect(packets[0]?.[259]).toBe(2);
  });
});

describe('Opus headers', () => {
  it('reads the head it wrote: family 0, gain 0', () => {
    const head = writeOpusHead(1, 3840);
    expect(readOpusHead(head)).toEqual({ channels: 1, preSkip: 3840, mappingFamily: 0 });
    expect(new DataView(head.buffer).getInt16(16, true)).toBe(0);
  });

  it('finds a comment, and stops at a length that lies', () => {
    const tags = writeOpusTags(['A=1', 'B=two words']);
    expect(readOpusComment(tags, 'B')).toBe('two words');
    expect(readOpusComment(tags, 'C')).toBeNull();
    const lying = tags.slice();
    new DataView(lying.buffer).setUint32(8, 1_000_000, true);
    expect(readOpusComment(lying, 'B')).toBeNull();
  });

  it('knows how long a packet lasts', () => {
    expect(opusPacketFrames(Uint8Array.of(31 << 3))).toBe(960);
    expect(opusPacketFrames(Uint8Array.of((31 << 3) | 1))).toBe(1920);
    expect(opusPacketFrames(Uint8Array.of((16 << 3) | 3, 4))).toBe(480);
    expect(opusPacketFrames(new Uint8Array(0))).toBe(0);
  });
});

describe('the seek table', () => {
  it('reads back what it wrote, and refuses text it cannot read', () => {
    const entries = [{ byte: 0, granule: 0 }, { byte: 60_000, granule: 240_480 }, { byte: 123_456, granule: 481_920 }];
    expect(decodeSeekTable(encodeSeekTable(entries))).toEqual(entries);
    expect(decodeSeekTable('!?')).toEqual([]);
    expect(decodeSeekTable('')).toEqual([]);
    expect(decodeSeekTable('1:0,5:5')).toEqual([]);
    expect(decodeSeekTable('0:0,5:0')).toEqual([]);
    expect(decodeSeekTable('0:0,-5:5')).toEqual([]);
    expect(decodeSeekTable(`0:0,${'z'.repeat(11)}:5`)).toEqual([]);
  });

  it('finds the last entry at or before a position', () => {
    const entries = [{ byte: 0, granule: 0 }, { byte: 10, granule: 100 }, { byte: 20, granule: 200 }];
    expect(seekIndexFor(entries, 0)).toBe(0);
    expect(seekIndexFor(entries, 99)).toBe(0);
    expect(seekIndexFor(entries, 100)).toBe(1);
    expect(seekIndexFor(entries, 5000)).toBe(2);
  });
});

describe('the Ogg Opus writer', () => {
  it('ends on pre-skip plus the frames, with the last page marked', async () => {
    const pages = pagesOf(await bytesOf(written(100, 95_000)));
    const last = pages.at(-1)!;
    expect(last.granule).toBe(312 + 95_000);
    expect(last.flags & FLAG_LAST).toBe(FLAG_LAST);
    expect(pages.map((page) => page.sequence)).toEqual(pages.map((_, index) => index));
  });

  it('refuses to claim more audio than the packets hold', () => {
    expect(() => written(10, 10 * FRAME_20MS)).toThrow();
    expect(() => written(11, 10 * FRAME_20MS)).not.toThrow();
  });

  it('drops packets wholly past the end', async () => {
    const pages = pagesOf(await bytesOf(written(20, 10 * FRAME_20MS)));
    const packets = pages.slice(2).flatMap((page) => packetsOfPage(page, null).packets);
    expect(packets.length).toBe(11);
  });

  it('keeps a page to about a second', async () => {
    const pages = pagesOf(await bytesOf(written(500, 400 * FRAME_20MS)));
    for (const page of pages.slice(2)) expect(packetsOfPage(page, null).packets.length).toBeLessThanOrEqual(50);
  });

  it('writes no table for a file up to 60 s, and one for a longer file', async () => {
    const short = await openOggOpus(source(await bytesOf(written(3001, 3000 * FRAME_20MS))));
    expect(short.seek).toEqual([{ byte: 0, granule: 0 }]);
    const longBytes = await bytesOf(written(3102, 3101 * FRAME_20MS));
    const long = await openOggOpus(source(longBytes));
    expect(long.seek.length).toBeGreaterThan(10);
    expect(long.seek[1]?.granule).toBeGreaterThanOrEqual(240_000);
    const page = readPage(longBytes, long.audioStart + (long.seek[3]?.byte ?? 0));
    expect(page).not.toBeNull();
  });

  it('coarsens a table too long for its page', async () => {
    const count = 8_000_000;
    const writer = new OggOpusWriter(writeOpusHead(2, 312));
    for (let i = 0; i < count; i++) writer.addPacket(packet(i, 3));
    const bytes = await bytesOf(writer.finish(count * FRAME_20MS - 1000));
    const sound = await openOggOpus(source(bytes));
    expect(sound.seek.length).toBeGreaterThan(3000);
    expect(sound.seek.length).toBeLessThan((count * FRAME_20MS) / SEEK_INTERVAL_FRAMES / 2);
    const packets = await readPacketRange(sound, source(bytes), 500_000_000, 500_100_000);
    expect(packets.length).toBeGreaterThan(0);
  }, 30_000);
});

describe('reading a range', () => {
  it('finds the packets with one read and their exact positions', async () => {
    const bytes = await bytesOf(written(8000, 7999 * FRAME_20MS));
    const sound = await openOggOpus(source(bytes));
    const reader = source(bytes);
    const from = 3_000_000;
    const to = 3_240_000;
    const packets = await readPacketRange(sound, reader, from, to);
    expect(reader.reads).toHaveLength(1);
    const first = packets[0]!;
    const last = packets.at(-1)!;
    expect(first.startGranule).toBeLessThanOrEqual(from);
    expect(last.startGranule + last.frames).toBeGreaterThan(to);
    for (const item of packets) {
      const index = (item.bytes[1] ?? 0) + ((item.bytes[2] ?? 0) << 8);
      expect(item.startGranule).toBe(index * FRAME_20MS);
    }
  });
});

const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.runIf(ffmpeg)('against ffmpeg', () => {
  it('computes the checksum ffmpeg wrote on its own Ogg', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-sound-'));
    try {
      const file = join(dir, 'tone.ogg');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=440:d=1', '-c:a', 'libopus', '-y', file]);
      expect(pagesOf(new Uint8Array(readFileSync(file))).length).toBeGreaterThan(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('writes a stream ffprobe reads as 48 kHz Opus of the exact length', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-sound-'));
    try {
      // Real packets: ffmpeg's encoder, read by our reader, written again by our writer.
      const original = join(dir, 'a.ogg');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=440:d=70', '-ac', '2', '-c:a', 'libopus', '-y', original]);
      const pages = pagesOf(new Uint8Array(readFileSync(original)));
      const head = packetsOfPage(pages[0]!, null).packets[0]!;
      const writer = new OggOpusWriter(head);
      let carried: CarriedPacket | null = null;
      let frames = 0;
      for (const page of pages.slice(2)) {
        const parts = packetsOfPage(page, carried);
        carried = parts.tail;
        for (const item of parts.packets) {
          writer.addPacket(item);
          frames += opusPacketFrames(item);
        }
      }
      const exact = 70 * 48000;
      expect(frames).toBeGreaterThanOrEqual(exact);
      const file = join(dir, 'b.ogg');
      writeFileSync(file, await bytesOf(writer.finish(exact)));
      const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,duration_ts', '-of', 'csv=p=0', file]).toString().trim();
      expect(probe).toContain('opus,48000,2');
      // Decoding with crc checks on tells us ffmpeg finds nothing wrong, and how long it is.
      const decoded = spawnSync('ffmpeg', ['-v', 'error', '-err_detect', 'crccheck+explode', '-i', file, '-f', 's16le', '-ac', '2', '-'], { maxBuffer: 1 << 26 });
      expect(decoded.stderr.toString()).toBe('');
      expect(decoded.stdout.length / 4).toBe(exact);
    } finally {
      rmSync(dir, { recursive: true });
    }
  }, 30_000);

  it('leaves a tag ffprobe reports as an ordinary comment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-sound-'));
    try {
      const file = join(dir, 'c.ogg');
      writeFileSync(file, await bytesOf(written(3200, 3199 * FRAME_20MS)));
      const tag = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_tags', '-of', 'default=nw=1', file]).toString().toLowerCase();
      expect(tag).toContain(SEEK_COMMENT.toLowerCase());
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
