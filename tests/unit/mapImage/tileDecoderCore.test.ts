import { describe, expect, it } from 'vitest';
import { pyramidOf, tileSourceRect } from '../../../src/app/pixi/mapImage/pyramid';
import type { OpenOutcome } from '../../../src/app/pixi/mapImage/tileDecoderCore';
import type { OpenedPyramid } from '../../../src/app/pixi/mapImage/tileProtocol';
import { sha256 } from '../../../src/app/utils/hashing';
import { coreHarness, fakePng, FakeBitmap, nextTask, useReadableBlobs } from './fakeTileGraphics';

const identity = { path: 'maps/keep.png', size: 1234, mtime: 99 };
/** 3000 × 2000: levels of 24, 6, 2 and 1 tiles. */
const TOTAL_TILES = 33;

function opened(outcome: OpenOutcome): OpenedPyramid {
  if (outcome.kind !== 'opened') throw new Error(`Expected an open, got ${JSON.stringify(outcome)}`);
  return outcome.opened;
}

function fake(bitmap: ImageBitmap | null): FakeBitmap {
  if (!(bitmap instanceof FakeBitmap)) throw new Error('Expected a bitmap');
  return bitmap;
}

describe('TileDecoderCore', () => {
  useReadableBlobs();

  it('decodes once and builds each level by halving the one before', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    expect(map.pyramid).toEqual(pyramidOf(3000, 2000));
    expect(map.hash).toBe(await sha256(fakePng(3000, 2000)));
    await h.completed(map.hash);
    expect(h.graphics.decodes).toHaveLength(1);
    expect(h.graphics.resizes.slice(0, 3)).toEqual([
      { width: 1500, height: 1000 },
      { width: 750, height: 500 },
      { width: 375, height: 250 },
    ]);
  });

  it('serves crops while building and cached tiles once complete', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    const ref = { level: 0, col: 2, row: 1 };
    const early = fake(await h.core.tile(1, map.handle, ref));
    expect(early.origin).toBe('crop');
    const rect = tileSourceRect(map.pyramid, ref);
    expect([early.width, early.height]).toEqual([rect.width, rect.height]);
    await h.completed(map.hash);
    expect(fake(await h.core.tile(2, map.handle, ref)).origin).toBe('cache');
  });

  it('writes the coarsest level first, every tile once, and answers requests before it finishes', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    await nextTask();
    const tile = await h.core.tile(1, map.handle, { level: 0, col: 0, row: 0 });
    expect(tile).not.toBeNull();
    expect(h.events.some((event) => event.type === 'complete')).toBe(false);
    expect(h.graphics.encodes.length).toBeLessThan(TOTAL_TILES);
    await h.completed(map.hash);
    const levelWidths = h.graphics.encodes.map((call) => call.source.width);
    expect(levelWidths).toEqual([...levelWidths].sort((a, b) => a - b));
    expect(levelWidths[0]).toBe(375);
    expect(h.graphics.encodes).toHaveLength(TOTAL_TILES);
    const progress = h.events.filter((event) => event.type === 'progress');
    expect(progress.at(-1)).toEqual({ type: 'progress', hash: map.hash, done: TOTAL_TILES, total: TOTAL_TILES });
    expect((await h.store.readManifest(map.hash))?.complete).toBe(true);
  });

  it('resumes a partial pyramid without encoding what is stored', async () => {
    const h = coreHarness();
    const bytes = fakePng(3000, 2000);
    const hash = await sha256(bytes);
    await h.store.beginPyramid({ hash, width: 3000, height: 2000, decodedScale: 1 });
    const kept = [{ level: 3, col: 0, row: 0 }, { level: 2, col: 1, row: 0 }];
    await h.store.writeTiles(hash, kept.map((ref) => ({ ref, bytes: new Blob(['x'], { type: 'image/webp' }) })));
    opened(await h.core.open(identity, bytes));
    await h.completed(hash);
    expect(h.graphics.encodes).toHaveLength(TOTAL_TILES - kept.length);
    expect((await h.store.existingTiles(hash)).size).toBe(TOTAL_TILES);
  });

  it('releases every decoded level once its tiles are written', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    await h.completed(map.hash);
    await nextTask();
    const levels = h.graphics.bitmaps.filter((b) => b.origin === 'source' || (b.origin === 'resized' && b.width <= 1500 && b.width >= 375));
    expect(levels.length).toBeGreaterThanOrEqual(4);
    expect(levels.every((b) => b.closed)).toBe(true);
    // Coarsest first: the source (level 0) is the last level the build reads.
    expect(h.graphics.encodes.at(-1)?.source.origin).toBe('source');
  });

  it('composes an overview from a decoded level, then from cached tiles', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    const during = fake(await h.core.overview(1, map.handle, 1000));
    expect([during.width, during.height]).toEqual([1000, 667]);
    expect(h.graphics.composes).toHaveLength(0);
    await h.completed(map.hash);
    const after = fake(await h.core.overview(2, map.handle, 1000));
    expect([after.width, after.height]).toEqual([1000, 667]);
    // Level 1 (1500 × 1000) is the coarsest at least 1000 px: its 6 tiles, then a resize.
    expect(h.graphics.composes).toEqual([{ width: 1500, height: 1000, parts: 6 }]);
    const small = fake(await h.core.overview(3, map.handle, 4000));
    expect([small.width, small.height]).toEqual([3000, 2000]);
  });

  it('shares one entry between opens of the same image and drops it after the last close', async () => {
    const h = coreHarness();
    const first = opened(await h.core.open(identity, fakePng(3000, 2000)));
    const second = opened(await h.core.open(null, fakePng(3000, 2000)));
    expect(second.hash).toBe(first.hash);
    expect(second.handle).not.toBe(first.handle);
    expect(h.graphics.decodes).toHaveLength(1);
    expect(h.store.isPinned(first.hash)).toBe(true);
    h.core.close(first.handle);
    expect(await h.core.tile(1, second.handle, { level: 1, col: 0, row: 0 })).not.toBeNull();
    await expect(h.core.tile(2, first.handle, { level: 1, col: 0, row: 0 })).rejects.toThrow(/handle/);
    await h.completed(first.hash);
    h.core.close(second.handle);
    expect(h.store.isPinned(first.hash)).toBe(false);
  });

  it('cancels a request and closes what it made', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    let release = (): void => undefined;
    h.graphics.cropGate = () => new Promise((resolve) => (release = resolve));
    const pending = h.core.tile(7, map.handle, { level: 0, col: 1, row: 1 });
    await nextTask();
    h.core.cancel(7);
    release();
    expect(await pending).toBeNull();
    expect(h.graphics.bitmaps.filter((b) => b.origin === 'crop').every((b) => b.closed)).toBe(true);
  });

  it('cancels pending requests when their map closes', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    let release = (): void => undefined;
    h.graphics.cropGate = () => new Promise((resolve) => (release = resolve));
    const pending = h.core.tile(1, map.handle, { level: 0, col: 0, row: 0 });
    await nextTask();
    h.core.close(map.handle);
    release();
    expect(await pending).toBeNull();
  });

  it('reports a broken image once, as decode-failed', async () => {
    const h = coreHarness();
    const outcome = await h.core.open(identity, fakePng(3000, 2000, { broken: true }));
    expect(outcome).toEqual({ kind: 'failed', failure: { kind: 'decode-failed', message: 'Corrupt image' } });
    expect(h.events.filter((event) => event.type === 'build-failed')).toHaveLength(0);
  });

  it('refuses an image no decoder takes before decoding it', async () => {
    const h = coreHarness();
    const outcome = await h.core.open(identity, fakePng(70000, 100));
    expect(outcome).toMatchObject({ kind: 'failed', failure: { kind: 'too-large', width: 70000, height: 100, maxSide: 65535 } });
    expect(h.graphics.decodes).toHaveLength(0);
  });

  it('opens a cached map by its identity alone, and asks for bytes otherwise', async () => {
    const h = coreHarness();
    expect(await h.core.open(identity, null)).toEqual({ kind: 'need-bytes' });
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    await h.completed(map.hash);
    h.core.close(map.handle);
    const again = opened(await h.core.open(identity, null));
    expect(again.hash).toBe(map.hash);
    expect(h.graphics.decodes).toHaveLength(1);
    expect(fake(await h.core.tile(1, again.handle, { level: 3, col: 0, row: 0 })).origin).toBe('cache');
  });

  it('joins a build in progress by identity without bytes', async () => {
    const h = coreHarness();
    const first = opened(await h.core.open(identity, fakePng(3000, 2000)));
    const second = opened(await h.core.open(identity, null));
    expect(second.hash).toBe(first.hash);
  });

  it('prebuilds without opening, and reports a cached pyramid at once', async () => {
    const h = coreHarness();
    expect(await h.core.prebuild(identity, fakePng(3000, 2000))).toMatchObject({ kind: 'prebuilt', complete: true });
    expect(h.store.isPinned(await sha256(fakePng(3000, 2000)))).toBe(false);
    expect(await h.core.prebuild(identity, null)).toMatchObject({ kind: 'prebuilt', complete: true });
    expect(h.graphics.decodes).toHaveLength(1);
  });

  it('lets a second build wait for memory, and stops a build nobody shows for it', async () => {
    // Each 3000 × 2000 build costs 32 MB of levels; the budget holds one.
    const h = coreHarness({ decodedBudget: 40_000_000 });
    const background = h.core.prebuild(null, fakePng(3000, 2000, { salt: 1 }));
    await nextTask();
    const shown = opened(await h.core.open(null, fakePng(3000, 2000, { salt: 2 })));
    expect(await background).toMatchObject({ kind: 'prebuilt', complete: false });
    await h.completed(shown.hash);
    const resumed = await h.core.prebuild(null, fakePng(3000, 2000, { salt: 1 }));
    expect(resumed).toMatchObject({ kind: 'prebuilt', complete: true });
  });

  it('keeps an open build running and makes the next one wait', async () => {
    const h = coreHarness({ decodedBudget: 40_000_000 });
    const first = opened(await h.core.open(null, fakePng(3000, 2000, { salt: 1 })));
    let secondOpened = false;
    const second = h.core.open(null, fakePng(3000, 2000, { salt: 2 })).then((outcome) => {
      secondOpened = true;
      return outcome;
    });
    await nextTask();
    await nextTask();
    expect(secondOpened).toBe(false);
    await h.completed(first.hash);
    expect(opened(await second).hash).not.toBe(first.hash);
  });

  it('keeps showing crops when the cache is cleared during a build', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    await nextTask();
    await h.core.clearCache();
    for (let i = 0; i < 40; i++) await nextTask();
    expect(h.events.some((event) => event.type === 'complete')).toBe(false);
    expect(fake(await h.core.tile(1, map.handle, { level: 0, col: 5, row: 3 })).origin).toBe('crop');
    h.core.close(map.handle);
    await nextTask();
    expect(h.graphics.bitmaps.filter((b) => b.origin === 'source').every((b) => b.closed)).toBe(true);
  });

  it('counts cache bytes and clears them', async () => {
    const h = coreHarness();
    const map = opened(await h.core.open(identity, fakePng(3000, 2000)));
    await h.completed(map.hash);
    expect(await h.core.cacheSize()).toBeGreaterThan(0);
    await h.core.clearCache();
    expect(await h.core.cacheSize()).toBe(0);
    expect(await h.store.existingTiles(map.hash)).toEqual(new Set());
  });
});
