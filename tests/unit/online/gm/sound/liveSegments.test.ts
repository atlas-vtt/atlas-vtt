import { describe, expect, it } from 'vitest';
import { GrowingCopy } from '@/app/sound/codec/growingCopy';
import { OggOpusWriter, type WrittenPage } from '@/app/sound/codec/oggOpusWriter';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';
import { packetsOfSegment, readSegmentManifest } from '@/app/sound/codec/soundSegments';
import type { SoundBytes } from '@/app/sound/soundTypes';
import { LiveSegments } from '@/app/online/gm/sound/liveSegments';
import { uploadSegments } from '@/app/online/gm/assets/segmentsUpload';

const PRE_SKIP = 312;
/** A 20 ms CELT packet. */
const PACKET = Uint8Array.of(31 << 3, 1, 2, 3, 4, 5, 6, 7);
const FRAMES = 960;
const SECOND = 48_000;

/** An Ogg Opus stream of `seconds` of packets: the whole file, and its audio pages as written. */
function stream(seconds: number): { file: Blob; pages: WrittenPage[]; head: Uint8Array<ArrayBuffer> } {
  const head = writeOpusHead(2, PRE_SKIP);
  const pages: WrittenPage[] = [];
  const writer = new OggOpusWriter(head, (page) => pages.push(page));
  const frames = seconds * SECOND;
  for (let written = 0; written < frames + PRE_SKIP; written += FRAMES) writer.addPacket(PACKET);
  return { file: writer.finish(frames), pages, head };
}

const bytesOf = async (blob: Blob): Promise<SoundBytes> => {
  const all = new Uint8Array(await blob.arrayBuffer());
  return { byteLength: all.length, read: (start, end) => Promise.resolve(all.subarray(start, end)) };
};

const positions = async (live: LiveSegments): Promise<number[]> => {
  const batch = await live.batch(0);
  return batch.parts.filter((part) => part.name.endsWith('.ogg')).flatMap((part) => packetsOfSegment(part.bytes, Number(part.name.split('.')[0])).map((packet) => packet.startGranule));
};

describe('a long sound in segments', () => {
  it('from its stored copy: a manifest, then a segment for each half minute, every packet once', async () => {
    const { file } = stream(100);
    const live = await LiveSegments.ofStored(await bytesOf(file));
    expect(live.done).toBe(true);
    expect(live.pieces).toBe(1 + 4);
    expect(readSegmentManifest(new TextDecoder().decode(live.manifest))?.preSkip).toBe(PRE_SKIP);
    const batch = await live.batch(0);
    expect(batch.parts.map((part) => part.name)).toEqual(['manifest.json', '0.ogg', '1.ogg', '2.ogg', '3.ogg']);
    expect(batch.next).toBe(4);
    expect(live.bytes).toBe(batch.parts.reduce((sum, part) => sum + part.bytes.byteLength, 0));
    const starts = await positions(live);
    starts.forEach((start, index) => expect(start).toBe(index * FRAMES));
    expect(live.boundBytes).toBeGreaterThan(live.bytes);
  });

  it('from a copy being made: segments come as its pages do, and it is done when the copy is', async () => {
    const { pages, head } = stream(70);
    const growing = new GrowingCopy({ head, estimatedFrames: 70 * SECOND });
    let byte = 0;
    const feed = (from: number, to: number): void => {
      const batch = pages.slice(from, to);
      const bytes = new Uint8Array(batch.reduce((sum, page) => sum + page.bytes.byteLength, 0));
      let offset = 0;
      for (const page of batch) { bytes.set(page.bytes, offset); offset += page.bytes.byteLength; }
      growing.add({ bytes, pages: batch.map((page) => ({ byte: page.byte, granule: page.startGranule })), endGranule: batch.at(-1)!.granule, estimatedFrames: 70 * SECOND, lufs: -20, truePeakDb: -3 });
      byte += bytes.byteLength;
    };
    feed(0, 20);
    const live = await LiveSegments.ofGrowing(growing);
    expect(live.readyAt(0)).toBe(false);
    feed(20, 40);
    expect(live.readyAt(0)).toBe(true);
    expect(live.readyAt(1)).toBe(false);
    feed(40, pages.length);
    expect(live.done).toBe(false);
    growing.end();
    expect(live.done).toBe(true);
    expect(live.pieces).toBe(1 + 3);
    expect(byte).toBe(growing.byteLength);
    const starts = await positions(live);
    starts.forEach((start, index) => expect(start).toBe(index * FRAMES));
  });
});

describe('a sound in segments going up', () => {
  it('goes in order with the manifest first, settles its true size before the last batch, and says how many are stored', async () => {
    const { file } = stream(300);
    const live = await LiveSegments.ofStored(await bytesOf(file));
    const sent: string[][] = [];
    const events: string[] = [];
    let held = 0;
    const run = await uploadSegments({ id: 'a'.repeat(64), segments: live, next: 0 }, {
      client: {
        putSegments: async (_id, body) => {
          const text = new TextDecoder('latin1').decode(body);
          const names = [...text.matchAll(/; name="([^"]+)"/g)].map((match) => match[1] ?? '');
          sent.push(names);
          events.push(`put ${names.length}`);
          held += names.length;
          return { ok: true, value: { stored: held === live.pieces, pieces: held, of: live.pieces } };
        },
      },
      slot: () => Promise.resolve(() => undefined),
      boundary: () => 'b0undary',
      progress: () => undefined,
      parts: (count) => events.push(`parts ${count}`),
      sent: () => undefined,
      settle: () => { events.push('settle'); return Promise.resolve(); },
      signal: new AbortController().signal,
    });
    expect(run.end).toBe('stored');
    expect(sent.flat()).toEqual(['manifest.json', ...Array.from({ length: 10 }, (_, index) => `${index}.ogg`)]);
    // Eight segments to a batch: the store is told the true size before the batch that ends the sound.
    expect(events).toEqual(['put 9', 'parts 8', 'settle', 'put 2', 'parts 10']);
  });
});
