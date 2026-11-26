import { Container, Ticker, type Texture, type WebGLRenderer } from 'pixi.js';
import type { TFile } from 'obsidian';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import type { MosaicCanvasOpener } from '../../src/app/pixi/mosaicCanvas/mosaicCanvasTypes';
import { pyramidOf, tesseraSourceRect, TESSERA_CONTENT, type TesseraRef } from '../../src/app/pixi/mosaicCanvas/pyramid';
import { PixiAppManager } from '../../src/app/pixi/PixiAppManager';
import { watchGpuProcess } from './gpuProcessDeath';

/**
 * After Obsidian's GPU process died, the map view shows its whole map again once the context is
 * back, without the map being opened again: every tessera in view, and the lighting's albedo of it.
 */

// Before anything draws: the canvases made from here on are the ones the GPU process can take.
const gpu = watchGpuProcess();
afterAll(() => gpu.stop());

/** Six tesserae a side at the finest level: one batch binds more textures than PIXI forgets on a restored context. */
const TESSERAE = 6;
const SIDE = TESSERAE * TESSERA_CONTENT;
/** The canvas shows the map at a tenth. */
const SCALE = 0.1;
const SCREEN = SIDE * SCALE;
const ALBEDO = [200, 120, 40];

const colourOf = (col: number, row: number): number[] => [30 + col * 40, 30 + row * 40, 160];
const css = ([red, green, blue]: number[]): string => `rgb(${red}, ${green}, ${blue})`;

/** Each tessera of the finest level painted a colour of its own, at every level, in main memory as decoded tesserae are. */
function paintedLevels(): OffscreenCanvas[] {
  return pyramidOf(SIDE, SIDE).levels.map((level) => {
    const canvas = new OffscreenCanvas(level.width, level.height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const side = level.width / TESSERAE;
    for (let row = 0; row < TESSERAE; row++) {
      for (let col = 0; col < TESSERAE; col++) {
        context.fillStyle = css(colourOf(col, row));
        context.fillRect(col * side, row * side, side, side);
      }
    }
    return canvas;
  });
}

/** The tessera worker as the map image reads it: tesserae from main memory, the overview composed on a canvas the GPU process holds. */
function colouredMap(): MosaicCanvasOpener {
  const pyramid = pyramidOf(SIDE, SIDE);
  const levels = paintedLevels();
  return {
    open: () => Promise.resolve({ handle: 1, hash: 'colours', pyramid }),
    tessera: (_handle: number, ref: TesseraRef) => {
      const rect = tesseraSourceRect(pyramid, ref);
      return createImageBitmap(levels[ref.level]!, rect.x, rect.y, rect.width, rect.height);
    },
    overview: (_handle: number, maxSide: number) => {
      const side = Math.min(maxSide, SIDE);
      const canvas = new OffscreenCanvas(side, side);
      const context = canvas.getContext('2d')!;
      context.fillStyle = css(ALBEDO);
      context.fillRect(0, 0, side, side);
      return Promise.resolve(canvas.transferToImageBitmap());
    },
    window: () => Promise.reject(new Error('No window of the map is read here.')),
    close: () => undefined,
    reportUnshown: (_file: TFile, error: unknown) => {
      throw error;
    },
    onRestart: () => () => undefined,
  };
}

let manager: PixiAppManager;
let container: HTMLElement;
let ticker: Ticker;
let image: MosaicCanvas;
let time = 0;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  manager = new PixiAppManager(SCREEN, SCREEN);
  await manager.init(container);
  // Only the renders below draw.
  manager.app.ticker.stop();
  ticker = new Ticker();
  image = new MosaicCanvas({
    service: colouredMap(),
    // The camera sees the whole map at its finest level, which the canvas shows at a tenth.
    viewport: { left: 0, top: 0, worldScreenWidth: SIDE, worldScreenHeight: SIDE, scale: { x: 1 }, worldWidth: 0, worldHeight: 0 },
    ticker,
    renderer: manager.app.renderer,
    requestRender: () => undefined,
    drawAtOnce: () => true,
  });
  const world = new Container({ scale: SCALE });
  world.addChild(image.layer);
  manager.app.stage.addChild(world);
});

afterEach(() => {
  image.destroy();
  ticker.destroy();
  manager.destroy();
  container.remove();
});

async function settle(until: () => boolean): Promise<void> {
  for (let step = 0; !until() && step < 1000; step++) {
    ticker.update((time += 16));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(until()).toBe(true);
}

async function showMap(): Promise<void> {
  await image.load({ kind: 'file', file: { path: 'colours.png' } as TFile });
  let ready = false;
  void image.whenCameraReady(20_000).then(() => { ready = true; });
  await settle(() => ready);
  // The tesserae shown before the finest let go once those are opaque: from then on every frame draws the same.
  let frames = 0;
  await settle(() => ++frames > 30);
}

/** The colour the canvas shows at the centre of each tessera, row by row. */
function drawnColours(): number[][] {
  manager.app.render();
  const canvas = manager.getCanvasElement();
  const context = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const side = canvas.width / TESSERAE;
  const colours: number[][] = [];
  for (let row = 0; row < TESSERAE; row++) {
    for (let col = 0; col < TESSERAE; col++) {
      const at = (Math.floor((row + 0.5) * side) * canvas.width + Math.floor((col + 0.5) * side)) * 4;
      colours.push([pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]);
    }
  }
  return colours;
}

function paintedColours(): number[][] {
  const colours: number[][] = [];
  for (let row = 0; row < TESSERAE; row++) for (let col = 0; col < TESSERAE; col++) colours.push(colourOf(col, row));
  return colours;
}

/** The lighting's albedo once the map image has made it. */
async function albedo(): Promise<Texture> {
  let texture = image.albedoTexture();
  await settle(() => (texture ??= image.albedoTexture()) !== null);
  return texture!;
}

/** The mean colour of `texture` as the GPU holds it. */
function meanRgba(texture: Texture): number[] {
  const { pixels } = (manager.app.renderer as WebGLRenderer).extract.pixels(texture);
  const sum = [0, 0, 0, 0];
  for (let i = 0; i < pixels.length; i++) sum[i % 4]! += pixels[i]!;
  return sum.map((channel) => Math.round(channel / (pixels.length / 4)));
}

it('draws every tessera in view again by itself after the graphics process died', async () => {
  await showMap();
  expect(drawnColours()).toEqual(paintedColours());

  await gpu.die(manager.app.renderer as WebGLRenderer);
  ticker.update((time += 16));

  expect(drawnColours()).toEqual(paintedColours());
});

it('gives the lighting an albedo of the map again by itself after the graphics process died', async () => {
  await showMap();
  expect(meanRgba(await albedo())).toEqual([...ALBEDO, 255]);

  await gpu.die(manager.app.renderer as WebGLRenderer);

  expect(meanRgba(await albedo())).toEqual([...ALBEDO, 255]);
});
