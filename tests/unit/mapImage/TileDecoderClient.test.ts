import { describe, expect, it, vi } from 'vitest';
import { MemoryTileBackend } from '../../../src/app/pixi/mapImage/memoryTileBackend';
import { MapClosedError, TileDecoderClient, TileOpenError } from '../../../src/app/pixi/mapImage/TileDecoderClient';
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

/** Fake cores over one shared cache, each recorded. */
function cores(): { createCore: CoreFactory; harnesses: CoreHarness[]; appIds: Array<string | null> } {
  const backend = new MemoryTileBackend();
  const harnesses: CoreHarness[] = [];
  const appIds: Array<string | null> = [];
  const createCore: CoreFactory = (appId, emit) => {
    appIds.push(appId);
    const harness = coreHarness({ backend, forward: emit });
    harnesses.push(harness);
    return Promise.resolve(harness.core);
  };
  return { createCore, harnesses, appIds };
}

/** A client whose worker cannot start, so it runs fake cores in-thread over one shared cache. */
function setup(worker: PortFactory = noWorker): Setup {
  const { createCore, harnesses, appIds } = cores();
  const client = new TileDecoderClient({ appId: 'vault-1', worker, inThread: inThreadPort(createCore) });
  return { client, harnesses, appIds };
}

/** "Workers" that are fake cores run in-thread, each of which a test can crash. */
function crashableWorkers(createCore: CoreFactory): { worker: PortFactory; crash: (reason: string) => void; started: () => number } {
  const crashes: Array<(reason: string) => void> = [];
  const worker: PortFactory = (receive, crash) => {
    crashes.push(crash);
    return inThreadPort(createCore)(receive, crash);
  };
  return { worker, crash: (reason) => crashes.at(-1)!(reason), started: () => crashes.length };
}

/** Rejects with `hung` when `promise` has not settled within a few tasks. */
function settles<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_resolve, reject) => window.setTimeout(() => reject(new Error('hung')), 50))]);
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
    expect(await client.clearCache()).toBe(0);
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
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = client.cacheSize();
    receive({ type: 'ready' });
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

  it('rejects the requests of a map when it is closed, so no awaiter hangs', async () => {
    const { client, harnesses } = setup();
    const map = await client.open(fakePng(3000, 2000), identity);
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { graphics } = harnesses[0]!;
    const decode = graphics.decode.bind(graphics);
    const resize = graphics.resize.bind(graphics);
    // Held whether the build is still running (crops, resizes) or done (cached tiles).
    graphics.cropGate = () => gate;
    graphics.decode = async (blob) => gate.then(() => decode(blob));
    graphics.resize = async (bitmap, width, height) => gate.then(() => resize(bitmap, width, height));
    const tile = client.tile(map.handle, { level: 0, col: 1, row: 1 });
    const overview = client.overview(map.handle, 512);
    await new Promise((resolve) => window.setTimeout(resolve, 5));

    client.close(map.handle);

    await expect(settles(tile)).rejects.toBeInstanceOf(MapClosedError);
    await expect(settles(overview)).rejects.toBeInstanceOf(MapClosedError);
    await expect(client.tile(map.handle, { level: 0, col: 0, row: 0 })).rejects.toBeInstanceOf(MapClosedError);
    release();
    client.dispose();
  });

  it('tells listeners to reopen when a worker that held open maps crashes', async () => {
    const { createCore } = cores();
    const workers = crashableWorkers(createCore);
    const client = new TileDecoderClient({ appId: 'vault-1', worker: workers.worker, inThread: noWorker });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const restarts = vi.fn();
    client.onRestart(restarts);
    await client.open(fakePng(3000, 2000, { salt: 1 }), null);

    workers.crash('out of memory');

    expect(restarts).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('voids the handles of a crashed worker and never lets them reach the next worker', async () => {
    const { createCore } = cores();
    const workers = crashableWorkers(createCore);
    const client = new TileDecoderClient({ appId: 'vault-1', worker: workers.worker, inThread: noWorker });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = await client.open(fakePng(3000, 2000, { salt: 1 }), null);

    workers.crash('out of memory');
    const second = await client.open(fakePng(800, 600, { salt: 2 }), null);

    expect(workers.started()).toBe(2);
    expect(second.handle).not.toBe(first.handle);
    await expect(client.tile(first.handle, { level: 1, col: 0, row: 0 })).rejects.toBeTruthy();
    client.close(first.handle);
    // The second map's level 1 is one tile of 400 × 300; the first map's would be larger.
    const tile = await client.tile(second.handle, { level: 1, col: 0, row: 0 });
    expect([tile.width, tile.height]).toEqual([400, 300]);
    client.dispose();
  });

  it('runs the core in-thread for good once a worker fails before it started, and still opens the map', async () => {
    const { createCore, harnesses } = cores();
    let workersStarted = 0;
    const failing: PortFactory = (_receive, crash) => {
      workersStarted += 1;
      window.setTimeout(() => crash('Could not load the worker script.'), 0);
      return { post: () => undefined, terminate: () => undefined };
    };
    const client = new TileDecoderClient({ appId: 'vault-1', worker: failing, inThread: inThreadPort(createCore) });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const map = await settles(client.open(() => Promise.resolve(fakePng(3000, 2000)), identity));
    expect(await client.cacheSize()).toBeGreaterThanOrEqual(0);

    expect(map.pyramid.width).toBe(3000);
    expect(workersStarted).toBe(1);
    expect(harnesses).toHaveLength(1);
    client.dispose();
  });

  it('closes a bitmap decoded on this thread when its open is refused', async () => {
    const { client } = setup();
    client.dispose();
    const decoded = new FakeBitmap(10, 10, 'source');

    await expect(client.open(fakePng(10, 10), identity, () => Promise.resolve(decoded))).rejects.toThrow(/stopped/);

    expect(decoded.closed).toBe(true);
  });
});
