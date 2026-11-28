import { Container, Ticker } from 'pixi.js';
import { vi, type Mock } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { GridOptions } from '../../src/app/grid/GridSystem';
import { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import type { MosaicCanvasOpener } from '../../src/app/pixi/mosaicCanvas/mosaicCanvasTypes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { PLAYER_WINDOW } from '../mocks/playerFrameSource';

/** A map view's renderer as Atlas builds it, over a PIXI renderer that draws nothing, and every render asked of that. */
export interface BareMapView {
  renderer: PixiRendererOrchestrator;
  store: ViewAtlasStore;
  /** Every render of the PIXI renderer: the players' frame, each piece of it through the canvas, the GM's frame. */
  render: Mock;
  destroy(): void;
}

/**
 * Builds the renderer of a map view the way its renderer service does, without WebGL: its PIXI
 * renderer takes every render and draws nothing, so the view's own players' frame runs end to end.
 * With `grid`, the view has its map (an image of no pixels) and the grid over it, and what is drawn with it.
 */
export async function bareMapView(options: { contextLost?: boolean; grid?: GridOptions } = {}): Promise<BareMapView> {
  const render = vi.fn();
  const canvas = document.createElement('canvas');
  canvas.width = PLAYER_WINDOW.width;
  canvas.height = PLAYER_WINDOW.height;
  const pixi = {
    // Only a WebGL renderer can lose its context.
    name: options.contextLost ? 'webgl' : 'canvas',
    gl: { isContextLost: () => options.contextLost === true },
    runners: { contextChange: { add: vi.fn(), remove: vi.fn() } },
    background: { colorRgba: [0, 0, 0, 1] },
    resolution: 1,
    canvas,
    render,
  };
  const viewport = Object.assign(new Container(), {
    plugins: { resume: vi.fn(), pause: vi.fn(), get: () => null },
    screenWidth: 800, screenHeight: 600, left: 0, top: 0, worldScreenWidth: 800, worldScreenHeight: 600, worldWidth: 0, worldHeight: 0,
    moveCenter: vi.fn(),
    dirty: false,
  });
  const app = { renderer: pixi, stage: new Container(), canvas, ticker: new Ticker() };
  const manager = { getApp: () => app, app, getViewport: () => viewport, getGestures: () => null, getCanvasElement: () => canvas, destroy: vi.fn() };
  const obsidian = createInMemoryApp().app;
  const store = createViewAtlasStore(obsidian, `bare-map-view-${Math.random()}`);
  const renderer = new PixiRendererOrchestrator(obsidian, manager as never, new EventEmitter(), store, 'bare-map-view');
  if (options.grid) {
    const opener: MosaicCanvasOpener = { open: vi.fn(), tessera: vi.fn(), overview: vi.fn(), window: vi.fn(), close: vi.fn(), reportUnshown: vi.fn(), onRestart: vi.fn(() => () => undefined) };
    const mapImage = new MosaicCanvas({ service: opener, viewport, ticker: new Ticker(), renderer: null, requestRender: vi.fn() });
    await mapImage.load({ kind: 'none', width: 500, height: 500 });
    renderer.initGrid(options.grid, mapImage);
  }
  return { renderer, store, render, destroy: () => renderer.destroy() };
}
