import { Container, Ticker, WebGLRenderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapImageLayer, type TileSource } from '../../src/app/pixi/mapImage/MapImageLayer';
import { levelFor, type TileView } from '../../src/app/pixi/mapImage/levelOfDetail';
import { pyramidOf, tileSourceRect, type TileRef } from '../../src/app/pixi/mapImage/pyramid';
import { TileTextureCache } from '../../src/app/pixi/mapImage/tileTextureCache';
import { hasPendingChanges } from '../../src/app/pixi/RenderScheduler';

const WIDTH = 3000;
const HEIGHT = 2000;
const SCREEN = 128;
/** Each level of the map painted in a colour of its own, so a pixel tells which level drew it. */
const LEVEL_COLOURS: Array<[number, number, number]> = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];

function levelColouredMap(): TileSource {
  const pyramid = pyramidOf(WIDTH, HEIGHT);
  const levels = pyramid.levels.map((level) => {
    const canvas = new OffscreenCanvas(level.width, level.height);
    const context = canvas.getContext('2d')!;
    const [red, green, blue] = LEVEL_COLOURS[level.index]!;
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.fillRect(0, 0, level.width, level.height);
    return canvas;
  });
  return {
    key: 'levels',
    pyramid,
    requestTile: (ref: TileRef): Promise<ImageBitmap> => {
      const rect = tileSourceRect(pyramid, ref);
      return createImageBitmap(levels[ref.level]!, rect.x, rect.y, rect.width, rect.height);
    },
  };
}

/** The level whose colour fills the picture, or -1 for anything else. */
function drawnLevel(renderer: WebGLRenderer, stage: Container): number {
  renderer.render(stage);
  const context = new OffscreenCanvas(SCREEN, SCREEN).getContext('2d')!;
  context.drawImage(renderer.canvas, 0, 0);
  const pixels = context.getImageData(0, 0, SCREEN, SCREEN).data;
  const levels = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4 * 97) {
    const level = LEVEL_COLOURS.findIndex(([red, green, blue]) =>
      Math.abs(pixels[i]! - red) < 8 && Math.abs(pixels[i + 1]! - green) < 8 && Math.abs(pixels[i + 2]! - blue) < 8);
    levels.add(level);
  }
  return levels.size === 1 ? [...levels][0]! : -1;
}

/**
 * Each picture of the map draws its own view's tiles: the canvas the GM camera's, the player
 * window's frame its own, for exactly one render. PIXI rebuilds the layer's render group around
 * the switch, and once the canvas has rendered again nothing is left pending.
 */
describe('a map image drawn for several views', () => {
  let renderer: WebGLRenderer;

  beforeAll(async () => {
    renderer = new WebGLRenderer();
    await renderer.init({ width: SCREEN, height: SCREEN, antialias: false, background: 0x000000, resolution: 1, preserveDrawingBuffer: true });
  });

  afterAll(() => {
    renderer.destroy();
  });

  async function setup(camera: { view: TileView }): Promise<{
    layer: MapImageLayer;
    stage: Container;
    settle: (until: () => boolean) => Promise<void>;
    destroy: () => void;
  }> {
    const ticker = new Ticker();
    const cache = new TileTextureCache({ ticker, renderer, requestRender: () => undefined });
    const layer = new MapImageLayer({ source: levelColouredMap(), cache, ticker, requestRender: () => undefined, reducedMotion: () => true, camera: () => camera.view });
    const stage = new Container();
    stage.addChild(layer.container);
    let time = 0;
    const settle = async (until: () => boolean): Promise<void> => {
      for (let step = 0; !until() && step < 1000; step++) {
        ticker.update((time += 16));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      // The frame after: retained tiles let go once the wanted ones are opaque
      ticker.update((time += 16));
      expect(until()).toBe(true);
    };
    return { layer, stage, settle, destroy: () => { layer.destroy(); stage.destroy(); cache.destroy(); ticker.destroy(); } };
  }

  it('renders the GM camera, then the players\' frame, then the GM camera again', async () => {
    const camera = { view: { rect: { x: 0, y: 0, width: SCREEN, height: SCREEN }, worldPerScreenPixel: 1 } };
    const { layer, stage, settle, destroy } = await setup(camera);
    // The players see the whole map at an eighth: level 2.
    const players: TileView = { rect: { x: 0, y: 0, width: WIDTH, height: HEIGHT }, worldPerScreenPixel: 8 };
    layer.addDemandRegion(players);
    let ready = false;
    void Promise.all([layer.whenReady(camera.view, 20_000), layer.whenReady(players, 20_000)]).then(() => { ready = true; });
    await settle(() => ready);
    // The prefetch ring arrives too, so every tile a view draws has its sprite.
    let frames = 0;
    await settle(() => ++frames > 30);

    expect(drawnLevel(renderer, stage)).toBe(0);
    expect(hasPendingChanges(stage.renderGroup!)).toBe(false);

    const restore = layer.drawFor(players);
    expect(drawnLevel(renderer, stage)).toBe(2);
    restore();
    // The canvas' picture is back for its next render, which leaves nothing pending.
    expect(hasPendingChanges(stage.renderGroup!)).toBe(true);
    expect(drawnLevel(renderer, stage)).toBe(0);
    expect(hasPendingChanges(stage.renderGroup!)).toBe(false);

    // A picture of what the canvas shows changes nothing on the stage.
    layer.drawFor(camera.view)();
    expect(hasPendingChanges(stage.renderGroup!)).toBe(false);
    destroy();
  });

  it('draws a camera zoomed out from its own level, not from the finer tiles it showed before', async () => {
    const camera = { view: { rect: { x: 0, y: 0, width: SCREEN, height: SCREEN }, worldPerScreenPixel: 1 } };
    const { layer, stage, settle, destroy } = await setup(camera);
    let ready = false;
    void layer.whenReady(camera.view, 20_000).then(() => { ready = true; });
    await settle(() => ready);
    expect(drawnLevel(renderer, stage)).toBe(0);

    // Zoomed out to an eighth: the stage shows the camera's world at that scale.
    camera.view = { rect: { x: 0, y: 0, width: SCREEN * 8, height: SCREEN * 8 }, worldPerScreenPixel: 8 };
    stage.scale.set(1 / 8);
    const level = levelFor(pyramidOf(WIDTH, HEIGHT), 8);
    expect(level).toBe(2);
    await settle(() => drawnLevel(renderer, stage) === level);
    destroy();
  });
});
