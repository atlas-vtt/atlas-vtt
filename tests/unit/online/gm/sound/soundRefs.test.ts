import { describe, expect, it } from 'vitest';
import { SoundRefs } from '../../../../../src/app/online/gm/sound/soundRefs';
import { ASSET_USES } from '../../../../../src/app/online/gm/assets/assetUses';
import type { SoundBytes } from '../../../../../src/app/sound/soundTypes';

const bytesOf = (...values: number[]): SoundBytes => {
  const all = Uint8Array.from(values);
  return { byteLength: all.length, read: async (start, end) => all.slice(start, end) };
};

/** A store that names a copy by its hash, as the publisher does. */
const refsOver = (bytes: () => Promise<SoundBytes>): SoundRefs => new SoundRefs({
  bytes,
  growing: () => null,
  copyRef: async (copy) => ({ ...copy, id: `id-${copy.hash}` }),
  segmentsRef: () => Promise.resolve(null),
});

describe('the reference of a sound', () => {
  it('follows the bytes of the copy, not the file it was made from: a copy made anew is a new asset', async () => {
    const first = await refsOver(async () => bytesOf(1, 2, 3)).ensure('source-hash', ASSET_USES.audio, true);
    const remade = await refsOver(async () => bytesOf(1, 2, 3, 4)).ensure('source-hash', ASSET_USES.audio, true);
    expect(first?.id).toBeTruthy();
    expect(remade?.id).not.toBe(first?.id);
  });

  it('hashes again where the copy was gone', async () => {
    let held: SoundBytes | null = null;
    const refs = refsOver(async () => {
      if (!held) throw new Error('The copy is gone.');
      return held;
    });
    expect(await refs.ensure('source-hash', ASSET_USES.audio, true)).toBeNull();
    held = bytesOf(9);
    expect((await refs.ensure('source-hash', ASSET_USES.audio, true))?.size).toBe(1);
  });
});

describe('how a sound goes up', () => {
  it('whole where its stored copy is small, in segments where it is long or still being made', async () => {
    const { OggOpusWriter } = await import('@/app/sound/codec/oggOpusWriter');
    const { writeOpusHead } = await import('@/app/sound/codec/opusFormat');
    const { GrowingCopy } = await import('@/app/sound/codec/growingCopy');
    const writer = new OggOpusWriter(writeOpusHead(2, 312));
    // About 4.5 MiB of 20 ms packets: over what goes whole.
    const packet = new Uint8Array(1200).fill(7);
    packet[0] = 31 << 3;
    for (let index = 0; index < 4000; index++) writer.addPacket(packet);
    const long = new Uint8Array(await writer.finish(3990 * 960).arrayBuffer());
    const segmented: { key: string; kind: string; handed: boolean }[] = [];
    const refs = (bytes: Uint8Array, growing: InstanceType<typeof GrowingCopy> | null): SoundRefs => new SoundRefs({
      bytes: () => Promise.resolve({ byteLength: bytes.length, read: (start, end) => Promise.resolve(bytes.subarray(start, end)) }),
      growing: () => growing,
      copyRef: async (copy) => ({ ...copy, id: `whole-${copy.hash}` }),
      segmentsRef: async (key, _version, segments, use, handed) => {
        segmented.push({ key, kind: use.kind, handed });
        return { hash: key, size: segments.boundBytes, mime: 'audio/ogg', id: `segments-${key}`, segments: true };
      },
    });
    expect((await refs(new Uint8Array([1, 2, 3]), null).ensure('small', ASSET_USES.audio, true))?.id).toMatch(/^whole-/);
    expect((await refs(long, null).ensure('long', ASSET_USES.audio, true))?.segments).toBe(true);
    const growing = new GrowingCopy({ head: writeOpusHead(2, 312), estimatedFrames: 600 * 48_000 });
    expect((await refs(new Uint8Array(0), growing).ensure('growing', ASSET_USES.audio, false))?.id).toBe('segments-growing');
    expect(segmented).toEqual([{ key: 'long', kind: 'segments', handed: true }, { key: 'growing', kind: 'segments', handed: false }]);
  });
});

describe('a store before segments', () => {
  it('takes a long sound whole, and one still being made once its copy is stored', async () => {
    const { writeOpusHead } = await import('@/app/sound/codec/opusFormat');
    const { GrowingCopy } = await import('@/app/sound/codec/growingCopy');
    const growing = new GrowingCopy({ head: writeOpusHead(2, 312), estimatedFrames: 600 * 48_000 });
    let made: typeof growing | null = growing;
    const refs = new SoundRefs({
      bytes: () => Promise.resolve({ byteLength: 8 * 1024 * 1024, read: (start, end) => Promise.resolve(new Uint8Array(end - start)) }),
      growing: () => made,
      copyRef: async (copy) => ({ ...copy, id: `whole-${copy.hash}` }),
      segmentsRef: () => { throw new Error('No segments on this store.'); },
      segmentsTaken: () => false,
    });
    expect(await refs.ensure('k', ASSET_USES.audio, true)).toBeNull();
    expect(refs.known('k')).toBeNull();
    made = null;
    growing.end();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refs.known('k')).toBeUndefined();
    expect((await refs.ensure('k', ASSET_USES.audio, true))?.id).toMatch(/^whole-/);
  });
});
