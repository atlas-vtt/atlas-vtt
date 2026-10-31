import { describe, expect, it } from 'vitest';
import { ASSET_CAPS, GM_LEVEL, isAssetKind, MAX_PROGRESS_ENTRIES, MAX_STORED_BYTES, parseAsset, parseAssetProgress, parseGmMessage, parseVideoAsset } from '../../../../src/app/online/protocol/index.ts';
import { EXPLORED_INLINE_BYTES } from '../../../../src/app/online/protocol/game.ts';

const hash = 'a'.repeat(64);
const id = 'b'.repeat(64);

describe('an asset reference with its stored id', () => {
  it('keeps the id of a reference from the asset store, and refuses a reference without one', () => {
    expect(parseAsset({ hash, size: 10, mime: 'image/png', id })).toEqual({ hash, size: 10, mime: 'image/png', id });
    expect(parseAsset({ hash, size: 10, mime: 'image/png' })).toBeNull();
  });

  it('refuses an id that is no 64-character lowercase hex name', () => {
    expect(parseAsset({ hash, size: 10, mime: 'image/png', id: 'B'.repeat(64) })).toBeNull();
    expect(parseAsset({ hash, size: 10, mime: 'image/png', id: 'b'.repeat(63) })).toBeNull();
    expect(parseAsset({ hash, size: 10, mime: 'image/png', id: 7 })).toBeNull();
  });

  it('bounds the size by the store\'s cap', () => {
    expect(parseVideoAsset({ hash, size: 300 * 1024 * 1024, mime: 'video/webm', id })).toEqual({ hash, size: 300 * 1024 * 1024, mime: 'video/webm', id });
    expect(parseVideoAsset({ hash, size: MAX_STORED_BYTES + 1, mime: 'video/webm', id })).toBeNull();
  });

  it('marks a map stored as a tile pyramid', () => {
    expect(parseAsset({ hash, size: 10, mime: 'image/webp', id, tiles: true })).toEqual({ hash, size: 10, mime: 'image/webp', id, tiles: true });
    expect(parseAsset({ hash, size: 10, mime: 'image/webp', id, tiles: false })).toBeNull();
    expect(parseAsset({ hash, size: 10, mime: 'image/webp', tiles: true })).toBeNull();
  });

  it('names the caps of every kind the store holds', () => {
    expect(Object.keys(ASSET_CAPS).sort()).toEqual(['audio', 'book', 'image', 'text', 'tiles', 'video']);
    expect(ASSET_CAPS.video).toBe(500 * 1024 * 1024);
    expect(isAssetKind('tiles')).toBe(true);
    expect(isAssetKind('font')).toBe(false);
  });
});

describe('the GM reports how far its uploads have come', () => {
  it('reads shares between 0 and 1 by asset id', () => {
    expect(parseGmMessage({ t: 'asset-progress', shares: { [id]: 0.4, [hash]: 1 } })).toEqual({ t: 'asset-progress', shares: { [id]: 0.4, [hash]: 1 } });
    expect(parseAssetProgress({ shares: {} })).toEqual({ t: 'asset-progress', shares: {} });
  });

  it('refuses a share out of range, a name that is no id, and more entries than the cap', () => {
    expect(parseAssetProgress({ shares: { [id]: 1.5 } })).toBeNull();
    expect(parseAssetProgress({ shares: { [id]: Number.NaN } })).toBeNull();
    expect(parseAssetProgress({ shares: { map: 0.5 } })).toBeNull();
    expect(parseAssetProgress({ shares: [] })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: MAX_PROGRESS_ENTRIES + 1 }, (_, index) => [index.toString(16).padStart(64, '0'), 1]));
    expect(parseAssetProgress({ shares: many })).toBeNull();
  });
});

describe('the explored memory', () => {
  const scene = 's1';
  const png = 'AAAA'.repeat(8);

  it('reads an inline PNG, a stored one by its id, and none without either', () => {
    const mask = { hash, size: 5, mime: 'image/png', id };
    expect(parseGmMessage({ t: 'explored', scene, png })).toEqual({ t: 'explored', scene, png });
    expect(parseGmMessage({ t: 'explored', scene, mask })).toEqual({ t: 'explored', scene, mask });
    expect(parseGmMessage({ t: 'explored', scene })).toEqual({ t: 'explored', scene });
  });

  it('refuses both at once, a stored one without its id, and one that is no PNG', () => {
    const mask = { hash, size: 5, mime: 'image/png', id };
    expect(parseGmMessage({ t: 'explored', scene, mask, png })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene, mask: { hash, size: 5, mime: 'image/png' } })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene, mask: { ...mask, mime: 'image/webp' } })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene, mask: null })).toBeNull();
  });

  it('refuses a PNG that is no base64 or larger than the inline cap', () => {
    expect(parseGmMessage({ t: 'explored', scene, png: 'AAA' })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene, png: 'A!AA' })).toBeNull();
    const tooLong = 'A'.repeat(4 * Math.ceil(EXPLORED_INLINE_BYTES / 3) + 4);
    expect(parseGmMessage({ t: 'explored', scene, png: tooLong })).toBeNull();
  });
});

describe('the GM level', () => {
  it('is at least 9: stored assets, the explored memory inline or stored, and no assets over the socket', () => {
    expect(GM_LEVEL).toBeGreaterThanOrEqual(9);
  });
});
