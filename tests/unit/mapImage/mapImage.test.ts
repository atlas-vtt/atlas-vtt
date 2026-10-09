import { Texture, Ticker } from 'pixi.js';
import { TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapImage } from '../../../src/app/pixi/mapImage/MapImage';
import type { MapImageOpener } from '../../../src/app/pixi/mapImage/mapImageTypes';
import type { MapImageChange } from '../../../src/app/pixi/mapImage/mapImageView';
import { placeholderTiles } from '../../../src/app/pixi/mapImage/mapImageTiles';
import { pyramidOf } from '../../../src/app/pixi/mapImage/pyramid';
import { MapClosedError, type OpenedMap } from '../../../src/app/pixi/mapImage/TileDecoderClient';

class Bitmap {
  readonly close = vi.fn();
  constructor(readonly width: number, readonly height: number) {}
}

interface Deferred<T> { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const fileAt = (path: string): TFile => Object.assign(new TFile(path), { stat: { ctime: 0, mtime: 1, size: 2 } });
const opened = (handle: number, hash: string, width = 3000, height = 2000): OpenedMap => ({ handle, hash, pyramid: pyramidOf(width, height) });

function harness(): {
  mapImage: MapImage;
  service: { [K in keyof MapImageOpener]: ReturnType<typeof vi.fn> };
  viewport: { left: number; top: number; worldScreenWidth: number; worldScreenHeight: number; scale: { x: number }; worldWidth: number; worldHeight: number };
  changes: MapImageChange[];
  ticker: Ticker;
  /** What the tile worker's restart tells the map images. */
  restart: () => void;
} {
  const restarts = new Set<() => void>();
  const service = {
    open: vi.fn(),
    tile: vi.fn(() => new Promise<ImageBitmap>(() => undefined)),
    overview: vi.fn(async (_handle: number, maxSide: number) => new Bitmap(maxSide, maxSide) as unknown as ImageBitmap),
    close: vi.fn(),
    reportUnshown: vi.fn(),
    onRestart: vi.fn((listener: () => void) => {
      restarts.add(listener);
      return () => restarts.delete(listener);
    }),
  };
  const ticker = new Ticker();
  const viewport = { left: 0, top: 0, worldScreenWidth: 800, worldScreenHeight: 600, scale: { x: 1 }, worldWidth: 0, worldHeight: 0 };
  const mapImage = new MapImage({ service: service as unknown as MapImageOpener, viewport, ticker, renderer: null, requestRender: vi.fn() });
  const changes: MapImageChange[] = [];
  mapImage.onChange((change) => changes.push(change));
  images.push(mapImage);
  return { mapImage, service, viewport, changes, ticker, restart: () => [...restarts].forEach((listener) => listener()) };
}

const images: MapImage[] = [];

afterEach(() => {
  for (const image of images.splice(0)) image.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MapImage', () => {
  it('shows a vault image at its natural size, from (0, 0), and sets the viewport world around it', async () => {
    const { mapImage, service, viewport, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'cave', 12000, 3000));

    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 12000, height: 3000 });
    expect(mapImage.layer.boundsArea).toMatchObject({ x: 0, y: 0, width: 12000, height: 3000 });
    expect(mapImage.layer.children).toHaveLength(1);
    expect({ width: viewport.worldWidth, height: viewport.worldHeight }).toEqual({ width: 12000, height: 10000 });
    expect(changes).toEqual(['image']);
  });

  it('draws the image stretched: the world rect grows, the image keeps its own size, and listeners hear of another image', async () => {
    const { mapImage, service, viewport, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'coast', 12000, 3000));
    await mapImage.load({ kind: 'file', file: fileAt('maps/coast.webp') });

    mapImage.setStretch({ x: 1.05, y: 1 });

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 12600, height: 3000 });
    expect(mapImage.imageSize).toEqual({ width: 12000, height: 3000 });
    expect(mapImage.mapStretch).toEqual({ x: 1.05, y: 1 });
    expect({ x: mapImage.layer.scale.x, y: mapImage.layer.scale.y }).toEqual({ x: 1.05, y: 1 });
    // The layer's own bounds are the image's; its scale stretches them.
    expect(mapImage.layer.boundsArea).toMatchObject({ x: 0, y: 0, width: 12000, height: 3000 });
    expect(viewport.worldWidth).toBe(12600);
    expect(changes).toEqual(['image', 'image']);

    mapImage.setStretch({ x: 1.05, y: 1 });
    expect(changes).toEqual(['image', 'image']);
  });

  it('shows a loaded image with the stretch the load names, and the next one with the same unless it names another', async () => {
    const { mapImage, service, changes } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'coast', 1000, 2000)).mockResolvedValueOnce(opened(2, 'cave', 500, 500));

    await mapImage.load({ kind: 'file', file: fileAt('maps/coast.webp') }, { x: 1, y: 1.1 });
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 1000, height: 2200 });
    expect(changes).toEqual(['image']);

    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 500, height: 550 });

    await mapImage.load({ kind: 'none', width: 1400, height: 1400 }, { x: 1, y: 1 });
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
  });

  it('asks the tile layer in the image\'s own pixels, whatever the stretch', async () => {
    const { mapImage, service, viewport, ticker } = harness();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Tiles that fail are not asked for again, so the layer works through everything it wants.
    service.tile.mockRejectedValue(new Error('no tile'));
    service.open.mockResolvedValue(opened(1, 'coast', 4000, 4000));
    await mapImage.load({ kind: 'file', file: fileAt('maps/coast.webp') }, { x: 2, y: 1 });
    // The camera shows the world's right quarter at one world unit per pixel: the image's right quarter, twice as fine.
    Object.assign(viewport, { left: 6000, top: 0, worldScreenWidth: 2000, worldScreenHeight: 600 });

    for (let i = 0; i < 40; i++) {
      ticker.update();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const columns = service.tile.mock.calls.map(([, ref]) => (ref as { level: number; col: number }));
    const finest = columns.filter((ref) => ref.level === 0).map((ref) => ref.col);
    // Level 0 tiles are 510 image pixels wide; image x 3000 to 4000 is columns 5 to 7 (and one more to the left as prefetch).
    expect(Math.min(...finest)).toBe(4);
    expect(Math.max(...finest)).toBe(7);
  });

  it('drops a load that a later one overtook, and closes what it opened', async () => {
    const { mapImage, service } = harness();
    const slow = deferred<OpenedMap>();
    service.open.mockReturnValueOnce(slow.promise);

    const first = mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    await mapImage.load({ kind: 'none', width: 1400, height: 1400 });
    slow.resolve(opened(7, 'cave'));
    await first;

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
    expect(mapImage.layer.children).toHaveLength(0);
    expect(service.close).toHaveBeenCalledWith(7);
  });

  it('keeps what it draws when a load opens the same pyramid again, and closes the second open', async () => {
    const { mapImage, service, changes } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave')).mockResolvedValueOnce(opened(2, 'cave'));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    const drawn = mapImage.layer.children[0];

    await mapImage.load({ kind: 'file', file: fileAt('maps/renamed.webp') });

    expect(mapImage.layer.children).toEqual([drawn]);
    expect(service.close).toHaveBeenCalledWith(2);
    expect(service.close).not.toHaveBeenCalledWith(1);
    expect(changes).toEqual(['image', 'image']);
  });

  it('closes the pyramid of the map it leaves', async () => {
    const { mapImage, service } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave')).mockResolvedValueOnce(opened(2, 'tower', 800, 600));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    await mapImage.load({ kind: 'file', file: fileAt('maps/tower.webp') });

    expect(service.close).toHaveBeenCalledWith(1);
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(mapImage.layer.children).toHaveLength(1);
  });

  it('shows the placeholder and reports the file when its image cannot be opened', async () => {
    const { mapImage, service } = harness();
    const file = fileAt('maps/broken.webp');
    const failure = new Error('The source image cannot be decoded.');
    service.open.mockRejectedValue(failure);

    await mapImage.load({ kind: 'file', file });

    expect(service.reportUnshown).toHaveBeenCalledWith(file, failure);
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    expect(mapImage.layer.children).toHaveLength(1);
  });

  it('shows the placeholder for a missing image as a picture of one tile, never kept in the cache', async () => {
    const { mapImage } = harness();

    await mapImage.load({ kind: 'placeholder' });

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    expect(mapImage.layer.children).toHaveLength(1);
    const tiles = placeholderTiles();
    expect(tiles.source.pyramid.levels).toHaveLength(1);
    expect(tiles.cacheable).toBe(false);
  });

  it('is only a world rect for a scene without an image: no tiles, no pixels, no albedo', async () => {
    const { mapImage, viewport } = harness();

    await mapImage.load({ kind: 'none', width: 1400, height: 1400 });

    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
    expect(mapImage.layer.children).toHaveLength(0);
    expect(viewport.worldWidth).toBe(10000);
    await expect(mapImage.overview(64)).resolves.toBeNull();
    expect(mapImage.albedoTexture()).toBeNull();
    await expect(mapImage.whenReady({ x: 0, y: 0, width: 100, height: 100 }, 1, 1500)).resolves.toBeUndefined();
  });

  it('makes the albedo from the overview once asked, and tells its listeners', async () => {
    const { mapImage, service, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    expect(mapImage.albedoTexture()).toBeNull();
    await vi.waitFor(() => expect(changes).toContain('albedo'));

    const albedo = mapImage.albedoTexture();
    expect(albedo).toBeInstanceOf(Texture);
    expect(albedo?.source.autoGenerateMipmaps).toBe(true);
    expect(service.overview).toHaveBeenCalledWith(1, 2048);
  });

  it('waits for the tiles its camera shows no longer than the timeout', async () => {
    vi.useFakeTimers();
    const { mapImage, service } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    let ready = false;

    void mapImage.whenCameraReady(1500).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(1400);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(100);

    expect(ready).toBe(true);
  });

  it('takes the image off on clear until the next load', async () => {
    const { mapImage, service, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    mapImage.clear();

    expect(mapImage.worldRect).toBeNull();
    expect(mapImage.layer.children).toHaveLength(0);
    expect(service.close).toHaveBeenCalledWith(1);
    expect(changes).toEqual(['image', 'image']);
  });

  it('answers null for an overview whose map was closed meanwhile, and rejects for other failures', async () => {
    const { mapImage, service } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    service.overview.mockRejectedValueOnce(new MapClosedError());
    await expect(mapImage.overview(512)).resolves.toBeNull();
    service.overview.mockRejectedValueOnce(new Error('Corrupt tile'));
    await expect(mapImage.overview(512)).rejects.toThrow('Corrupt tile');
  });

  it('opens the shown map again in a new layer when the tile worker restarts, which asks again for the tiles that failed', async () => {
    const { mapImage, service, changes, ticker, restart } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave')).mockResolvedValueOnce(opened(2, 'cave'));
    service.tile.mockImplementation((handle: number) => (handle === 1
      ? Promise.reject(new Error('The map tile worker stopped unexpectedly.'))
      : new Promise<ImageBitmap>(() => undefined)));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    const before = mapImage.layer.children[0];
    ticker.update(1000);
    await vi.waitFor(() => expect(service.tile).toHaveBeenCalledWith(1, expect.anything(), expect.anything()));
    const failedRefs = service.tile.mock.calls.map((call) => JSON.stringify(call[1]));

    restart();
    await vi.waitFor(() => expect(service.open).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(mapImage.layer.children[0]).not.toBe(before));
    ticker.update(2000);

    expect(mapImage.layer.children).toHaveLength(1);
    expect(service.close).toHaveBeenCalledWith(1);
    const again = service.tile.mock.calls.filter((call) => call[0] === 2).map((call) => JSON.stringify(call[1]));
    expect(again).toEqual(expect.arrayContaining(failedRefs));
    expect(changes).toEqual(['image', 'image']);
  });

  it('does not reopen after a restart while another load is under way, nor once destroyed', async () => {
    const { mapImage, service, restart } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave'));
    await mapImage.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    const slow = deferred<OpenedMap>();
    service.open.mockReturnValueOnce(slow.promise);
    const loading = mapImage.load({ kind: 'file', file: fileAt('maps/tower.webp') });

    restart();
    slow.resolve(opened(2, 'tower'));
    await loading;
    expect(service.open).toHaveBeenCalledTimes(2);

    mapImage.destroy();
    restart();
    expect(service.open).toHaveBeenCalledTimes(2);
  });
});
