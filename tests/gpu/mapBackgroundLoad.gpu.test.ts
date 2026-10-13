import '../setup/obsidianDom';
import { Ticker } from 'pixi.js';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { MapLoader } from '../../src/app/MapLoader';
import { MapImage } from '../../src/app/pixi/mapImage/MapImage';
import { MapImageService } from '../../src/app/pixi/mapImage/MapImageService';
import { TileDecoderClient } from '../../src/app/pixi/mapImage/TileDecoderClient';
import { tileDatabaseName } from '../../src/app/pixi/mapImage/indexedDbTileBackend';
import { workerPort } from '../../src/app/pixi/mapImage/tilePorts';
import TileWorker from '../../src/app/pixi/mapImage/tileWorker?worker&inline';
import { newSceneFile } from '../../src/app/services/newSceneFile';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * A scene's map image, opened as Obsidian hands it out and decoded by a real browser and the real
 * tile worker.
 *
 * Obsidian answers a `fetch` of a file's resource URL only where its installer registered the
 * `app://` scheme for that (for the Fetch API since installer 1.4.5, for cross-origin requests,
 * which Electron 40 and later demand, since 1.13). Everywhere else the request ends in
 * "TypeError: Failed to fetch" although the file is there. This browser knows no `app://`
 * scheme at all, so it refuses the same way: the bytes must come from `vault.readBinary`.
 */

const SCENE = 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap';
const SIZE = { width: 640, height: 480 };
const APP_ID = `map-background-load-${Date.now()}`;

/** The URL Obsidian builds for a vault file: a host that changes with every start, the file's place on disk, its time. */
const resourceUrl = (path: string): string =>
  `app://30f1aedc47f2e368a9f0de942cd7640faf22/home/gm/Obsidian%20Vaults/TTRPGs/${encodeURI(path)}?1791392349249`;

async function painted(type: string): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE.width, SIZE.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#b0a48e';
  context.fillRect(0, 0, SIZE.width, SIZE.height);
  return (await canvas.convertToBlob({ type, quality: 0.9 })).arrayBuffer();
}

/** A vector image; `size` is what its root element says of its own size. */
const drawn = (size: string): ArrayBuffer => new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" ${size}><rect width="100%" height="100%" fill="#b0a48e"/></svg>`,
).buffer;

const client = new TileDecoderClient({
  appId: APP_ID,
  worker: workerPort(() => new TileWorker({ name: 'map background load test' })),
});

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => resolve();
    request.onblocked = (): void => resolve();
  });
}

afterAll(async () => {
  client.dispose();
  await deleteDatabase(tileDatabaseName(APP_ID));
});

interface Opened {
  mapImage: MapImage;
  service: MapImageService;
  readBinary: ReturnType<typeof vi.fn>;
}

/** Opens the scene on `image`, whose bytes are `bytes`, in a map image of its own. */
async function open(image: string, bytes: ArrayBuffer): Promise<Opened> {
  const scene = JSON.stringify(newSceneFile({ conditions: [] }, image));
  const { app }: InMemoryApp = createInMemoryApp({ files: { [SCENE]: scene, [image]: '' } });
  const readBinary = vi.fn(async (): Promise<ArrayBuffer> => bytes.slice(0));
  app.vault.readBinary = readBinary;
  app.vault.adapter.getResourcePath = resourceUrl;
  const service = new MapImageService(app, client);
  const viewport = { left: 0, top: 0, worldScreenWidth: 800, worldScreenHeight: 600, scale: { x: 1 }, worldWidth: 0, worldHeight: 0 };
  const mapImage = new MapImage({ service, viewport, ticker: new Ticker(), renderer: null, requestRender: () => undefined });
  const loaded = await MapLoader.load(app, SCENE);
  await mapImage.load(loaded.image);
  return { mapImage, service, readBinary };
}

describe('opening a scene on a map image', () => {
  it('finds no way to fetch a resource URL in this browser, as on an installer that registered none', async () => {
    await expect(fetch(resourceUrl('atlas-vtt/assets/Crypt.webp'))).rejects.toThrow('Failed to fetch');
  });

  it.each([
    ['webp', 'image/webp'],
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
  ])('shows a .%s image at its own size where its resource URL cannot be fetched', async (extension, type) => {
    const { mapImage, readBinary } = await open(`atlas-vtt/assets/Crypt_1791392349248_${extension}.${extension}`, await painted(type));

    expect(readBinary).toHaveBeenCalled();
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, ...SIZE });
    const overview = await mapImage.overview(64);
    expect(overview).toBeInstanceOf(ImageBitmap);
    expect([overview!.width, overview!.height]).toEqual([64, 48]);
    overview!.close();
    mapImage.destroy();
  });

  it('shows a vector image at the size it states', async () => {
    const { mapImage } = await open('maps/Crypt.svg', drawn(`width="${SIZE.width}" height="${SIZE.height}"`));

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, ...SIZE });
    mapImage.destroy();
  });

  it.each([
    ['only a view box', `viewBox="0 0 ${SIZE.width} ${SIZE.height}"`, 'maps/ViewBox.svg'],
    ['a size relative to its place', `width="100%" height="100%" viewBox="0 0 ${SIZE.width} ${SIZE.height}"`, 'maps/Relative.svg'],
  ])('shows a vector image that states %s at the size an <img> gives it', async (_what, size, path) => {
    const { mapImage } = await open(path, drawn(size));

    // The browser's 300 × 150 box for an image without a size, at the view box's proportions
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 200, height: 150 });
    mapImage.destroy();
  });

  it('shows the placeholder and names the image when the file holds none', async () => {
    const reported = vi.spyOn(MapImageService.prototype, 'reportUnshown').mockImplementation(() => undefined);

    const { mapImage } = await open('atlas-vtt/assets/Broken.webp', new TextEncoder().encode('not an image').buffer);

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported.mock.calls[0]?.[0].path).toBe('atlas-vtt/assets/Broken.webp');
    reported.mockRestore();
    mapImage.destroy();
  });
});
