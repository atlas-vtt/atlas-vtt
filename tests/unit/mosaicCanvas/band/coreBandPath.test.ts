// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BandUnsupportedError } from '../../../../src/app/imageProcessing/band/bandTypes';
import { bandBuildCost } from '../../../../src/app/pixi/mosaicCanvas/band/bandBuild';
import { decodedSizeCost } from '../../../../src/app/pixi/mosaicCanvas/decodedLevels';
import { pyramidOf, tesseraKey } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import { coreHarness, fakePng, useReadableBlobs } from '../fakeTesseraGraphics';
import { fakeBandDecoder } from './fakeBandDecoder';

/**
 * The tessera core on an image the browser cannot decode: the band decoder gives the pyramid, the
 * build writes rows, and requests for tesserae it has not reached wait. The fake PNG header stands in
 * for a huge file; the fake decoder is handed in, as the real lookup would refuse so small an image.
 */
describe('the tessera core reading a map in bands', () => {
  useReadableBlobs();

  it('opens the map with the pyramid the decoder names and serves a tessera once the build has written it', async () => {
    // 2,100 wide for the eighth pass, 600 high for a second tessera row: small enough for a CI runner.
    const [width, height] = [2100, 600];
    const decoder = fakeBandDecoder({ width, height, bandRows: 200 });
    const h = coreHarness({ bandDecoderOf: () => Promise.resolve(decoder) });
    const identity = { path: 'huge.png', size: 32, mtime: 1 };

    expect(await h.core.open(identity, null)).toEqual({ kind: 'need-bytes' });
    const opened = await h.core.open(identity, fakePng(width, height));
    if (opened.kind !== 'opened') throw new Error(opened.kind);

    expect(opened.opened.pyramid).toEqual(pyramidOf(width, height));
    // Asked before the build reaches it: waits for the tessera rather than failing on the cache miss.
    const tessera = await h.core.tessera(1, opened.opened.handle, { level: 0, col: 1, row: 1 }).catch(() => null);
    expect(h.events.filter((event) => event.type === 'build-failed')).toEqual([]);
    expect(tessera?.width).toBe(512);
    await h.completed(opened.opened.hash);
    expect(decoder.decodes).toEqual([8, 1]);
    expect(h.graphics.bitmaps.filter((bitmap) => bitmap.origin === 'pixels').length).toBeGreaterThan(0);
    const total = pyramidOf(width, height).levels.reduce((sum, level) => sum + level.cols * level.rows, 0);
    expect((await h.store.existingTesserae(opened.opened.hash)).size).toBe(total);
    // Served from the cache now, with the overview composed from the coarse levels.
    const overview = await h.core.overview(2, opened.opened.handle, 256);
    expect(overview && Math.max(overview.width, overview.height)).toBe(256);
    h.core.close(opened.opened.handle);
  }, 60_000);

  it('composes the overview asked for before the build wrote a tessera, waiting for all of them at once, and the build goes on', async () => {
    const [width, height] = [4100, 700];
    const decoder = fakeBandDecoder({ width, height, bandRows: 200 });
    const h = coreHarness({ bandDecoderOf: () => Promise.resolve(decoder) });
    const opened = await h.core.open({ path: 'huge.png', size: 32, mtime: 1 }, fakePng(width, height));
    if (opened.kind !== 'opened') throw new Error(opened.kind);

    // Every tessera of the overview's level is waited for under one request; the build must not wait for that request in turn.
    const overview = await h.core.overview(7, opened.opened.handle, 1024);

    expect(overview && Math.max(overview.width, overview.height)).toBe(1024);
    await h.completed(opened.opened.hash);
    expect(h.events.filter((event) => event.type === 'build-failed')).toEqual([]);
    h.core.close(opened.opened.handle);
  }, 30_000);

  it('reports what the decoder refuses, with the header\'s size, instead of trying to decode', async () => {
    const decoder = {
      ...fakeBandDecoder({ width: 20, height: 10 }),
      inspect: () => { throw new BandUnsupportedError('progressive', 'progressive JPEG'); },
    };
    const h = coreHarness({ bandDecoderOf: () => Promise.resolve(decoder) });

    const outcome = await h.core.open({ path: 'turned.png', size: 32, mtime: 1 }, fakePng(20000, 20000));

    expect(outcome).toEqual({ kind: 'failed', failure: { kind: 'unsupported', width: 20000, height: 20000, reason: 'progressive' } });
    expect(decoder.decodes).toEqual([]);
  });

  it('resumes a build that gave way to a map being opened, skipping the tesserae it wrote', async () => {
    const [width, height] = [4100, 700];
    let stops = 0;
    const decoder = fakeBandDecoder({ width, height, bandRows: 400 });
    // Room for the band build alone, not for it and the second map's decoded levels together.
    const h = coreHarness({ bandDecoderOf: () => Promise.resolve(decoder), decodedBudget: bandBuildCost(width, 32) + decodedSizeCost(300, 200) - 1 });
    const identity = { path: 'huge.png', size: 32, mtime: 1 };
    const prebuilt = h.core.prebuild(identity, fakePng(width, height));
    // A second map opening makes the prebuild, which nobody shows, give way.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const other = await h.core.open({ path: 'small.png', size: 32, mtime: 2 }, fakePng(300, 200));
    if (other.kind !== 'opened') throw new Error(other.kind);
    const first = await prebuilt;
    if (first.kind !== 'prebuilt') throw new Error(first.kind);
    if (!first.complete) stops += 1;
    h.core.close(other.opened.handle);

    const again = await h.core.prebuild(identity, fakePng(width, height));

    expect(again).toMatchObject({ kind: 'prebuilt', complete: true });
    const total = pyramidOf(width, height).levels.reduce((sum, level) => sum + level.cols * level.rows, 0);
    expect((await h.store.existingTesserae(first.hash)).size).toBe(total);
    expect(new Set((await h.store.existingTesserae(first.hash))).has(tesseraKey({ level: 0, col: 0, row: 0 }))).toBe(true);
    expect(stops).toBeLessThanOrEqual(1);
  }, 60_000);
});

describe('a window of a map read from the tessera core', () => {
  useReadableBlobs();

  it('is composed from the tesserae of the finest level that shows it within the side asked for', async () => {
    const [width, height] = [4100, 1100];
    const decoder = fakeBandDecoder({ width, height, bandRows: 400 });
    const h = coreHarness({ bandDecoderOf: () => Promise.resolve(decoder) });
    const opened = await h.core.open({ path: 'huge.png', size: 32, mtime: 1 }, fakePng(width, height));
    if (opened.kind !== 'opened') throw new Error(opened.kind);

    // 1,000 × 600 at level 0 fits 1,024: level 0, five tesserae across the content boundary at 510 and 1,020, two rows.
    const bitmap = await h.core.window(9, opened.opened.handle, { x: 600, y: 400, width: 1000, height: 600 }, 1024);
    expect(bitmap && [bitmap.width, bitmap.height]).toEqual([1000, 600]);
    expect(h.graphics.composes.at(-1)).toEqual({ width: 1000, height: 600, parts: 6 });
    // 4,100 × 1,100 within 1,024: two halvings leave 1,025 px, one too many, so three: level 3, 513 × 138 pixels.
    const whole = await h.core.window(10, opened.opened.handle, { x: 0, y: 0, width, height }, 1024);
    expect(whole && [whole.width, whole.height]).toEqual([513, 138]);
    await h.completed(opened.opened.hash);
    h.core.close(opened.opened.handle);
  }, 60_000);
});
