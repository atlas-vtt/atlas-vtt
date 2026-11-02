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
  copyRef: async (copy) => ({ ...copy, id: `id-${copy.hash}` }),
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
