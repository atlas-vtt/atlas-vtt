import { describe, expect, it } from 'vitest';
import { GrowingCopy } from '@/app/sound/codec/growingCopy';
import { OggOpusWriter, type WrittenPage } from '@/app/sound/codec/oggOpusWriter';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';
import { LiveSegments } from '@/app/online/gm/sound/liveSegments';
import { ASSET_USES } from '@/app/online/gm/assets/assetUses';
import { publisherHarness } from './fakeAssetStore';

const SECOND = 48_000;
const PACKET = Uint8Array.of(31 << 3, 1, 2, 3, 4, 5, 6, 7);

/** The audio pages of `seconds` of a stream, as a conversion writes them. */
function pages(seconds: number): { head: Uint8Array<ArrayBuffer>; pages: WrittenPage[] } {
  const head = writeOpusHead(2, 312);
  const written: WrittenPage[] = [];
  const writer = new OggOpusWriter(head, (page) => written.push(page));
  for (let at = 0; at < seconds * SECOND + 312; at += 960) writer.addPacket(PACKET);
  writer.finish(seconds * SECOND);
  return { head, pages: written };
}

describe('a sound in segments, from the publisher', () => {
  it('goes up as its copy is made, tells players each segment stored, and settles at its true size before it is stored', async () => {
    const harness = publisherHarness();
    harness.connection = { players: 1, latencyMs: 40 };
    const made = pages(200);
    const growing = new GrowingCopy({ head: made.head, estimatedFrames: 200 * SECOND });
    const feed = (from: number, to: number): void => {
      const batch = made.pages.slice(from, to);
      const bytes = new Uint8Array(batch.reduce((sum, page) => sum + page.bytes.byteLength, 0));
      let offset = 0;
      for (const page of batch) { bytes.set(page.bytes, offset); offset += page.bytes.byteLength; }
      growing.add({ bytes, pages: batch.map((page) => ({ byte: page.byte, granule: page.startGranule })), endGranule: batch.at(-1)!.granule, estimatedFrames: 200 * SECOND, lufs: -20, truePeakDb: -3 });
    };
    // A minute is converted before players are handed it.
    feed(0, 62);
    const live = await LiveSegments.ofGrowing(growing);
    const ref = await harness.publisher.storing.segmentsRef('k'.repeat(64), 1, live, { ...ASSET_USES.audio, kind: 'segments' }, true);
    if (!ref) throw new Error('No reference.');
    expect(ref.segments).toBe(true);
    harness.hand(ref);
    await harness.advance(1000);
    const offered = harness.client.offers.flat().find((asset) => asset.id === ref.id);
    expect(offered).toMatchObject({ kind: 'segments', size: live.boundBytes, segments: { pieces: live.boundPieces } });
    // A segment is cut once a page of the next begins: the two full half-minutes went at once, with the manifest.
    expect(harness.client.batches.map((batch) => batch.names)).toEqual([['manifest.json', '0.ogg', '1.ogg']]);
    feed(62, made.pages.length);
    growing.end();
    await harness.advance(2000);
    const names = harness.client.batches.flatMap((batch) => batch.names);
    expect(names).toEqual(['manifest.json', ...Array.from({ length: 7 }, (_, index) => `${index}.ogg`)]);
    // The true size and pieces were offered before the batch that ended it.
    const settle = harness.client.offers.flat().filter((asset) => asset.id === ref.id).at(-1);
    expect(settle).toMatchObject({ size: live.bytes, segments: { pieces: 8 } });
    const progress = harness.sent.map((sent) => sent.body).filter((body) => body.t === 'asset-progress');
    const parts = progress.flatMap((body) => (body.t === 'asset-progress' && body.parts?.[ref.id] !== undefined ? [body.parts[ref.id]] : []));
    expect(parts).toContain(2);
    expect(parts.at(-1)).toBe(7);
    expect(harness.publisher.copyState(ref.id)).toEqual({ state: 'ready' });
  });

  it('stops offering segments where the store does not take them, so long sounds go whole', async () => {
    const harness = publisherHarness();
    harness.client.answer = (asset) => (asset.kind === 'segments' ? { answer: 'refused', reason: 'kind' } : { answer: 'need', upload: 'single', partBytes: 95 * 1024 * 1024 });
    const made = pages(90);
    const growing = new GrowingCopy({ head: made.head, estimatedFrames: 90 * SECOND });
    const live = await LiveSegments.ofGrowing(growing);
    const ref = await harness.publisher.storing.segmentsRef('k'.repeat(64), 1, live, { ...ASSET_USES.audio, kind: 'segments' }, true);
    if (!ref) throw new Error('No reference.');
    harness.hand(ref);
    expect(harness.publisher.storing.segmentsTaken()).toBe(true);
    await harness.advance(1000);
    expect(harness.publisher.storing.segmentsTaken()).toBe(false);
    expect(harness.withdrawn).toBe(1);
  });

  it('tells pages every segment of a sound the store holds already', async () => {
    const harness = publisherHarness();
    harness.client.answer = () => ({ answer: 'have' });
    const made = pages(90);
    // A copy stored in an earlier session: its segments are cut whole at once.
    const growing = new GrowingCopy({ head: made.head, estimatedFrames: 90 * SECOND });
    const bytes = new Uint8Array(made.pages.reduce((sum, page) => sum + page.bytes.byteLength, 0));
    let offset = 0;
    for (const page of made.pages) { bytes.set(page.bytes, offset); offset += page.bytes.byteLength; }
    growing.add({ bytes, pages: made.pages.map((page) => ({ byte: page.byte, granule: page.startGranule })), endGranule: made.pages.at(-1)!.granule, estimatedFrames: 90 * SECOND, lufs: -20, truePeakDb: -3 });
    growing.end();
    const live = await LiveSegments.ofGrowing(growing);
    expect(live.pieces).toBe(1 + 3);
    const ref = await harness.publisher.storing.segmentsRef('k'.repeat(64), 1, live, { ...ASSET_USES.audio, kind: 'segments' }, true);
    if (!ref) throw new Error('No reference.');
    harness.hand(ref);
    await harness.advance(1000);
    expect(harness.client.batches).toEqual([]);
    const parts = harness.sent.flatMap((sent) => (sent.body.t === 'asset-progress' && sent.body.parts?.[ref.id] !== undefined ? [sent.body.parts[ref.id]] : []));
    expect(parts.at(-1)).toBe(live.pieces - 1);
  });
});
