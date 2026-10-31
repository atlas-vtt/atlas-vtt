import { describe, expect, it } from 'vitest';
import { AssetIds, assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';

const SALT = Uint8Array.from({ length: 32 }, (_, n) => n);
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('asset ids', () => {
  // Worked out with Node's `crypto.createHmac('sha256', salt).update(hash)`.
  it('are HMAC-SHA-256 of the content hash as written, keyed by the salt', async () => {
    expect(await assetIdOf(SALT, EMPTY_HASH)).toBe('1d599a6a088a2ac210a6cdab512575e435c8759afb2ad37dd34c08af174d07c0');
    expect(await assetIdOf(new Uint8Array(32).fill(0xab), 'a'.repeat(64))).toBe('ef62a6a7f17fbe585ece5c49d13a6ee86de4892682c3d8d0b8712e91ab90881b');
  });

  it('differ between salts, so two GMs\' copies of one file have two ids', async () => {
    const other = Uint8Array.from({ length: 32 }, (_, n) => 31 - n);
    expect(await assetIdOf(other, EMPTY_HASH)).not.toBe(await assetIdOf(SALT, EMPTY_HASH));
  });

  it('are worked out once per hash and kept within a limit', async () => {
    const ids = new AssetIds(SALT, 2);
    const first = ids.of(EMPTY_HASH);
    expect(ids.of(EMPTY_HASH)).toBe(first);
    ids.of('b'.repeat(64));
    ids.of('c'.repeat(64));
    expect(ids.of(EMPTY_HASH)).not.toBe(first);
    expect(await ids.of(EMPTY_HASH)).toBe(await first);
    expect(ids.isOf(SALT)).toBe(true);
    expect(ids.isOf(new Uint8Array(32))).toBe(false);
  });
});
