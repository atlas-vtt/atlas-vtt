import { describe, expect, it } from 'vitest';
import { MAX_SERVES_PER_ASSET, REPEAT_REQUEST_MS, ServedAssets } from '../../../../src/app/online/gm/assetServe.ts';

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe("how often a player is sent one asset", () => {
  it('ignores the same request within the window and serves it again after', () => {
    const served = new ServedAssets();
    expect(served.take('alice', HASH, 0, 0)).toBe(true);
    expect(served.take('alice', HASH, 0, REPEAT_REQUEST_MS - 1)).toBe(false);
    expect(served.take('alice', HASH, 0, REPEAT_REQUEST_MS)).toBe(true);
  });

  it('serves a download continued from another chunk', () => {
    const served = new ServedAssets();
    expect(served.take('alice', HASH, 0, 0)).toBe(true);
    expect(served.take('alice', HASH, 7, 1)).toBe(true);
  });

  it('stops at the cap whatever chunk or longest side is asked for, per player and asset', () => {
    const served = new ServedAssets();
    let taken = 0;
    for (let from = 0; from < 50; from++) if (served.take('alice', HASH, from, from)) taken += 1;
    for (let side = 256; side < 306; side++) if (served.take('alice', `${HASH}@${side}`, 0, 100 + side)) taken += 1;
    expect(taken).toBe(MAX_SERVES_PER_ASSET);
    expect(served.take('alice', OTHER, 0, 400)).toBe(true);
    expect(served.take('bob', HASH, 0, 400)).toBe(true);
  });

  it('serves again once the window has passed', () => {
    const served = new ServedAssets();
    for (let from = 0; from < MAX_SERVES_PER_ASSET; from++) served.take('alice', HASH, from, 0);
    expect(served.take('alice', HASH, 9, 1)).toBe(false);
    expect(served.take('alice', HASH, 9, REPEAT_REQUEST_MS)).toBe(true);
  });

  it('lets a player who left and came back repeat a request at once', () => {
    const served = new ServedAssets();
    expect(served.take('alice', HASH, 0, 0)).toBe(true);
    served.forget('alice');
    expect(served.take('alice', HASH, 0, 1)).toBe(true);
  });

  it('keeps the cap when a player leaves and comes back, or is refused, over and over', () => {
    const served = new ServedAssets();
    let taken = 0;
    for (let round = 0; round < 40; round++) {
      if (served.take('alice', HASH, 0, round)) taken += 1;
      if (round % 2 === 0) served.forget('alice');
      else served.forget('alice', HASH);
    }
    served.clear();
    if (served.take('alice', HASH, 0, 50)) taken += 1;
    expect(taken).toBe(MAX_SERVES_PER_ASSET);
  });

  it('remembers nothing older than a window, however long requests keep coming', () => {
    const served = new ServedAssets();
    const assets = Array.from({ length: 40 }, (_, index) => index.toString(16).padStart(64, '0'));
    let most = 0;
    // An hour of one player asking for every asset from another chunk and at another side each second.
    for (let second = 0; second < 3600; second++) {
      for (const asset of assets) served.take('alice', `${asset}@${256 + second}`, second % 300, second * 1000);
      most = Math.max(most, served.size);
    }
    // Per asset: the sends of this window and the last, and one count.
    expect(most).toBeLessThanOrEqual(assets.length * (2 * MAX_SERVES_PER_ASSET + 1));
  });
});
