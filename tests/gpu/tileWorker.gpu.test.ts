import { afterAll, describe, expect, it } from 'vitest';
import { tileDatabaseName } from '../../src/app/pixi/mapImage/indexedDbTileBackend';
import { pyramidOf, tileContentFrame, tileSourceRect, type TileRef } from '../../src/app/pixi/mapImage/pyramid';
import { TileDecoderClient } from '../../src/app/pixi/mapImage/TileDecoderClient';
import { workerPort } from '../../src/app/pixi/mapImage/tilePorts';
import TileWorker from '../../src/app/pixi/mapImage/tileWorker?worker&inline';

/**
 * The real tile worker end to end: a 6000 × 4000 PNG is opened, its pyramid
 * built into IndexedDB, and opened again from the cache without its bytes.
 */

const WIDTH = 6000;
const HEIGHT = 4000;
const APP_ID = `tile-worker-test-${Date.now()}`;
const identity = { path: 'maps/generated.png', size: 1, mtime: 2 };

/**
 * Grey 16 px blocks of unrelated lightness over a grey gradient: an offset of one
 * pixel shows on every block edge. Grey, since WebP halves the resolution of
 * colour and saturated edges would blur past what alignment shows.
 */
function drawSource(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#202020');
  gradient.addColorStop(1, '#e0e0e0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y += 16) {
    for (let x = (y / 16) % 2 === 0 ? 0 : 16; x < WIDTH; x += 32) {
      const lightness = ((x * 37 + y * 91) / 16) % 100;
      ctx.fillStyle = `hsl(0 0% ${lightness}%)`;
      ctx.fillRect(x, y, 16, 16);
    }
  }
  return canvas;
}

function pixels(source: CanvasImageSource, x: number, y: number, width: number, height: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function meanDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => resolve();
    request.onblocked = (): void => resolve();
  });
}

describe('tile worker', () => {
  const source = drawSource();
  const client = new TileDecoderClient({
    appId: APP_ID,
    worker: workerPort(() => new TileWorker({ name: 'tile worker test' })),
    inThread: () => {
      throw new Error('The worker should have started.');
    },
  });

  afterAll(async () => {
    client.dispose();
    await deleteDatabase(tileDatabaseName(APP_ID));
  });

  it('builds and caches a pyramid, then serves it without reading the file again', async () => {
    const png = await (await source.convertToBlob({ type: 'image/png' })).arrayBuffer();
    let reads = 0;
    const read = (): Promise<ArrayBuffer> => {
      reads += 1;
      return Promise.resolve(png.slice(0));
    };
    let completed = '';
    const complete = new Promise<void>((resolve) => client.onPyramidComplete((hash) => {
      completed = hash;
      resolve();
    }));

    const first = await client.open(read, identity);
    expect(reads).toBe(1);
    expect(first.pyramid).toEqual(pyramidOf(WIDTH, HEIGHT));

    // While the build runs, tiles are crops of the decoded source: exact.
    const early: TileRef = { level: 0, col: 3, row: 2 };
    const crop = await client.tile(first.handle, early);
    const rect = tileSourceRect(first.pyramid, early);
    expect([crop.width, crop.height]).toEqual([rect.width, rect.height]);
    expect(meanDifference(pixels(crop, 0, 0, rect.width, rect.height), pixels(source, rect.x, rect.y, rect.width, rect.height))).toBeLessThan(0.5);
    crop.close();

    await complete;
    expect(completed).toBe(first.hash);
    expect(await client.cacheSize()).toBeGreaterThan(0);
    client.close(first.handle);

    const second = await client.open(read, identity);
    expect(reads).toBe(1);
    expect(second.hash).toBe(first.hash);

    // From the cache: WebP at quality 0.9, close to the source and aligned to the pixel.
    const ref: TileRef = { level: 0, col: 7, row: 5 };
    const tile = await client.tile(second.handle, ref);
    const tileRect = tileSourceRect(second.pyramid, ref);
    expect([tile.width, tile.height]).toEqual([tileRect.width, tileRect.height]);
    const frame = tileContentFrame(second.pyramid, ref);
    const cached = pixels(tile, frame.x, frame.y, frame.width, frame.height);
    const expected = pixels(source, tileRect.x + frame.x, tileRect.y + frame.y, frame.width, frame.height);
    expect(meanDifference(cached, expected)).toBeLessThan(4);
    const shifted = pixels(source, tileRect.x + frame.x + 1, tileRect.y + frame.y, frame.width, frame.height);
    expect(meanDifference(cached, shifted)).toBeGreaterThan(meanDifference(cached, expected) * 2);
    tile.close();

    const overview = await client.overview(second.handle, 1024);
    expect([overview.width, overview.height]).toEqual([1024, 683]);
    overview.close();
    client.close(second.handle);
  });
});
