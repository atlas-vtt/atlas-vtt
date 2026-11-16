import type { App } from 'obsidian';
import { Container, Ticker, WebGLRenderer, type Application } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MosaicCanvasLayer, type TesseraSource } from '../../src/app/pixi/mosaicCanvas/MosaicCanvasLayer';
import { levelFor, pictureView, visibleTesserae, type TesseraView } from '../../src/app/pixi/mosaicCanvas/levelOfDetail';
import { pyramidOf, tesseraKey, tesseraSourceRect, type TesseraRef } from '../../src/app/pixi/mosaicCanvas/pyramid';
import { TesseraTextureCache } from '../../src/app/pixi/mosaicCanvas/tesseraTextureCache';
import type { SceneFrameCapture } from '../../src/app/pixi/sceneFrameCapture';
import { MAP_THUMBNAIL_SIZE, MapThumbnailService } from '../../src/app/services/MapThumbnailService';
import { decodeImage } from '../../src/app/services/__tests__/thumbnailScene';

const WIDTH = 3000;
const HEIGHT = 2000;
const SCREEN = 256;
const GREEN = '#00c800';

/** Serves tesserae of a map that is green all over, each level drawn from the one before. */
function greenMap(): TesseraSource {
  const pyramid = pyramidOf(WIDTH, HEIGHT);
  const levels = pyramid.levels.map((level) => {
    const canvas = new OffscreenCanvas(level.width, level.height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = GREEN;
    context.fillRect(0, 0, level.width, level.height);
    return canvas;
  });
  return {
    key: 'green',
    pyramid,
    requestTessera: (ref: TesseraRef): Promise<ImageBitmap> => {
      const rect = tesseraSourceRect(pyramid, ref);
      return createImageBitmap(levels[ref.level]!, rect.x, rect.y, rect.width, rect.height);
    },
  };
}

/**
 * A scene card of a map while the GM's camera is zoomed far into its top left corner: the
 * layer holds fine tesserae of that corner for the canvas, and tesserae of the whole map at the
 * card's own detail for the thumbnail, which draws those alone. Every part of it must be drawn.
 */
describe('a thumbnail of a tiled map while the GM is zoomed into a corner', () => {
  let renderer: WebGLRenderer;

  beforeAll(async () => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    renderer = new WebGLRenderer();
    await renderer.init({ width: SCREEN, height: SCREEN, antialias: false, resolution: 1, preserveDrawingBuffer: true });
  });

  afterAll(() => {
    renderer.destroy();
    vi.unstubAllGlobals();
  });

  it('draws the whole map from the level the thumbnail asks for, and leaves the canvas to the camera', async () => {
    const source = greenMap();
    const { pyramid } = source;
    const ticker = new Ticker();
    const cache = new TesseraTextureCache({ ticker, renderer, requestRender: () => undefined });
    const layer = new MosaicCanvasLayer({ source, cache, ticker, requestRender: () => undefined, reducedMotion: () => true, picture: MAP_THUMBNAIL_SIZE });
    const viewport = new Container();
    viewport.addChild(layer.container);
    // 400 %: the GM sees 64 × 64 world pixels at the map's top left corner, from level 0.
    const camera: TesseraView = { rect: { x: 0, y: 0, width: SCREEN / 4, height: SCREEN / 4 }, worldPerScreenPixel: 0.25 };
    viewport.scale.set(4);
    layer.setCamera(() => camera);

    const whole = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
    const picture = pictureView(whole, MAP_THUMBNAIL_SIZE)!;
    const pictureLevel = levelFor(pyramid, picture.worldPerScreenPixel);
    const sprites = (): Container[] => (layer.container.children as Container[]).flatMap(level => level.children);
    const pictureTiles = visibleTesserae(pyramid, pictureLevel, picture.rect, 0).map(tesseraKey);
    let ready = false;
    void layer.whenReady(camera, 20_000).then(() => { ready = true; });
    // The picture's tesserae load after the camera's: wait until they are drawn too, and a frame more for the fallbacks to go.
    const pictureDrawn = (): boolean => pictureTiles.every(key => sprites().some(sprite => sprite.label === key));
    let time = 16;
    for (; (!ready || !pictureDrawn()) && time < 16 * 400; time += 16) {
      ticker.update(time);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    ticker.update(time);
    expect(ready && pictureDrawn()).toBe(true);
    expect(sprites().filter(sprite => sprite.visible).map(sprite => sprite.label)).toContain('0/0/0');
    expect(sprites().filter(sprite => sprite.visible && pictureTiles.includes(sprite.label))).toEqual([]);

    const app = { renderer } as unknown as Application;
    let drawnInPicture: string[] = [];
    const capture: SceneFrameCapture = (_frame, render) => {
      const restore = layer.drawFor(picture);
      drawnInPicture = sprites().filter(sprite => sprite.visible).map(sprite => sprite.label);
      try {
        return render();
      } finally {
        restore();
      }
    };
    const thumbnail = new MapThumbnailService({} as App).renderThumbnail(app, viewport, whole, MAP_THUMBNAIL_SIZE, capture);
    // Only the thumbnail's own level is drawn in it: never a level shrunk more than twice.
    expect(drawnInPicture.sort()).toEqual([...pictureTiles].sort());
    expect(sprites().filter(sprite => sprite.visible).map(sprite => sprite.label)).toContain('0/0/0');

    const image = await decodeImage(thumbnail!);
    // A part no tessera is drawn on renders transparent, which the JPEG makes black.
    const undrawn: Array<{ x: number; y: number }> = [];
    for (let y = 5; y < image.height; y += 10) {
      for (let x = 5; x < image.width; x += 10) {
        const i = (y * image.width + x) * 4;
        const [red, green] = [image.data[i]!, image.data[i + 1]!];
        if (red > 60 || green < 140) undrawn.push({ x, y });
      }
    }
    expect(undrawn).toEqual([]);

    layer.destroy();
    viewport.destroy();
    cache.destroy();
    ticker.destroy();
  });
});
