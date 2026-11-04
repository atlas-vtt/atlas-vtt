// @vitest-environment jsdom
import { Texture, Ticker } from 'pixi.js';
import { TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MosaicCanvas } from '../../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import type { MosaicCanvasOpener } from '../../../src/app/pixi/mosaicCanvas/mosaicCanvasTypes';
import type { MosaicCanvasChange } from '../../../src/app/pixi/mosaicCanvas/mosaicCanvasView';
import { placeholderTesserae } from '../../../src/app/pixi/mosaicCanvas/mosaicCanvasTesserae';
import { pyramidOf } from '../../../src/app/pixi/mosaicCanvas/pyramid';
import { MapClosedError, type OpenedMap } from '../../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';

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
  mosaicCanvas: MosaicCanvas;
  service: { [K in keyof MosaicCanvasOpener]: ReturnType<typeof vi.fn> };
  viewport: { left: number; top: number; worldScreenWidth: number; worldScreenHeight: number; scale: { x: number }; worldWidth: number; worldHeight: number };
  changes: MosaicCanvasChange[];
  ticker: Ticker;
  /** What the tessera worker's restart tells the map images. */
  restart: () => void;
} {
  const restarts = new Set<() => void>();
  const service = {
    open: vi.fn(),
    tessera: vi.fn(() => new Promise<ImageBitmap>(() => undefined)),
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
  const mosaicCanvas = new MosaicCanvas({ service: service as unknown as MosaicCanvasOpener, viewport, ticker, renderer: null, requestRender: vi.fn() });
  const changes: MosaicCanvasChange[] = [];
  mosaicCanvas.onChange((change) => changes.push(change));
  images.push(mosaicCanvas);
  return { mosaicCanvas, service, viewport, changes, ticker, restart: () => [...restarts].forEach((listener) => listener()) };
}

/** The tessera layers a map image shows: inside the container that turns them level, without the video an animated map draws over them. */
const tesseraLayers = (image: MosaicCanvas): readonly unknown[] => image.layer.children[0]!.children.filter((child) => child.label !== 'map-video');

const images: MosaicCanvas[] = [];

afterEach(() => {
  for (const image of images.splice(0)) image.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MosaicCanvas', () => {
  it('shows a vault image at its natural size, from (0, 0), and sets the viewport world around it', async () => {
    const { mosaicCanvas, service, viewport, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'cave', 12000, 3000));

    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 12000, height: 3000 });
    expect(mosaicCanvas.layer.boundsArea).toMatchObject({ x: 0, y: 0, width: 12000, height: 3000 });
    // The layer holds the container that turns the tesserae level, which holds the tessera layer.
    expect(mosaicCanvas.layer.children).toHaveLength(1);
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(1);
    expect({ width: viewport.worldWidth, height: viewport.worldHeight }).toEqual({ width: 12000, height: 10000 });
    expect(changes).toEqual(['image']);
  });

  it('draws the image stretched: the world rect grows, the image keeps its own size, and listeners hear of another image', async () => {
    const { mosaicCanvas, service, viewport, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'coast', 12000, 3000));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/coast.webp') });

    mosaicCanvas.setStretch({ x: 1.05, y: 1 });

    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 12600, height: 3000 });
    expect(mosaicCanvas.imageSize).toEqual({ width: 12000, height: 3000 });
    expect(mosaicCanvas.mapStretch).toEqual({ x: 1.05, y: 1 });
    expect({ x: mosaicCanvas.layer.scale.x, y: mosaicCanvas.layer.scale.y }).toEqual({ x: 1.05, y: 1 });
    // The layer's own bounds are the image's; its scale stretches them.
    expect(mosaicCanvas.layer.boundsArea).toMatchObject({ x: 0, y: 0, width: 12000, height: 3000 });
    expect(viewport.worldWidth).toBe(12600);
    expect(changes).toEqual(['image', 'image']);

    mosaicCanvas.setStretch({ x: 1.05, y: 1 });
    expect(changes).toEqual(['image', 'image']);
  });

  it('draws an image that lies askew turned level about its centre, in the box that then holds it', async () => {
    const { mosaicCanvas, service } = harness();
    service.open.mockResolvedValue(opened(1, 'scan', 4000, 3000));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/scan.jpg') }, { x: 1, y: 1, rotation: 1 });

    const turn = Math.PI / 180;
    const box = { width: 4000 * Math.cos(turn) + 3000 * Math.sin(turn), height: 4000 * Math.sin(turn) + 3000 * Math.cos(turn) };
    expect(mosaicCanvas.worldRect!.width).toBeCloseTo(box.width, 6);
    expect(mosaicCanvas.worldRect!.height).toBeCloseTo(box.height, 6);
    expect(mosaicCanvas.imageSize).toEqual({ width: 4000, height: 3000 });
    // The image's centre is the box's centre, and the tessera layer is turned back by the angle.
    const turned = mosaicCanvas.layer.children[0]!;
    expect(turned.rotation).toBeCloseTo(-turn, 9);
    const centre = turned.toGlobal({ x: 2000, y: 1500 });
    expect(centre.x).toBeCloseTo(box.width / 2, 6);
    expect(centre.y).toBeCloseTo(box.height / 2, 6);
    // Its outline is where its corners are drawn: each touches one side of the box, and the grid ends there.
    const outline = mosaicCanvas.outline!;
    [[0, 0], [4000, 0], [4000, 3000], [0, 3000]].forEach(([x, y], i) => {
      const drawn = turned.toGlobal({ x: x!, y: y! });
      expect(outline[i]!.x).toBeCloseTo(drawn.x, 6);
      expect(outline[i]!.y).toBeCloseTo(drawn.y, 6);
    });
    expect(Math.min(...outline.map((corner) => corner.x))).toBeCloseTo(0, 6);
    expect(Math.max(...outline.map((corner) => corner.y))).toBeCloseTo(box.height, 6);

    mosaicCanvas.setStretch({ x: 1.05, y: 1 });
    expect(mosaicCanvas.outline).toBeNull();
  });

  it('shows a loaded image with the stretch the load names, and the next one with the same unless it names another', async () => {
    const { mosaicCanvas, service, changes } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'coast', 1000, 2000)).mockResolvedValueOnce(opened(2, 'cave', 500, 500));

    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/coast.webp') }, { x: 1, y: 1.1 });
    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 1000, height: 2200 });
    expect(changes).toEqual(['image']);

    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 500, height: 550 });

    await mosaicCanvas.load({ kind: 'none', width: 1400, height: 1400 }, { x: 1, y: 1 });
    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
  });

  it('asks the tessera layer in the image\'s own pixels, whatever the stretch', async () => {
    const { mosaicCanvas, service, viewport, ticker } = harness();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Tesserae that fail are not asked for again, so the layer works through everything it wants.
    service.tessera.mockRejectedValue(new Error('no tessera'));
    service.open.mockResolvedValue(opened(1, 'coast', 4000, 4000));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/coast.webp') }, { x: 2, y: 1 });
    // The camera shows the world's right quarter at one world unit per pixel: the image's right quarter, twice as fine.
    Object.assign(viewport, { left: 6000, top: 0, worldScreenWidth: 2000, worldScreenHeight: 600 });

    for (let i = 0; i < 40; i++) {
      ticker.update();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const columns = service.tessera.mock.calls.map(([, ref]) => (ref as { level: number; col: number }));
    const finest = columns.filter((ref) => ref.level === 0).map((ref) => ref.col);
    // Level 0 tesserae are 510 image pixels wide; image x 3000 to 4000 is columns 5 to 7 (and one more to the left as prefetch).
    expect(Math.min(...finest)).toBe(4);
    expect(Math.max(...finest)).toBe(7);
  });

  it('drops a load that a later one overtook, and closes what it opened', async () => {
    const { mosaicCanvas, service } = harness();
    const slow = deferred<OpenedMap>();
    service.open.mockReturnValueOnce(slow.promise);

    const first = mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    await mosaicCanvas.load({ kind: 'none', width: 1400, height: 1400 });
    slow.resolve(opened(7, 'cave'));
    await first;

    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(0);
    expect(service.close).toHaveBeenCalledWith(7);
  });

  it('draws a video map from its poster\'s pyramid, its tesserae beneath the video', async () => {
    const { mosaicCanvas, service } = harness();
    service.open.mockResolvedValue(opened(1, 'river-poster', 1920, 1080));

    await mosaicCanvas.load({ kind: 'video', file: fileAt('maps/river.webm') });
    await mosaicCanvas.load({ kind: 'video', file: fileAt('maps/river.webm') });

    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    const turned = mosaicCanvas.layer.children[0]!;
    expect(turned.children.map((child) => child.label)).toEqual([expect.not.stringMatching('map-video'), 'map-video']);
  });

  it('keeps what it draws when a load opens the same pyramid again, and closes the second open', async () => {
    const { mosaicCanvas, service, changes } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave')).mockResolvedValueOnce(opened(2, 'cave'));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    const drawn = tesseraLayers(mosaicCanvas)[0];

    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/renamed.webp') });

    expect(tesseraLayers(mosaicCanvas)).toEqual([drawn]);
    expect(service.close).toHaveBeenCalledWith(2);
    expect(service.close).not.toHaveBeenCalledWith(1);
    expect(changes).toEqual(['image', 'image']);
  });

  it('closes the pyramid of the map it leaves', async () => {
    const { mosaicCanvas, service } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave')).mockResolvedValueOnce(opened(2, 'tower', 800, 600));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/tower.webp') });

    expect(service.close).toHaveBeenCalledWith(1);
    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    // The layer holds the container that turns the tesserae level, which holds the tessera layer.
    expect(mosaicCanvas.layer.children).toHaveLength(1);
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(1);
  });

  it('shows the placeholder and reports the file when its image cannot be opened', async () => {
    const { mosaicCanvas, service } = harness();
    const file = fileAt('maps/broken.webp');
    const failure = new Error('The source image cannot be decoded.');
    service.open.mockRejectedValue(failure);

    await mosaicCanvas.load({ kind: 'file', file });

    expect(service.reportUnshown).toHaveBeenCalledWith(file, failure);
    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    // The layer holds the container that turns the tesserae level, which holds the tessera layer.
    expect(mosaicCanvas.layer.children).toHaveLength(1);
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(1);
  });

  it('shows the placeholder for a missing image as a picture of one tessera, never kept in the cache', async () => {
    const { mosaicCanvas } = harness();

    await mosaicCanvas.load({ kind: 'placeholder' });

    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    // The layer holds the container that turns the tesserae level, which holds the tessera layer.
    expect(mosaicCanvas.layer.children).toHaveLength(1);
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(1);
    const tesserae = placeholderTesserae();
    expect(tesserae.source.pyramid.levels).toHaveLength(1);
    expect(tesserae.cacheable).toBe(false);
  });

  it('is only a world rect for a scene without an image: no tesserae, no pixels, no albedo', async () => {
    const { mosaicCanvas, viewport } = harness();

    await mosaicCanvas.load({ kind: 'none', width: 1400, height: 1400 });

    expect(mosaicCanvas.worldRect).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(0);
    expect(viewport.worldWidth).toBe(10000);
    await expect(mosaicCanvas.overview(64)).resolves.toBeNull();
    expect(mosaicCanvas.albedoTexture()).toBeNull();
    await expect(mosaicCanvas.whenReady({ x: 0, y: 0, width: 100, height: 100 }, 1, 1500)).resolves.toBeUndefined();
  });

  it('makes the albedo from the overview once asked, and tells its listeners', async () => {
    const { mosaicCanvas, service, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    expect(mosaicCanvas.albedoTexture()).toBeNull();
    await vi.waitFor(() => expect(changes).toContain('albedo'));

    const albedo = mosaicCanvas.albedoTexture();
    expect(albedo).toBeInstanceOf(Texture);
    expect(albedo?.source.autoGenerateMipmaps).toBe(true);
    expect(service.overview).toHaveBeenCalledWith(1, 2048);
  });

  it('waits for the tesserae its camera shows no longer than the timeout', async () => {
    vi.useFakeTimers();
    const { mosaicCanvas, service } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    let ready = false;

    void mosaicCanvas.whenCameraReady(1500).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(1400);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(100);

    expect(ready).toBe(true);
  });

  it('takes the image off on clear until the next load', async () => {
    const { mosaicCanvas, service, changes } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    mosaicCanvas.clear();

    expect(mosaicCanvas.worldRect).toBeNull();
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(0);
    expect(service.close).toHaveBeenCalledWith(1);
    expect(changes).toEqual(['image', 'image']);
  });

  it('answers null for an overview whose map was closed meanwhile, and rejects for other failures', async () => {
    const { mosaicCanvas, service } = harness();
    service.open.mockResolvedValue(opened(1, 'cave'));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });

    service.overview.mockRejectedValueOnce(new MapClosedError());
    await expect(mosaicCanvas.overview(512)).resolves.toBeNull();
    service.overview.mockRejectedValueOnce(new Error('Corrupt tessera'));
    await expect(mosaicCanvas.overview(512)).rejects.toThrow('Corrupt tessera');
  });

  it('opens the shown map again in a new layer when the tessera worker restarts, which asks again for the tesserae that failed', async () => {
    const { mosaicCanvas, service, changes, ticker, restart } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave')).mockResolvedValueOnce(opened(2, 'cave'));
    service.tessera.mockImplementation((handle: number) => (handle === 1
      ? Promise.reject(new Error('The map tessera worker stopped unexpectedly.'))
      : new Promise<ImageBitmap>(() => undefined)));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    const before = tesseraLayers(mosaicCanvas)[0];
    ticker.update(1000);
    await vi.waitFor(() => expect(service.tessera).toHaveBeenCalledWith(1, expect.anything(), expect.anything()));
    const failedRefs = service.tessera.mock.calls.map((call) => JSON.stringify(call[1]));

    restart();
    await vi.waitFor(() => expect(service.open).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(tesseraLayers(mosaicCanvas)[0]).not.toBe(before));
    ticker.update(2000);

    // The layer holds the container that turns the tesserae level, which holds the tessera layer.
    expect(mosaicCanvas.layer.children).toHaveLength(1);
    expect(tesseraLayers(mosaicCanvas)).toHaveLength(1);
    expect(service.close).toHaveBeenCalledWith(1);
    const again = service.tessera.mock.calls.filter((call) => call[0] === 2).map((call) => JSON.stringify(call[1]));
    expect(again).toEqual(expect.arrayContaining(failedRefs));
    expect(changes).toEqual(['image', 'image']);
  });

  it('does not reopen after a restart while another load is under way, nor once destroyed', async () => {
    const { mosaicCanvas, service, restart } = harness();
    service.open.mockResolvedValueOnce(opened(1, 'cave'));
    await mosaicCanvas.load({ kind: 'file', file: fileAt('maps/cave.webp') });
    const slow = deferred<OpenedMap>();
    service.open.mockReturnValueOnce(slow.promise);
    const loading = mosaicCanvas.load({ kind: 'file', file: fileAt('maps/tower.webp') });

    restart();
    slow.resolve(opened(2, 'tower'));
    await loading;
    expect(service.open).toHaveBeenCalledTimes(2);

    mosaicCanvas.destroy();
    restart();
    expect(service.open).toHaveBeenCalledTimes(2);
  });
});
