import { describe, expect, it } from 'vitest';
import { MemoryTileBackend } from '../../../src/app/pixi/mapImage/memoryTileBackend';
import { TileDecoderClient, TileOpenError } from '../../../src/app/pixi/mapImage/TileDecoderClient';
import type { CoreFactory } from '../../../src/app/pixi/mapImage/tileCoreHost';
import { inThreadPort, type PortFactory } from '../../../src/app/pixi/mapImage/tilePorts';
import type { TileMessage, TileRequest } from '../../../src/app/pixi/mapImage/tileProtocol';
import { coreHarness, fakePng, FakeBitmap, type CoreHarness, useReadableBlobs } from './fakeTileGraphics';

const identity = { path: 'maps/keep.png', size: 1234, mtime: 99 };

const noWorker: PortFactory = () => {
  throw new Error('Workers are not allowed here');
};

interface Setup {
  client: TileDecoderClient;
  harnesses: CoreHarness[];
  appIds: Array<string | null>;
}

/** A client whose worker cannot start, so it runs fake cores in-thread over one shared cache. */
function setup(worker: PortFactory = noWorker): Setup {
  const backend = new MemoryTileBackend();
  const harnesses: CoreHarness[] = [];
  const appIds: Array<string | null> = [];
  const createCore: CoreFactory = (appId, emit) => {
    appIds.push(appId);
    const harness = coreHarness({ backend, forward: emit });
    harnesses.push(harness);
    return Promise.resolve(harness.core);
  };
  const client = new TileDecoderClient({ appId: 'vault-1', worker, inThread: inThreadPort(createCore) });
  return { client, harnesses, appIds };
}

function whenComplete(client: TileDecoderClient, hash: string): Promise<void> {
  return new Promise((resolve) => {
    const stop = client.onPyramidComplete((done) => {
      if (done !== hash) return;
      stop();
      resolve();
    });
  });
}

describe('TileDecoderClient', () => {
  useReadableBlobs();

  it('runs the core in-thread when no worker starts', async () => {
    const { client, appIds } = setup();
    const map = await client.open(fakePng(3000, 2000), identity);
    expect(appIds).toEqual(['vault-1']);
    const tile = await client.tile(map.handle, { level: 0, col: 0, row: 0 });
    expect(tile).toBeInstanceOf(FakeBitmap);
    client.dispose();
  });

  it('reads the file only when the cache cannot serve the map', async () => {
    const { client } = setup();
    let reads = 0;
    const read = (): Promise<ArrayBuffer> => {
      reads += 1;
      return Promise.resolve(fakePng(3000, 2000));
    };
    const first = await client.open(read, identity);
    expect(reads).toBe(1);
    await whenComplete(client, first.hash);
    client.close(first.handle);
    const second = await client.open(read, identity);
    expect(reads).toBe(1);
    expect(second.hash).toBe(first.hash);
    const overview = await client.overview(second.handle, 512);
    expect(Math.max(overview.width, overview.height)).toBe(512);
    client.dispose();
  });

  it('reads at once when no identity can stand for the bytes', async () => {
    const { client } = setup();
    let reads = 0;
    await client.prebuild(() => {
      reads += 1;
      return Promise.resolve(fakePng(1000, 800));
    }, null);
    expect(reads).toBe(1);
    expect(await client.cacheSize()).toBeGreaterThan(0);
    await client.clearCache();
    expect(await client.cacheSize()).toBe(0);
    client.dispose();
  });

  it('rejects an open once with what went wrong', async () => {
    const { client } = setup();
    const failure = await client.open(fakePng(3000, 2000, { broken: true }), identity).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TileOpenError);
    expect((failure as TileOpenError).failure).toEqual({ kind: 'decode-failed', message: 'Corrupt image' });
    client.dispose();
  });

  it('cancels a request through its signal', async () => {
    const { client, harnesses } = setup();
    const map = await client.open(fakePng(3000, 2000), identity);
    let release = (): void => undefined;
    harnesses[0]!.graphics.cropGate = () => new Promise((resolve) => (release = resolve));
    const controller = new AbortController();
    const pending = client.tile(map.handle, { level: 0, col: 1, row: 1 }, controller.signal);
    await new Promise((resolve) => window.setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release();
    await new Promise((resolve) => window.setTimeout(resolve, 5));
    expect(harnesses[0]!.graphics.bitmaps.filter((b) => b.origin === 'crop').every((b) => b.closed)).toBe(true);
    client.dispose();
  });

  it('fails pending requests when the worker crashes and starts a new one for the next', async () => {
    const posted: TileRequest[] = [];
    let crash = (_reason: string): void => undefined;
    let receive = (_message: TileMessage): void => undefined;
    const worker: PortFactory = (onMessage, onCrash) => {
      receive = onMessage;
      crash = onCrash;
      return { post: (request) => void posted.push(request), terminate: () => undefined };
    };
    const { client } = setup(worker);
    const pending = client.cacheSize();
    crash('boom');
    await expect(pending).rejects.toThrow('boom');
    const next = client.cacheSize();
    expect(posted.filter((request) => request.type === 'init')).toHaveLength(2);
    const last = posted.at(-1)!;
    receive({ type: 'cache-size', id: 'id' in last ? last.id : -1, bytes: 42 });
    expect(await next).toBe(42);
    client.dispose();
    await expect(client.cacheSize()).rejects.toThrow(/stopped/);
  });
});
