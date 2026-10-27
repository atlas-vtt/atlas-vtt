import { Container, RenderTexture, Ticker, WebGLRenderer } from 'pixi.js';
import { TFile } from 'obsidian';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapImage } from '../../src/app/pixi/mapImage/MapImage';
import type { MapImageOpener } from '../../src/app/pixi/mapImage/mapImageTypes';
import { pyramidOf, tileSourceRect, type TileRef } from '../../src/app/pixi/mapImage/pyramid';
import type { MapVideoDeps, MapVideoProblem } from '../../src/app/pixi/mapImage/video/MapVideoSlot';
import { openVideoElement, type OpenedVideo } from '../../src/app/pixi/mapImage/video/videoElement';
import { videoPoster } from '../../src/app/pixi/mapImage/video/videoPoster';
import { VIDEO_MAP_SIZE, videoMapWebm } from '../fixtures/videoMapFixture';
import { requiredMainThreadDecode } from '../../src/app/pixi/mapImage/mainThreadDecode';
import { TileDecoderClient } from '../../src/app/pixi/mapImage/TileDecoderClient';
import { workerPort } from '../../src/app/pixi/mapImage/tilePorts';
import TileWorker from '../../src/app/pixi/mapImage/tileWorker?worker&inline';

const { width: WIDTH, height: HEIGHT } = VIDEO_MAP_SIZE;
const SCREEN = 240;
type Colour = 'blue' | 'red' | 'green' | 'yellow' | 'black' | 'other';

/** Names a pixel by its channels; video decoding moves them a little. */
function nameOf([r, g, b]: [number, number, number]): Colour {
  const high = (value: number): boolean => value > 180;
  const low = (value: number): boolean => value < 70;
  if (low(r) && low(g) && high(b)) return 'blue';
  if (high(r) && low(g) && low(b)) return 'red';
  if (low(r) && high(g) && low(b)) return 'green';
  if (high(r) && high(g) && low(b)) return 'yellow';
  if (low(r) && low(g) && low(b)) return 'black';
  return 'other';
}

/** A tile service serving `poster`'s pyramid, as the tile worker does for a video map. */
function posterService(poster: ImageBitmap): MapImageOpener {
  const pyramid = pyramidOf(poster.width, poster.height);
  const levels = pyramid.levels.map((level) => {
    const canvas = new OffscreenCanvas(level.width, level.height);
    canvas.getContext('2d')!.drawImage(poster, 0, 0, level.width, level.height);
    return canvas;
  });
  return {
    open: () => Promise.resolve({ handle: 1, hash: 'video-poster', pyramid }),
    tile: (_handle: number, ref: TileRef) => {
      const rect = tileSourceRect(pyramid, ref);
      return createImageBitmap(levels[ref.level]!, rect.x, rect.y, rect.width, rect.height);
    },
    overview: () => createImageBitmap(levels[pyramid.overview]!),
    close: () => undefined,
    reportUnshown: () => undefined,
    onRestart: () => () => undefined,
  };
}

const videoFile = (): TFile => Object.assign(new TFile(), { path: 'maps/river.webm', extension: 'webm', stat: { ctime: 0, mtime: 1, size: 2 } });

