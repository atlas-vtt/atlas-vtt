import { Container, Ticker, WebGLRenderer } from 'pixi.js';
import { TFile } from 'obsidian';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapImage } from '../../src/app/pixi/mapImage/MapImage';
import type { MapImageOpener } from '../../src/app/pixi/mapImage/mapImageTypes';
import { pyramidOf, tileSourceRect, type TileRef } from '../../src/app/pixi/mapImage/pyramid';

const WIDTH = 2000;
const HEIGHT = 1000;
const SCREEN = 240;
const LEFT: [number, number, number] = [0, 0, 255];
const RIGHT: [number, number, number] = [255, 0, 0];

/** A map whose left half is blue and whose right half is red, served tile by tile like the tile worker does. */
function twoColouredMap(): MapImageOpener {
  const pyramid = pyramidOf(WIDTH, HEIGHT);
  const levels = pyramid.levels.map((level) => {
    const canvas = new OffscreenCanvas(level.width, level.height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = `rgb(${LEFT.join(', ')})`;
    context.fillRect(0, 0, level.width / 2, level.height);
    context.fillStyle = `rgb(${RIGHT.join(', ')})`;
    context.fillRect(level.width / 2, 0, level.width / 2, level.height);
    return canvas;
  });
  return {
    open: () => Promise.resolve({ handle: 1, hash: 'two-coloured', pyramid }),
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

/**
 * A map whose printed grid is not regular is drawn stretched, so that a regular grid fits it
 * (`GridState.mapStretch`). The tiles must land where the stretched world has them: the image's
 * middle in the middle of the stretched rect, its edges on the rect's edges, at every stretch.
 */
describe('a map image drawn stretched', () => {
  let renderer: WebGLRenderer;

  beforeAll(async () => {
    renderer = new WebGLRenderer();
    await renderer.init({ width: SCREEN, height: SCREEN, antialias: false, background: 0x000000, resolution: 1, preserveDrawingBuffer: true });
  });

  afterAll(() => {
    renderer.destroy();
  });

  /** The colour the canvas shows at a world point, after a render of the whole world fit to the screen. */
  function colourAt(pixels: Uint8ClampedArray, zoom: number, x: number, y: number): [number, number, number] {
    const i = (Math.floor(y * zoom) * SCREEN + Math.floor(x * zoom)) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  }

  it.each([
    { x: 1, y: 1 },
    { x: 1.5, y: 1 },
    { x: 1, y: 1.25 },
  ])('puts the image on its stretched world rect ($x × $y)', async (stretch) => {
    const ticker = new Ticker();
    const world = { width: WIDTH * stretch.x, height: HEIGHT * stretch.y };
    const zoom = SCREEN / world.width;
    const viewport = { left: 0, top: 0, worldScreenWidth: world.width, worldScreenHeight: world.width, scale: { x: zoom }, worldWidth: 0, worldHeight: 0 };
    const mapImage = new MapImage({ service: twoColouredMap(), viewport, ticker, renderer, requestRender: () => undefined, drawAtOnce: () => true });
    const stage = new Container();
    const camera = new Container({ scale: zoom });
    stage.addChild(camera);
    camera.addChild(mapImage.layer);

    await mapImage.load({ kind: 'file', file: Object.assign(new TFile(), { path: 'maps/two.png', stat: { ctime: 0, mtime: 1, size: 2 } }) });
    mapImage.setStretch(stretch);
    expect(mapImage.worldRect).toEqual({ x: 0, y: 0, ...world });

    let ready = false;
    void mapImage.whenReady({ x: 0, y: 0, ...world }, 1 / zoom, 20_000).then(() => { ready = true; });
    for (let step = 0, time = 0; !ready && step < 1000; step++) {
      ticker.update((time += 16));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(ready).toBe(true);
    ticker.update(100_000);

    renderer.render(stage);
    const context = new OffscreenCanvas(SCREEN, SCREEN).getContext('2d')!;
    context.drawImage(renderer.canvas, 0, 0);
    const pixels = context.getImageData(0, 0, SCREEN, SCREEN).data;
    const margin = 3 / zoom;

    const middle = world.width / 2;
    expect(colourAt(pixels, zoom, middle - margin, world.height / 2)).toEqual(LEFT);
    expect(colourAt(pixels, zoom, middle + margin, world.height / 2)).toEqual(RIGHT);
    // The image reaches the stretched rect's far edges and no further.
    expect(colourAt(pixels, zoom, world.width - margin, world.height - margin)).toEqual(RIGHT);
    expect(colourAt(pixels, zoom, margin, world.height - margin)).toEqual(LEFT);
    expect(colourAt(pixels, zoom, middle, world.height + margin)).toEqual([0, 0, 0]);

    mapImage.destroy();
    stage.destroy();
    ticker.destroy();
  });

  it('turns an image that lies askew level about its centre', async () => {
    const stretch = { x: 1, y: 1, rotation: 4 };
    const ticker = new Ticker();
    const turn = (stretch.rotation * Math.PI) / 180;
    const world = { width: WIDTH * Math.cos(turn) + HEIGHT * Math.sin(turn), height: WIDTH * Math.sin(turn) + HEIGHT * Math.cos(turn) };
    const zoom = SCREEN / world.width;
    const viewport = { left: 0, top: 0, worldScreenWidth: world.width, worldScreenHeight: world.width, scale: { x: zoom }, worldWidth: 0, worldHeight: 0 };
    const mapImage = new MapImage({ service: twoColouredMap(), viewport, ticker, renderer, requestRender: () => undefined, drawAtOnce: () => true });
    const stage = new Container();
    const camera = new Container({ scale: zoom });
    stage.addChild(camera);
    camera.addChild(mapImage.layer);

    await mapImage.load({ kind: 'file', file: Object.assign(new TFile(), { path: 'maps/two.png', stat: { ctime: 0, mtime: 1, size: 2 } }) }, stretch);
    expect(mapImage.worldRect!.width).toBeCloseTo(world.width, 6);

    let ready = false;
    void mapImage.whenReady({ x: 0, y: 0, ...world }, 1 / zoom, 20_000).then(() => { ready = true; });
    for (let step = 0, time = 0; !ready && step < 1000; step++) {
      ticker.update((time += 16));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(ready).toBe(true);
    ticker.update(100_000);

    renderer.render(stage);
    const context = new OffscreenCanvas(SCREEN, SCREEN).getContext('2d')!;
    context.drawImage(renderer.canvas, 0, 0);
    const pixels = context.getImageData(0, 0, SCREEN, SCREEN).data;
    const margin = 4 / zoom;

    // The image's centre is the world's, with the boundary between its halves through it.
    expect(colourAt(pixels, zoom, world.width / 2 - margin, world.height / 2)).toEqual(LEFT);
    expect(colourAt(pixels, zoom, world.width / 2 + margin, world.height / 2)).toEqual(RIGHT);
    // The boundary runs turned: the image is turned back anticlockwise, so its upper end lies to the left of the centre.
    const lean = Math.tan(turn) * (HEIGHT / 2 - 2 * margin);
    expect(colourAt(pixels, zoom, world.width / 2 + lean / 2 - margin - lean, 2 * margin + world.height / 2 - HEIGHT / 2 + margin)).toEqual(LEFT);
    // The corners of the box that holds the turned image are empty.
    expect(colourAt(pixels, zoom, margin / 2, margin / 2)).toEqual([0, 0, 0]);
    expect(colourAt(pixels, zoom, world.width - margin / 2, world.height - margin / 2)).toEqual([0, 0, 0]);

    mapImage.destroy();
    stage.destroy();
    ticker.destroy();
  });
});
