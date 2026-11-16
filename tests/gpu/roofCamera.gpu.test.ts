import '../setup/obsidianDom';
import { Rectangle, Ticker, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MosaicCanvasService } from '../../src/app/pixi/mosaicCanvas/MosaicCanvasService';
import { TesseraDecoderClient } from '../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { LEVELS, openLevelsView, worldOf, type LevelsView } from '../helpers/levelsView';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 1024;
const PANE = 512;
const ROOF = 'roof.png';
/** Two roofs of one image: a house in the middle and a barn towards the far corner. */
const BOXES = [[200, 200, 500, 500], [800, 800, 950, 950]] as const;
/** How far from a roof's edge a pixel is not asked about: filtering and the pieces' texels. */
const MARGIN = 4;
const SEVERAL_FLOORS: SceneLevel[] = LEVELS.map((level) => (level.id === 'upper' ? { ...level, foreground: ROOF } : level));
const ONE_FLOOR: SceneLevel[] = [{ ...LEVELS[0]!, background: 'upper.png', foreground: ROOF }];
/** [zoom, x, y]: fitted, panned, zoomed in, far out and panned, where the wrong area was smallest. */
const CAMERAS = [[0.5, 0, 0], [1, -100, -50], [2, -700, -400], [0.25, 100, 60], [0.25, 240, 180], [0.5, 130, 80], [1.5, -300, 10]] as const;

async function roofPng(): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(MAP, MAP);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#00d000';
  for (const [x0, y0, x1, y1] of BOXES) context.fillRect(x0, y0, x1 - x0, y1 - y0);
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
}

function green(pixels: Uint8ClampedArray, offset: number): boolean {
  return pixels[offset + 1]! > Math.max(pixels[offset]!, pixels[offset + 2]!) + 15;
}

function anyGreen(pixels: Uint8ClampedArray): boolean {
  return pixels.some((_, i) => i % 4 === 0 && green(pixels, i));
}

function roofAt(world: { x: number; y: number }, margin: number): boolean {
  return BOXES.some(([x0, y0, x1, y1]) => world.x > x0 + margin && world.x < x1 - margin && world.y > y0 + margin && world.y < y1 - margin);
}

/** Pixels of a picture that break the rule: the roof missing on its own places, or standing anywhere else. */
interface WrongPixels {
  missing: number;
  stray: number;
}

const FINE: WrongPixels = { missing: 0, stray: 0 };

function wrongPixels(pixels: Uint8ClampedArray, side: number, worldAt: (sx: number, sy: number) => { x: number; y: number }): WrongPixels {
  let missing = 0;
  let stray = 0;
  for (let sy = 0; sy < side; sy++) {
    for (let sx = 0; sx < side; sx++) {
      const world = worldAt(sx, sy);
      const drawn = green(pixels, (sy * side + sx) * 4);
      if (!drawn && roofAt(world, MARGIN)) missing++;
      if (drawn && !roofAt(world, -MARGIN)) stray++;
    }
  }
  return { missing, stray };
}

let view: LevelsView | null = null;

afterEach(() => {
  if (view) {
    MosaicCanvasService.release(view.obsApp);
    TesseraDecoderClient.release(view.obsApp);
    view.dispose();
  }
  view = null;
});

/** Opens a scene whose level shows the roof, drawn by the real map image from a real file through the tessera worker. */
async function open(levels: SceneLevel[], lit: boolean, resolution = 1): Promise<LevelsView> {
  const viewedLevel = levels.at(-1)!.id;
  const shown = view = await openLevelsView({ map: MAP, pane: PANE, resolution, roofs: 'vault', levels, viewedLevel });
  const bytes = await roofPng();
  shown.obsApp.vault.readBinary = vi.fn(() => Promise.resolve(bytes.slice(0)));
  await shown.obsApp.vault.create(ROOF, 'x');
  const { store } = shown;
  store.setState({ mapLoaded: true, isMapLoading: false, levels, viewedLevel });
  store.getState().setSceneLighting({ enabled: lit, ambient: 1 });
  await vi.waitFor(() => {
    tick(shown);
    expect(shown.roofs!.covers({ x: 300, y: 300 })).toBe(true);
  }, { timeout: 30_000, interval: 50 });
  return shown;
}

/** One frame of everything that runs on a ticker: the view's, and the shared one the real map image reads its camera on. */
function tick(shown: LevelsView): void {
  shown.displayFrames(1);
  Ticker.shared.update();
}

