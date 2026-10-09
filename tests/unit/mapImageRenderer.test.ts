import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Container, Ticker } from 'pixi.js';
import { TFile } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { MapImage } from '../../src/app/pixi/mapImage/MapImage';
import type { MapImageOpener } from '../../src/app/pixi/mapImage/mapImageTypes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

interface Harness {
  renderer: PixiRendererOrchestrator;
  store: ViewAtlasStore;
  mapImage: MapImage;
  viewport: Container;
  events: EventEmitter;
}

const renderers: PixiRendererOrchestrator[] = [];

/** A renderer without a GPU over a view whose map image is a world rect of `size` (no tiles). */
async function showScene(size = 1400): Promise<Harness> {
  // jsdom has no canvas; the token and text renderers built with the grid only need it for icons
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp({ files: { 'maps/a.png': 'a', 'maps/b.png': 'b' } });
  const store = createViewAtlasStore(app, 'map-image-renderer-test');
  const viewport = Object.assign(new Container(), {
    plugins: { resume: vi.fn(), pause: vi.fn() },
    moveCenter: vi.fn(),
    left: 0, top: 0, worldScreenWidth: 800, worldScreenHeight: 600,
    worldWidth: 0,
    worldHeight: 0,
    dirty: false,
  });
  const manager = {
    init: vi.fn(),
    getViewport: () => viewport,
    getApp: () => ({ renderer: { resolution: 1 } }),
    destroy: vi.fn(),
  };
  const events = new EventEmitter();
  const renderer = new PixiRendererOrchestrator(app, manager as never, events, store, 'map-image-renderer-test');
  vi.spyOn(renderer as never, 'setupRenderersAndManagers').mockImplementation(() => {});
  vi.spyOn(renderer as never, 'setupKeyboardHandlers').mockImplementation(() => {});
  await renderer.init(document.createElement('div'));
  renderers.push(renderer);

  const opener: MapImageOpener = {
    open: vi.fn(),
    tile: vi.fn(),
    overview: vi.fn(),
    close: vi.fn(),
    reportUnshown: vi.fn(),
    onRestart: vi.fn(() => () => undefined),
  };
  const mapImage = new MapImage({ service: opener, viewport, ticker: new Ticker(), renderer: null, requestRender: vi.fn() });
  await mapImage.load({ kind: 'none', width: size, height: size });
  renderer.initGrid({ size: 70, color: 0xffffff, enabled: true }, mapImage);
  return { renderer, store, mapImage, viewport, events };
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  vi.restoreAllMocks();
});

describe('the renderer and its map image', () => {
  it('puts the image under everything, frames the map on it and draws the grid over it', async () => {
    const { renderer, viewport, mapImage } = await showScene();

    expect(viewport.getChildAt(0)).toBe(mapImage.layer);
    expect(renderer.getMapImage()).toBe(mapImage);
    expect(renderer.getMapRect()).toEqual({ x: 0, y: 0, width: 1400, height: 1400 });
    expect(viewport.children.indexOf(renderer.getGridSystem()!.getGridSprite()!)).toBe(1);
  });

  it('tells the fog the world rect of every image it shows', async () => {
    const { mapImage, events } = await showScene();
    const bounds = vi.fn();
    events.on('map-image-updated', bounds);

    await mapImage.load({ kind: 'none', width: 2100, height: 700 });
    mapImage.clear();

    expect(bounds.mock.calls).toEqual([[{ x: 0, y: 0, width: 2100, height: 700 }], [undefined]]);
  });

  it('leaves the map without a grid when the image is taken off, and draws it again on the next', async () => {
    const { renderer, mapImage } = await showScene();

    renderer.clearMapImage();

    expect(renderer.getMapRect()).toBeNull();
    expect(renderer.getGridSystem()?.getGridSprite()).toBeNull();
    expect(() => renderer.toggleGrid(true)).not.toThrow();

    await mapImage.load({ kind: 'none', width: 700, height: 700 });

    expect(renderer.getGridSystem()?.getGridSprite()).not.toBeNull();
    expect(renderer.getMapRect()).toEqual({ x: 0, y: 0, width: 700, height: 700 });
  });

  it('releases the image with the view', async () => {
    const { renderer, mapImage } = await showScene();

    renderer.destroy();
    renderers.splice(renderers.indexOf(renderer), 1);

    expect(mapImage.layer.destroyed).toBe(true);
  });
});

describe('a background that changes outside a load', () => {
  it('loads into the same map image: undo or redo of a background change, a missing image removed', async () => {
    const { store, mapImage } = await showScene();
    store.setState({ mapLoaded: true, isMapLoading: false, persistenceEnabled: false });
    const load = vi.spyOn(mapImage, 'load').mockResolvedValue();

    store.getState().setBackground('maps/b.png');
    store.getState().setBackground(null);

    expect(load).toHaveBeenCalledTimes(2);
    const shown = load.mock.calls[0]?.[0];
    const none = load.mock.calls[1]?.[0];
    expect(shown).toMatchObject({ kind: 'file' });
    expect(shown?.kind === 'file' && shown.file).toBeInstanceOf(TFile);
    expect(shown?.kind === 'file' && shown.file.path).toBe('maps/b.png');
    expect(none).toEqual({ kind: 'none', width: 1400, height: 1400 });
  });

  it('leaves the background a load sets to the load', async () => {
    const { store, mapImage } = await showScene();
    store.setState({ mapLoaded: false, isMapLoading: true, persistenceEnabled: false });
    const load = vi.spyOn(mapImage, 'load').mockResolvedValue();

    store.getState().setBackground('maps/b.png');

    expect(load).not.toHaveBeenCalled();
  });

  it('shows the placeholder for a background whose file is gone', async () => {
    const { store, mapImage } = await showScene();
    store.setState({ mapLoaded: true, isMapLoading: false, persistenceEnabled: false });
    const load = vi.spyOn(mapImage, 'load').mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    store.getState().setBackground('maps/gone.png');

    expect(load).toHaveBeenCalledWith({ kind: 'placeholder' });
  });
});
