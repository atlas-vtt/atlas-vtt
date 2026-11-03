import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { GrowingCopy } from '@/app/sound/codec/growingCopy';
import { openOggOpus, type PositionedPacket } from '@/app/sound/codec/oggOpusReader';
import { encodeSegmentManifest, packetsOfSegment, readSegmentManifest, SegmentCutter, segmentIndexOf, segmentManifest, type CutSegment } from '@/app/sound/codec/soundSegments';
import type { WindowedSound } from '@/app/sound/codec/windowedSound';
import { SoundImporter } from '@/app/sound/codec/soundImporter';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { STREAM_START_FRAMES } from '@/app/soundDirector/growingCopies';
import { memoryBytes, musicOf, render, tableOf } from './soundHarness';

const SECONDS = 180;

/** A stereo 44.1 kHz WAV: a tone over a quieter, slower one, so every window differs from the next. */
function wave(seconds: number): Blob {
  const rate = 44_100;
  const frames = seconds * rate;
  const bytes = new Uint8Array(44 + frames * 4);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => bytes.set(new TextEncoder().encode(value), at);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) {
    const value = 0.2 * Math.sin((2 * Math.PI * 330 * i) / rate) + 0.1 * Math.sin((2 * Math.PI * 0.5 * i) / rate) * Math.sin((2 * Math.PI * 97 * i) / rate);
    view.setInt16(44 + i * 4, Math.round(value * 32767), true);
    view.setInt16(46 + i * 4, Math.round(value * 30000), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * A copy played while it is made: the real worker streams its pages, playing can begin long before the copy
 * is whole, and what plays from the growing pages is the stored copy's own stream, sample for sample.
 */
describe('a copy that plays while it is made', () => {
  it('can play within a fraction of its making, and is the stored copy\'s very stream', async () => {
    const importer = new SoundImporter();
    let growing: GrowingCopy | null = null;
    let playableAt = 0;
    const started = performance.now();
    const result = await importer.run({ source: wave(SECONDS), kind: 'music', loop: false, stream: true }, undefined, {
      start: (start) => { growing = new GrowingCopy(start); },
      pages: (pages) => {
        growing?.add(pages);
        if (playableAt === 0 && growing && growing.frames >= STREAM_START_FRAMES && Number.isFinite(growing.lufs)) playableAt = performance.now() - started;
      },
    });
    const total = performance.now() - started;
    importer.dispose();
    const copy = growing as GrowingCopy | null;
    if (!copy) throw new Error('No pages came.');
    copy.end();
    await commands.writeFile('tests/gpu/sound/__screenshots__/sound-streaming/measures.txt', `${SECONDS} s at 44.1 kHz: playable after ${playableAt.toFixed(0)} ms, whole after ${total.toFixed(0)} ms\n`);
    expect(playableAt).toBeGreaterThan(0);
    expect(playableAt).toBeLessThan(total / 2);
    expect(Math.abs(copy.estimatedFrames - SECONDS * 48_000)).toBeLessThan(48_000);

    const stored = new Uint8Array(await result.bytes.arrayBuffer());
    const header = await openOggOpus(memoryBytes(stored));
    expect(new Uint8Array(await copy.read(0, copy.byteLength))).toEqual(stored.subarray(header.audioStart));
    expect(copy.preSkip).toBe(header.preSkip);

    const playing = (info: Omit<SoundInfo, 'key'>) => tableOf({ music: musicOf([{ key: 'g', ...info }], { startAt: 0 }) });
    const fromGrowing = await render(playing({ frames: result.frames, gainDb: 0, growing: true }), { files: new Map() }, { seconds: 4, options: { resolve: () => copy } });
    const fromStored = await render(playing({ frames: result.frames, gainDb: 0 }), { files: new Map([['g', stored]]) }, { seconds: 4 });
    let largest = 0;
    for (let i = 0; i < fromStored.length; i++) largest = Math.max(largest, Math.abs((fromGrowing[i] ?? 0) - (fromStored[i] ?? 0)));
    expect(largest).toBeLessThan(1e-6);
    expect(Math.max(...fromStored.subarray(48_000, 96_000).map(Math.abs))).toBeGreaterThan(0.05);
  }, 120_000);

  it('plays the same from segments cut as the copy is made, fetched by position alone', async () => {
    const importer = new SoundImporter();
    let cutter: SegmentCutter | null = null;
    let manifestText = '';
    const segments: CutSegment[] = [];
    const result = await importer.run({ source: wave(SECONDS), kind: 'music', loop: false, stream: true }, undefined, {
      start: (start) => {
        manifestText = encodeSegmentManifest(segmentManifest(start.head));
        cutter = new SegmentCutter(segmentManifest(start.head).preSkip, (segment) => segments.push(segment));
      },
      pages: (pages) => {
        pages.pages.forEach((page, index) => {
          const end = pages.pages[index + 1]?.byte ?? pages.pages[0]!.byte + pages.bytes.byteLength;
          cutter?.add(pages.bytes.subarray(page.byte - pages.pages[0]!.byte, end - pages.pages[0]!.byte), page.granule);
        });
      },
    });
    importer.dispose();
    (cutter as SegmentCutter | null)?.finish();
    const manifest = readSegmentManifest(manifestText);
    if (!manifest) throw new Error('No manifest.');
    expect(segments.map((segment) => segment.index)).toEqual(Array.from({ length: segments.length }, (_, index) => index));
    expect(segments.length).toBe(Math.ceil(SECONDS / 30));

    // A page's view: the manifest, then only the segments a range names.
    const fetched = new Set<number>();
    const segmented: WindowedSound = {
      windowed: true,
      stream: manifest,
      packets: (from, to) => {
        const last = segments.length - 1;
        const first = Math.min(last, segmentIndexOf(from, manifest.preSkip, manifest.segmentFrames));
        const end = Math.min(last, segmentIndexOf(to, manifest.preSkip, manifest.segmentFrames));
        const packets: PositionedPacket[] = [];
        for (let index = first; index <= end; index++) {
          fetched.add(index);
          packets.push(...packetsOfSegment(segments[index]!.bytes, index));
        }
        return Promise.resolve(packets);
      },
    };
    const stored = new Uint8Array(await result.bytes.arrayBuffer());
    const table = (info: Omit<SoundInfo, 'key'>, startAt: number) => tableOf({ music: musicOf([{ key: 'g', ...info }], { startAt }) });
    // From the start, and joined late across a segment's edge (2 s either side of 60 s).
    for (const startAt of [0, -58_000]) {
      const fromSegments = await render(table({ frames: result.frames, gainDb: 0 }, startAt), { files: new Map() }, { seconds: 4, options: { resolve: () => segmented } });
      const fromStored = await render(table({ frames: result.frames, gainDb: 0 }, startAt), { files: new Map([['g', stored]]) }, { seconds: 4 });
      let largest = 0;
      for (let i = 0; i < fromStored.length; i++) largest = Math.max(largest, Math.abs((fromSegments[i] ?? 0) - (fromStored[i] ?? 0)));
      expect(largest, `joined at ${-startAt} ms`).toBeLessThan(1e-6);
    }
    expect([...fetched].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    // Every packet of the copy, once, in order, from its segments alone.
    const all = segments.flatMap((segment) => packetsOfSegment(segment.bytes, segment.index));
    for (let i = 1; i < all.length; i++) expect(all[i]!.startGranule).toBe(all[i - 1]!.startGranule + all[i - 1]!.frames);
    const header = await openOggOpus(memoryBytes(stored));
    expect(all.at(-1)!.startGranule + all.at(-1)!.frames).toBeGreaterThanOrEqual(header.preSkip + result.frames);
  }, 120_000);
});
