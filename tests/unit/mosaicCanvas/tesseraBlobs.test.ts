// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MemoryTesseraBackend } from '../../../src/app/pixi/mosaicCanvas/memoryTesseraBackend';
import { pyramidOf } from '../../../src/app/pixi/mosaicCanvas/pyramid';
import { TesseraDecoderClient } from '../../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';
import type { CoreFactory } from '../../../src/app/pixi/mosaicCanvas/tesseraCoreHost';
import { inThreadPort, type PortFactory } from '../../../src/app/pixi/mosaicCanvas/tesseraPorts';
import { coreHarness, fakePng, useReadableBlobs } from './fakeTesseraGraphics';

const identity = { path: 'maps/keep.png', size: 1234, mtime: 99 };
const noWorker: PortFactory = () => {
  throw new Error('Workers are not allowed here');
};

/** A client running a fake core in-thread over one cache. */
function setup(): TesseraDecoderClient {
  const backend = new MemoryTesseraBackend();
  const createCore: CoreFactory = (_appId, emit) => Promise.resolve(coreHarness({ backend, forward: emit }).core);
  return new TesseraDecoderClient({ appId: 'vault-1', worker: noWorker, inThread: inThreadPort(createCore) });
}

const text = (buffer: ArrayBuffer | null | undefined): string => (buffer ? new TextDecoder().decode(buffer) : 'missing');

describe('a cached pyramid read for copying', () => {
  useReadableBlobs();

  it('is built first where the cache lacks it, and named by the image\'s hash', async () => {
    const client = setup();
    const built = await client.ensurePyramid(() => Promise.resolve(fakePng(3000, 2000)), identity);
    expect(built.complete).toBe(true);
    // Known by its file now: the same hash, and the file is not read again.
    let read = 0;
    expect(await client.ensurePyramid(() => (read += 1, Promise.resolve(fakePng(3000, 2000))), identity)).toEqual(built);
    expect(read).toBe(0);
  });

  it('hands out tesserae as they are stored, never decoded: a list, or a whole level', async () => {
    const client = setup();
    const { hash } = await client.ensurePyramid(() => Promise.resolve(fakePng(3000, 2000)), identity);
    const listed = await client.tesseraBlobs(hash, [{ level: 0, col: 5, row: 3 }, { level: 3, col: 0, row: 0 }]);
    // The fake encoder stores each tessera as the size of its rect.
    expect(listed.map(text)).toEqual([JSON.stringify({ width: 451, height: 471 }), JSON.stringify({ width: 375, height: 250 })]);
    const level = await client.tesseraBlobs(hash, { level: 1 });
    expect(level).toHaveLength(pyramidOf(3000, 2000).levels[1]!.cols * pyramidOf(3000, 2000).levels[1]!.rows);
    expect(await client.tesseraBlobs('f'.repeat(64), [{ level: 0, col: 0, row: 0 }])).toEqual([null]);
  });
});