/** A thumbnail of a square of the map, as `MapThumbnailService` renders it. */
function thumbnail(shown: LevelsView, x: number, y: number, side: number, resolution: number): Uint8ClampedArray {
  const frame = { x, y, resolution, width: side, height: side };
  const renderer = shown.app.renderer as WebGLRenderer;
  const texture = shown.roofs!.renderForFrame(frame, () => shown.controller.renderer.renderForFrame(frame, () => (
    renderer.generateTexture({ target: shown.viewport, frame: new Rectangle(x, y, side, side), resolution })
  )));
  const { pixels } = renderer.extract.pixels(texture);
  const copy = pixels.slice();
  texture.destroy(true);
  return copy;
}

/** The picture `draw` makes through a camera, once its tesserae have arrived and faded in (they do so over real time). */
async function settledWrong(shown: LevelsView, resolution: number, [scale, x, y]: readonly [number, number, number], draw: () => Uint8ClampedArray): Promise<WrongPixels> {
  const side = PANE * resolution;
  const measure = (): WrongPixels => wrongPixels(draw(), side, (sx, sy) => worldOf(sx, sy, resolution, scale, x, y));
  let wrong = measure();
  for (let attempt = 0; attempt < 60 && (wrong.missing > 0 || wrong.stray > 0); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    tick(shown);
    wrong = measure();
  }
  return wrong;
}

describe('a roof drawn from a real image', () => {
  it.each([
    { name: 'one floor, unlit', levels: ONE_FLOOR, lit: false, resolution: 1 },
    { name: 'one floor, lit', levels: ONE_FLOOR, lit: true, resolution: 1 },
    { name: 'two floors, unlit', levels: SEVERAL_FLOORS, lit: false, resolution: 1 },
    { name: 'two floors, lit', levels: SEVERAL_FLOORS, lit: true, resolution: 1 },
    { name: 'one floor, lit, on a Retina screen', levels: ONE_FLOOR, lit: true, resolution: 2 },
  ])('stays on the map under every camera, once the scene has its thumbnail ($name)', async ({ levels, lit, resolution }) => {
    const shown = await open(levels, lit, resolution);
    thumbnail(shown, 0, 0, MAP, 0.25);
    // What makes the area go wrong: PIXI leaves whatever it rendered on its own a render group.
    expect(shown.viewport.renderGroup).toBeTruthy();
    for (const camera of CAMERAS) {
      const [scale, x, y] = camera;
      const gm = await settledWrong(shown, resolution, camera, () => shown.gmCanvas(scale, x, y));
      const players = await settledWrong(shown, resolution, camera, () => shown.playerFrame(scale, x, y));
      expect({ camera, gm, players }).toEqual({ camera, gm: FINE, players: FINE });
    }
  });

  it('shows all of itself in a thumbnail of a part of the map', async () => {
    const shown = await open(ONE_FLOOR, false);
    const [left, side, resolution] = [300, 700, 0.5];
    const across = side * resolution;
    const worldAt = (sx: number, sy: number): { x: number; y: number } => ({ x: left + (sx + 0.5) / resolution, y: left + (sy + 0.5) / resolution });
    await vi.waitFor(() => {
      tick(shown);
      expect(wrongPixels(thumbnail(shown, left, left, side, resolution), across, worldAt)).toEqual(FINE);
    }, { timeout: 30_000, interval: 25 });
  });

  it.each([
    { name: 'one floor, unlit', levels: ONE_FLOOR, lit: false },
    { name: 'two floors, lit', levels: SEVERAL_FLOORS, lit: true },
  ])('is hidden from the GM by Roofs at every zoom and stays in the players\' pictures ($name)', async ({ levels, lit }) => {
    const shown = await open(levels, lit);
    const { store } = shown;
    thumbnail(shown, 0, 0, MAP, 0.25);
    for (const camera of CAMERAS) {
      const [scale, x, y] = camera;
      store.getState().setRoofsHidden(true);
      await shown.settle();
      expect({ camera, drawn: anyGreen(shown.gmCanvas(scale, x, y)) }).toEqual({ camera, drawn: false });
      // A frame for the player window and session view are the players' picture, whatever the GM hides.
      expect({ camera, players: await settledWrong(shown, 1, camera, () => shown.playerFrame(scale, x, y)) }).toEqual({ camera, players: FINE });
      store.setState({ isGMView: false });
      await shown.settle();
      expect({ camera, session: await settledWrong(shown, 1, camera, () => shown.gmCanvas(scale, x, y)) }).toEqual({ camera, session: FINE });
      store.setState({ isGMView: true });
      await shown.settle();
      // A frame or a thumbnail in between leaves the GM's choice as it was.
      thumbnail(shown, 0, 0, MAP, 0.25);
      expect({ camera, drawn: anyGreen(shown.gmCanvas(scale, x, y)) }).toEqual({ camera, drawn: false });
      store.getState().setRoofsHidden(false);
      await shown.settle();
      expect({ camera, gm: await settledWrong(shown, 1, camera, () => shown.gmCanvas(scale, x, y)) }).toEqual({ camera, gm: FINE });
    }
  });
});
