// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Ticker, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import type { MosaicCanvasOpener } from '../../src/app/pixi/mosaicCanvas/mosaicCanvasTypes';
import { mapFit } from '../../src/app/pixi/fitMapRect';
import { MAX_ZOOM, MIN_ZOOM } from '../../src/app/pixi/zoomRange';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { leastZoom } from '../helpers/zoomLimits';

const opener: MosaicCanvasOpener = {
  open: vi.fn(),
  tessera: vi.fn(),
  overview: vi.fn(),
  window: vi.fn(),
  close: vi.fn(),
  reportUnshown: vi.fn(),
  onRestart: vi.fn(() => () => undefined),
};

vi.mock('../../src/app/MapLoader', () => ({
  MapLoader: { load: vi.fn() },
  mapImageSourceFor: vi.fn(),
}));
vi.mock('../../src/app/pixi/mosaicCanvas/MosaicCanvasService', () => ({ MosaicCanvasService: { forApp: () => opener } }));
vi.mock('../../src/app/pixi/mosaicCanvas/video/vaultMapVideos', () => ({ vaultMapVideos: () => undefined }));

import { MapController } from '../../src/app/MapController';
import { MapLoader } from '../../src/app/MapLoader';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';

const SCREEN = { screenWidth: 800, screenHeight: 600 };
const renderers: PixiRendererOrchestrator[] = [];
const viewports: Viewport[] = [];

interface Shown {
  viewport: Viewport;
  mapImage: MosaicCanvas;
}

/** A renderer without a GPU that has loaded a scene whose map is `width` × `height`, as a view does. */
async function loadScene(width: number, height: number, camera: Parameters<typeof MapController.loadAndDisplay>[3] = null): Promise<Shown> {
  // jsdom has no canvas; the renderers built with the grid only need it for icons
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'map-zoom-range-test');
  const viewport = new Viewport({ ...SCREEN, noTicker: true, events: { domElement: createEl('canvas') } as EventSystem });
  viewport.clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });
  viewports.push(viewport);
  const ticker = new Ticker();
  const manager = {
    init: vi.fn(),
    getViewport: () => viewport,
    getApp: () => ({ renderer: null, canvas: document.createElement('canvas'), ticker }),
    destroy: vi.fn(),
  };
  const renderer = new PixiRendererOrchestrator(app, manager as never, new EventEmitter(), store, 'map-zoom-range-test');
  vi.spyOn(renderer as never, 'setupRenderersAndManagers').mockImplementation(() => {});
  vi.spyOn(renderer as never, 'setupKeyboardHandlers').mockImplementation(() => {});
  await renderer.init(document.createElement('div'));
  renderers.push(renderer);

  vi.mocked(MapLoader.load).mockResolvedValue({ mapData: { grid: { size: 70 } }, image: { kind: 'none', width, height }, level: null } as never);
  await MapController.loadAndDisplay(app, renderer, 'maps/a.atlasmap', camera);
  return { viewport, mapImage: renderer.getMapImage()! };
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  viewports.splice(0).forEach(viewport => viewport.destroy());
  vi.restoreAllMocks();
});

describe('the zoom range of a view whose map image changes outside a load', () => {
  const huge = { x: 0, y: 0, width: 20000, height: 15000 };

  it('opens for a larger image shown in the same place: another level, a changed background', async () => {
    const { viewport, mapImage } = await loadScene(1400, 1400);
    expect(leastZoom(viewport)).toBe(MIN_ZOOM);

    // As a switch of level or a background's change loads the next image into the view's map image
    await mapImage.load({ kind: 'none', width: huge.width, height: huge.height });

    expect(leastZoom(viewport)).toBeCloseTo(mapFit(SCREEN, huge).scale, 10);
    expect(Number(leastZoom(viewport)) * huge.width).toBeLessThanOrEqual(SCREEN.screenWidth);
  });

  it('opens for a scene shown through its tab\'s camera too', async () => {
    const { viewport, mapImage } = await loadScene(1400, 1400, { centerX: 700, centerY: 700, scale: 1 });

    await mapImage.load({ kind: 'none', width: huge.width, height: huge.height });

    expect(viewport.scale.x).toBe(1);
    expect(leastZoom(viewport)).toBeCloseTo(mapFit(SCREEN, huge).scale, 10);
  });

  it('goes back to the usual least zoom for a smaller image after a larger one', async () => {
    const { viewport, mapImage } = await loadScene(huge.width, huge.height);
    expect(leastZoom(viewport)).toBeCloseTo(mapFit(SCREEN, huge).scale, 10);

    await mapImage.load({ kind: 'none', width: 1400, height: 1400 });

    expect(leastZoom(viewport)).toBe(MIN_ZOOM);
  });

  it('follows a map drawn with a stretch', async () => {
    const { viewport, mapImage } = await loadScene(huge.width, huge.height);

    mapImage.setStretch({ x: 1, y: 1.25 });

    expect(leastZoom(viewport)).toBeCloseTo(mapFit(SCREEN, { ...huge, height: huge.height * 1.25 }).scale, 10);
  });

  it('keeps the range while the image is taken off', async () => {
    const { viewport, mapImage } = await loadScene(huge.width, huge.height);
    const least = leastZoom(viewport);

    mapImage.clear();

    expect(leastZoom(viewport)).toBe(least);
  });
});
