import { describe, expect, it } from 'vitest';
import { FLAG_LAST, lacingOf, writePage } from '@/app/sound/codec/oggPages';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';
import { encodeSegmentManifest, packetsOfSegment, readSegmentManifest, SegmentCutter, segmentIndexOf, segmentManifest, type CutSegment } from '@/app/sound/codec/soundSegments';

const PRE_SKIP = 312;
/** A 20 ms CELT packet: TOC config 31 (20 ms), one frame. */
const PACKET = Uint8Array.of(31 << 3, 1, 2, 3);
const FRAMES = 960;

/** A page of `count` packets, ending at `granule`. */
const page = (granule: number, count: number, flags = 0): Uint8Array => {
  const body = Array.from({ length: count }, () => PACKET);
  return writePage({ flags, granule, serial: 1, sequence: 0, segments: body.flatMap((packet) => lacingOf(packet.length)), body });
};

describe('a segment manifest', () => {
  it('reads back what was written, and nothing that is not one', () => {
    const manifest = segmentManifest(writeOpusHead(2, PRE_SKIP));
    expect(readSegmentManifest(encodeSegmentManifest(manifest))).toEqual(manifest);
    for (const text of ['', 'null', '{}', '{"format":2}', JSON.stringify({ ...JSON.parse(encodeSegmentManifest(manifest)), head: btoa('nope') }), 'x'.repeat(10_000)]) {
      expect(readSegmentManifest(text)).toBeNull();
    }
  });
});

describe('cutting a copy into segments', () => {
  it('keeps each page with the segment its start lies in, the last with the one before it, and reads back every position', () => {
    const segmentFrames = 10 * FRAMES;
    const segments: CutSegment[] = [];
    const cutter = new SegmentCutter(PRE_SKIP, (segment) => segments.push(segment), segmentFrames);
    // Pages of four packets from granule 0 (pre-skip included); the last page starts in a later segment and is end-trimmed.
    let start = 0;
    for (let index = 0; index < 6; index++) {
      cutter.add(page(start + 4 * FRAMES, 4), start);
      start += 4 * FRAMES;
    }
    cutter.add(page(start + 4 * FRAMES - 500, 4, FLAG_LAST), start);
    cutter.finish();
    expect(segmentIndexOf(start, PRE_SKIP, segmentFrames)).toBe(2);
    expect(segments.map((segment) => segment.index)).toEqual([0, 1]);
    const packets = segments.flatMap((segment) => packetsOfSegment(segment.bytes, segment.index));
    expect(packets.map((packet) => packet.startGranule)).toEqual(Array.from({ length: 28 }, (_, index) => index * FRAMES));
  });
});
