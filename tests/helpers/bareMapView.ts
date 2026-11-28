import { Container, Ticker, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { vi, type Mock } from 'vitest';
import type { App } from 'obsidian';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { GridOptions } from '../../src/app/grid/GridSystem';
import { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import type { MosaicCanvasOpener } from '../../src/app/pixi/mosaicCanvas/mosaicCanvasTypes';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { PLAYER_WINDOW } from '../mocks/playerFrameSource';

/** A map view's renderer as Atlas builds it, over a PIXI renderer that draws nothing, and every render asked of that. */
export interface BareMapView {
  renderer: PixiRendererOrchestrator;
  store: ViewAtlasStore;
  events: EventEmitter;
  /** The Obsidian app the view is in. */
  obsidian: App;
  viewport: Viewport;
  /** Every render of the PIXI renderer: the players' frame, each piece of it through the canvas, the GM's frame. */
  render: Mock;
  destroy(): void;
}

export interface BareMapViewOptions {
  contextLost?: boolean;
  /** The view's map (an image of no pixels) and the grid over it, and what is drawn with the grid. */
  grid?: GridOptions;
  /**
   * Every renderer and tool the view builds as it opens (`init`), with `gestures` as its touch
   * gestures. A test file that asks for it mocks `createSceneLighting`, which needs WebGL.
   */
  whole?: { gestures?: unknown };
  /** What the vault holds (`createInMemoryApp`). */
  vault?: Parameters<typeof createInMemoryApp>[0];
  /** What the view's store holds besides its scene as the view opens: a player view (`isPlayerView`) builds no lighting. */
  state?: Partial<ViewAtlasState>;
}

/**
 * Builds the renderer of a map view the way its renderer service does, without WebGL: its PIXI
 * renderer takes every render and draws nothing, so the view's own players' frame runs end to end.
 */
export async function bareMapView(options: BareMapViewOptions = {}): Promise<BareMapView> {
  const restoreGraphics = options.whole ? stubJsdomGraphics() : null;
  if (options.whole) vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
  const render = vi.fn();
  const canvas = document.body.appendChild(document.createElement('canvas'));
  canvas.width = PLAYER_WINDOW.width;
  canvas.height = PLAYER_WINDOW.height;
  const events = { domElement: canvas } as unknown as EventSystem;
  const pixi = {
    // Only a WebGL renderer can lose its context.
    name: options.contextLost ? 'webgl' : 'canvas',
    gl: { isContextLost: () => options.contextLost === true },
    runners: { contextChange: { add: vi.fn(), remove: vi.fn() } },
    background: { color: 0, colorRgba: [0, 0, 0, 1] },
    resolution: 1,
    canvas,
    events,
    render,
  };
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const stage = new Container();
  stage.addChild(viewport);
  const app = { renderer: pixi, stage, canvas, ticker: new Ticker() };
  const manager = { init: vi.fn(), getApp: () => app, app, getViewport: () => viewport, getGestures: () => options.whole?.gestures ?? null, getCanvasElement: () => canvas, destroy: vi.fn() };
  const obsidian = createInMemoryApp(options.vault).app;
  const store = createViewAtlasStore(obsidian, `bare-map-view-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ mapPath: 'maps/bare.atlasmap', mapLoaded: true, isMapLoading: false, isGMView: true, ...options.state });
  const bus = new EventEmitter();
  const renderer = new PixiRendererOrchestrator(obsidian, manager as never, bus, store, 'bare-map-view');
  if (options.whole) await renderer.init(document.createElement('div'));
  const grid = options.grid ?? (options.whole ? { size: 50, enabled: true, color: 0xffffff } : null);
  if (grid) {
    const opener: MosaicCanvasOpener = { open: vi.fn(), tessera: vi.fn(), overview: vi.fn(), window: vi.fn(), close: vi.fn(), reportUnshown: vi.fn(), onRestart: vi.fn(() => () => undefined) };
    const mapImage = new MosaicCanvas({ service: opener, viewport, ticker: new Ticker(), renderer: null, requestRender: vi.fn() });
    await mapImage.load({ kind: 'none', width: 800, height: 600 });
    renderer.initGrid(grid, mapImage);
  }
  return {
    renderer, store, events: bus, obsidian, viewport, render,
    destroy: () => {
      renderer.destroy();
      canvas.remove();
      restoreGraphics?.();
      if (options.whole) vi.unstubAllGlobals();
    },
  };
}