const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('an animated map', () => {
  let renderer: WebGLRenderer;
  let poster: ImageBitmap;

  beforeAll(async () => {
    renderer = new WebGLRenderer();
    await renderer.init({ width: SCREEN, height: SCREEN, antialias: false, background: 0x000000, resolution: 1, preserveDrawingBuffer: true });
    poster = await videoPoster(videoMapWebm(), 'video/webm');
  });

  afterAll(() => {
    poster.close();
    renderer.destroy();
  });

  it('takes its first frame as the poster, at the video\'s size', () => {
    expect({ width: poster.width, height: poster.height }).toEqual(VIDEO_MAP_SIZE);
    const context = new OffscreenCanvas(WIDTH, HEIGHT).getContext('2d')!;
    context.drawImage(poster, 0, 0);
    const at = (x: number): Colour => nameOf(Array.from(context.getImageData(x, HEIGHT / 2, 1, 1).data) as [number, number, number]);
    expect([at(WIDTH / 4), at((3 * WIDTH) / 4)]).toEqual(['blue', 'red']);
  });

  it('has its tile pyramid built from the poster by the real tile worker', async () => {
    const client = new TileDecoderClient({ appId: null, worker: workerPort(() => new TileWorker({ name: 'video map test' })) });
    const file = videoFile();
    const opened = await client.open(videoMapWebm(), { path: file.path, size: 1, mtime: 2 }, requiredMainThreadDecode(file));
    expect({ width: opened.pyramid.width, height: opened.pyramid.height }).toEqual(VIDEO_MAP_SIZE);
    const overview = await client.overview(opened.handle, WIDTH);
    const context = new OffscreenCanvas(overview.width, overview.height).getContext('2d')!;
    context.drawImage(overview, 0, 0);
    const at = (x: number): Colour => nameOf(Array.from(context.getImageData(x, overview.height / 2, 1, 1).data) as [number, number, number]);
    expect([at(overview.width / 4), at((3 * overview.width) / 4)]).toEqual(['blue', 'red']);
    overview.close();
    client.dispose();
  });

  /** A map image of the fixture drawn `stretch` times wider, fit to the screen, with what it rendered and reported. */
  async function scene(options: { maxTextureSize?: number; stretch?: { x: number; y: number } } = {}) {
    const stretch = options.stretch ?? { x: 1, y: 1 };
    const ticker = new Ticker();
    const world = { width: WIDTH * stretch.x, height: HEIGHT * stretch.y };
    const zoom = SCREEN / world.width;
    const viewport = { left: 0, top: 0, worldScreenWidth: world.width, worldScreenHeight: world.width, scale: { x: zoom }, worldWidth: 0, worldHeight: 0 };
    const opened: OpenedVideo[] = [];
    const problems: MapVideoProblem[] = [];
    let letOpen!: () => void;
    const opening = new Promise<void>((resolve) => { letOpen = resolve; });
    let renders = 0;
    const video: MapVideoDeps = {
      open: async () => {
        await opening;
        const element = await openVideoElement(document, videoMapWebm(), 'video/webm');
        opened.push(element);
        return element;
      },
      maxTextureSize: () => options.maxTextureSize ?? 4096,
      reportStill: (_file, problem) => problems.push(problem),
    };
    const mapImage = new MapImage({ service: posterService(poster), viewport, ticker, renderer, requestRender: () => { renders++; }, drawAtOnce: () => true, video });
    const stage = new Container();
    const camera = new Container({ scale: zoom });
    stage.addChild(camera);
    camera.addChild(mapImage.layer);
    await mapImage.load({ kind: 'video', file: videoFile() }, stretch);

    let ready = false;
    void mapImage.whenReady({ x: 0, y: 0, ...world }, 1 / zoom, 20_000).then(() => { ready = true; });
    for (let step = 0, time = 0; !ready && step < 1000; step++) {
      ticker.update((time += 16));
      await nextTask();
    }
    ticker.update(100_000);

    /** The colours of the screen just left and right of the world's middle, and at the stretched rect's far edges. */
    const look = (): Colour[] => {
      renderer.render(stage);
      const context = new OffscreenCanvas(SCREEN, SCREEN).getContext('2d')!;
      context.drawImage(renderer.canvas, 0, 0);
      const at = (x: number, y: number): Colour => {
        const i = (Math.floor(y * zoom) * SCREEN + Math.floor(x * zoom)) * 4;
        const pixels = context.getImageData(0, 0, SCREEN, SCREEN).data;
        return nameOf([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
      };
      const margin = 4 / zoom;
      return [at(world.width / 2 - margin, world.height / 2), at(world.width / 2 + margin, world.height / 2), at(world.width - margin, world.height - margin), at(world.width / 2, world.height + margin)];
    };
    const dispose = (): void => {
      mapImage.destroy();
      stage.destroy();
      ticker.destroy();
    };
    return { mapImage, stage, zoom, look, letOpen, opened, problems, renders: () => renders, dispose };
  }

  /** Waits until `ready` holds, rendering meanwhile, for at most `ms`. */
  async function until(ready: () => boolean, ms = 5000): Promise<boolean> {
    const end = performance.now() + ms;
    while (!ready() && performance.now() < end) await new Promise((resolve) => setTimeout(resolve, 20));
    return ready();
  }

  it('shows its poster while the video loads, then plays frame after frame over it, stretched like the tiles', async () => {
    const map = await scene({ stretch: { x: 1.5, y: 1 } });
    map.mapImage.setVideoMode('play');
    // The poster's tiles, stretched: the halves meet in the middle of the stretched rect, which they fill.
    expect(map.look()).toEqual(['blue', 'red', 'red', 'black']);

    map.letOpen();
    expect(await until(() => map.opened.length === 1)).toBe(true);
    const rendersBefore = map.renders();
    // The second second of the video is green and yellow: only its frames show that.
    expect(await until(() => map.look()[0] === 'green', 4000)).toBe(true);
    expect(map.look()).toEqual(['green', 'yellow', 'yellow', 'black']);
    // Each decoded frame asked for a render (10 fps for about a second at least).
    expect(map.renders() - rendersBefore).toBeGreaterThanOrEqual(5);

    // An off-screen render of the stage, as the player window's capture is, shows the same frame.
    const target = RenderTexture.create({ width: SCREEN, height: SCREEN });
    map.mapImage.setVideoMode('pause');
    const shown = map.look();
    renderer.render({ container: map.stage, target });
    const pixels = renderer.extract.pixels(target).pixels;
    // Just left of the world's middle, halfway down the map.
    const i = (Math.floor((HEIGHT / 2) * map.zoom) * SCREEN + Math.floor(SCREEN / 2 - 4)) * 4;
    expect(nameOf([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!])).toBe(shown[0]);
    target.destroy(true);

    // A picture of the scene shows the poster.
    const restore = map.mapImage.hideVideoFor();
    expect(map.look()).toEqual(['blue', 'red', 'red', 'black']);
    restore();
    expect(map.look()[0]).toBe(shown[0]);

    // Animation switched off: the poster shows, and a paused video stays paused.
    map.mapImage.setVideoMode('poster');
    expect(map.look()).toEqual(['blue', 'red', 'red', 'black']);
    expect(map.opened[0]!.element.paused).toBe(true);

    const element = map.opened[0]!.element;
    map.dispose();
    // Unloaded: the video lost its source, so its memory can go.
    expect(element.getAttribute('src')).toBeNull();
  });

  it('shows the poster only, and says so once, where the video is larger than the graphics can draw', async () => {
    const map = await scene({ maxTextureSize: 64 });
    map.mapImage.setVideoMode('play');
    map.letOpen();
    expect(await until(() => map.problems.length > 0)).toBe(true);
    expect(map.problems).toEqual([{ kind: 'too-large', width: WIDTH, height: HEIGHT, maxSide: 64 }]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(map.look()).toEqual(['blue', 'red', 'red', 'black']);
    map.dispose();
  });

  it('reads nothing but its poster until it plays', async () => {
    const map = await scene();
    map.letOpen();
    map.mapImage.setVideoMode('pause');
    map.mapImage.setVideoMode('poster');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(map.opened).toHaveLength(0);
    map.dispose();
  });
});
