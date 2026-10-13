import { Container, ImageSource, Sprite, Texture, Ticker, WebGLRenderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapImageLayer, type TileSource } from '../../src/app/pixi/mapImage/MapImageLayer';
import type { TileView } from '../../src/app/pixi/mapImage/levelOfDetail';
import { pyramidOf, tileContentFrame, tileSourceRect, type TileRef } from '../../src/app/pixi/mapImage/pyramid';
import { TileTextureCache } from '../../src/app/pixi/mapImage/tileTextureCache';

const WIDTH = 3000;
const HEIGHT = 2000;
const VIEW = 256;
/** Bilinear weights of the tiled and the whole texture may round apart by a step; a seam differs by far more. */
const TOLERANCE = 2;

/** A map with detail at every pixel: stripes a few pixels wide in three directions, crossing every tile seam. */
function patternMap(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      image.data[i] = 128 + 127 * Math.sin(x * 0.9 + y * 0.3);
      image.data[i + 1] = 128 + 127 * Math.sin(y * 1.1 - x * 0.2);
      image.data[i + 2] = (x ^ y) & 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Serves tiles cut from the image with the pyramid's own geometry; coarser levels from a halved copy. */
async function tileSource(map: OffscreenCanvas): Promise<TileSource> {
  const pyramid = pyramidOf(WIDTH, HEIGHT);
  const levels: CanvasImageSource[] = [];
  for (const level of pyramid.levels) {
    if (level.index === 0) {
      levels.push(map);
      continue;
    }
    const canvas = new OffscreenCanvas(level.width, level.height);
    canvas.getContext('2d')!.drawImage(levels[level.index - 1]!, 0, 0, level.width, level.height);
    levels.push(canvas);
  }
  return {
    key: 'seams',
    pyramid,
    requestTile: (ref: TileRef): Promise<ImageBitmap> => {
      const rect = tileSourceRect(pyramid, ref);
      return createImageBitmap(levels[ref.level]!, rect.x, rect.y, rect.width, rect.height);
    },
  };
}

/** `tiles` with the pixels each tile carries of its neighbours painted black, as a tiler without overlap would leave them. */
function withoutOverlap(tiles: TileSource): TileSource {
  return {
    ...tiles,
    requestTile: async (ref, signal): Promise<ImageBitmap> => {
      const bitmap = await tiles.requestTile(ref, signal);
      const frame = tileContentFrame(tiles.pyramid, ref);
      const { width, height } = bitmap;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      context.fillStyle = '#000';
      context.fillRect(0, 0, frame.x, height);
      context.fillRect(0, 0, width, frame.y);
      context.fillRect(frame.x + frame.width, 0, width, height);
      context.fillRect(0, frame.y + frame.height, width, height);
      return createImageBitmap(canvas);
    },
  };
}

interface Camera { zoom: number; x: number; y: number }

function viewOf(camera: Camera, resolution: number): TileView {
  const size = VIEW / camera.zoom;
  return { rect: { x: camera.x - size / 2, y: camera.y - size / 2, width: size, height: size }, worldPerScreenPixel: 1 / (camera.zoom * resolution) };
}

function place(world: Container, camera: Camera): void {
  world.scale.set(camera.zoom);
  world.position.set(VIEW / 2 - camera.x * camera.zoom, VIEW / 2 - camera.y * camera.zoom);
}

function read(renderer: WebGLRenderer, stage: Container): Uint8ClampedArray {
  renderer.render(stage);
  const pixels = Math.round(VIEW * renderer.resolution);
  const context = new OffscreenCanvas(pixels, pixels).getContext('2d')!;
  context.drawImage(renderer.canvas, 0, 0);
  return context.getImageData(0, 0, pixels, pixels).data;
}

function largestDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let largest = 0;
  for (let i = 0; i < a.length; i++) largest = Math.max(largest, Math.abs(a[i]! - b[i]!));
  return largest;
}

describe('a tiled map image', () => {
  let renderer: WebGLRenderer;
  let source: TileSource;
  let whole: Texture;

  beforeAll(async () => {
    renderer = new WebGLRenderer();
    // Magenta behind the map: a gap at a seam would show it.
    await renderer.init({ width: VIEW, height: VIEW, antialias: false, background: 0xff00ff, resolution: 1, preserveDrawingBuffer: true });
    const map = patternMap();
    source = await tileSource(map);
    whole = new Texture({ source: new ImageSource({ resource: await createImageBitmap(map) }) });
  });

  afterAll(() => {
    whole.destroy(true);
    renderer.destroy();
  });

  // Each camera's centre lies off the pixel grid near a seam where four tiles meet (510 and 1020 px).
  const cameras: Array<[string, Camera]> = [
    ['100 %', { zoom: 1, x: 1020.37, y: 1020.71 }],
    ['400 %', { zoom: 4, x: 510.13, y: 509.83 }],
    ['400 % at another seam', { zoom: 4, x: 1530.5, y: 1020.25 }],
  ];

  /** Draws the map from `tiles` as the layer does, once its view is ready, and reads the picture back. */
  async function renderTiled(tiles: TileSource, camera: Camera): Promise<Uint8ClampedArray> {
    const ticker = new Ticker();
    const cache = new TileTextureCache({ ticker, renderer, requestRender: () => undefined });
    const layer = new MapImageLayer({ source: tiles, cache, ticker, requestRender: () => undefined, drawAtOnce: () => true });
    const world = new Container();
    world.addChild(layer.container);
    place(world, camera);
    layer.setCamera(() => viewOf(camera, renderer.resolution));
    let ready = false;
    void layer.whenReady(viewOf(camera, renderer.resolution), 20_000).then(() => { ready = true; });
    // Until the view is ready and its overview is covered, so a gap between tiles could show only the magenta.
    const drawnLevels = (): number => layer.container.children.filter(level => level.children.some(sprite => sprite.visible)).length;
    for (let time = 16; (!ready || drawnLevels() > 1) && time < 16 * 2000; time += 16) {
      ticker.update(time);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(ready).toBe(true);
    expect(drawnLevels()).toBe(1);
    const picture = read(renderer, world);
    layer.destroy();
    world.destroy();
    cache.destroy();
    ticker.destroy();
    return picture;
  }

  function renderWhole(camera: Camera): Uint8ClampedArray {
    const world = new Container();
    world.addChild(new Sprite(whole));
    place(world, camera);
    const picture = read(renderer, world);
    world.destroy({ children: true });
    return picture;
  }

  it.each(cameras)('draws no seam at %s', async (name, camera) => {
    const difference = largestDifference(await renderTiled(source, camera), renderWhole(camera));
    console.info(`[mapImageSeams] ${name}: largest channel difference ${difference}`);
    expect(difference).toBeLessThanOrEqual(TOLERANCE);
  });

  it('would see a seam: without the overlap pixels the same comparison fails', async () => {
    const camera = cameras[1]![1];
    const difference = largestDifference(await renderTiled(withoutOverlap(source), camera), renderWhole(camera));
    console.info(`[mapImageSeams] without overlap: largest channel difference ${difference}`);
    expect(difference).toBeGreaterThan(20);
  });
});
