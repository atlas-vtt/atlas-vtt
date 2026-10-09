import { describe, expect, it, vi } from 'vitest';
import { pyramidOf } from '../../../src/app/pixi/mapImage/pyramid';
import { TileDecoderClient } from '../../../src/app/pixi/mapImage/TileDecoderClient';
import type { CoreFactory } from '../../../src/app/pixi/mapImage/tileCoreHost';
import { inThreadPort, type PortFactory } from '../../../src/app/pixi/mapImage/tilePorts';
import { MemoryTileBackend } from '../../../src/app/pixi/mapImage/memoryTileBackend';
import { sha256 } from '../../../src/app/utils/hashing';
import { coreHarness, fakePng, FakeBitmap, useReadableBlobs } from './fakeTileGraphics';

/**
 * Images a worker cannot decode (SVG) are decoded on the main thread and handed to the tile
 * core as a bitmap; the pyramid is built from it and keyed by the file's bytes as any other.
 */

const identity = { path: 'maps/vector.svg', size: 10, mtime: 5 };
/** Bytes the fake decoder fails on, as a worker fails on an SVG. */
const undecodable = (): ArrayBuffer => fakePng(640, 480, { broken: true });

const noWorker: PortFactory = () => {
  throw new Error('Workers are not allowed here');
};

describe('a map image decoded on the main thread', () => {
  useReadableBlobs();

  it('is built from the bitmap it was given, keyed by its bytes', async () => {
    const h = coreHarness();
    const decoded = new FakeBitmap(640, 480, 'source');

    const outcome = await h.core.open(null, undecodable(), decoded);

    if (outcome.kind !== 'opened') throw new Error(`Expected an open, got ${outcome.kind}`);
    expect(outcome.opened.pyramid).toEqual(pyramidOf(640, 480));
    expect(outcome.opened.hash).toBe(await sha256(undecodable()));
    expect(h.graphics.decodes).toHaveLength(0);
    await h.completed(outcome.opened.hash);
    expect(decoded.closed).toBe(true);
  });

  it('closes the bitmap it did not need, when the cache serves the map', async () => {
    const h = coreHarness();
    const first = await h.core.open(identity, undecodable(), new FakeBitmap(640, 480, 'source'));
    if (first.kind !== 'opened') throw new Error('Expected an open');
    await h.completed(first.opened.hash);
    h.core.close(first.opened.handle);
    const unneeded = new FakeBitmap(640, 480, 'source');

    const again = await h.core.open(null, undecodable(), unneeded);

    expect(again.kind).toBe('opened');
    expect(unneeded.closed).toBe(true);
  });

  it('is decoded by the client only once its bytes are read', async () => {
    const backend = new MemoryTileBackend();
    const harnesses: Array<ReturnType<typeof coreHarness>> = [];
    const createCore: CoreFactory = (_appId, emit) => {
      const harness = coreHarness({ backend, forward: emit });
      harnesses.push(harness);
      return Promise.resolve(harness.core);
    };
    const client = new TileDecoderClient({ appId: 'vault', worker: noWorker, inThread: inThreadPort(createCore) });
    const decode = vi.fn(async (bytes: ArrayBuffer) => {
      expect(bytes.byteLength).toBeGreaterThan(0);
      return new FakeBitmap(640, 480, 'source');
    });
    const complete = new Promise<void>((resolve) => client.onPyramidComplete(() => resolve()));

    const map = await client.open(() => Promise.resolve(undecodable()), identity, decode);
    await complete;
    client.close(map.handle);
    await client.open(() => Promise.resolve(undecodable()), identity, decode);

    expect(map.pyramid).toEqual(pyramidOf(640, 480));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(harnesses[0]?.graphics.decodes).toHaveLength(0);
    client.dispose();
  });
});
