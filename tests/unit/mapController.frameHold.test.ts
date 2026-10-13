import { describe, expect, it, vi } from 'vitest';
import { Ticker } from 'pixi.js';
import type { App } from 'obsidian';
import type { MapImageDeps } from '../../src/app/pixi/mapImage/mapImageTypes';

const made: MapImageDeps[] = [];

vi.mock('../../src/app/MapLoader', () => ({
  MapLoader: { load: vi.fn().mockResolvedValue({ mapData: { grid: { size: 70 } }, image: { kind: 'none' } }) },
  mapImageSourceFor: vi.fn(),
}));
vi.mock('../../src/app/pixi/mapImage/MapImageService', () => ({ MapImageService: { forApp: () => ({}) } }));
vi.mock('../../src/app/pixi/mapImage/MapImage', () => ({
  MapImage: class {
    readonly worldRect = null;
    constructor(readonly deps: MapImageDeps) { made.push(deps); }
    load(): Promise<void> { return Promise.resolve(); }
  },
}));

import { MapController } from '../../src/app/MapController';

/** A view whose app is stopped, as `bindMapLoadingFrameHold` stops it while a load holds the last frame. */
function heldView(): Parameters<typeof MapController.loadAndDisplay>[1] {
  let mapImage: unknown = null;
  const app = { ticker: { started: false }, renderer: { resolution: 1 }, canvas: document.createElement('canvas') };
  return {
    getMapImage: () => mapImage,
    setMapImage: (image: unknown) => { mapImage = image; },
    getAppInstance: () => app,
    getViewportInstance: () => ({}),
    getGridSystem: () => null,
    initGrid: vi.fn(),
  } as unknown as Parameters<typeof MapController.loadAndDisplay>[1];
}

describe('MapController: the map image while a load holds the frame', () => {
  it('runs the tiles on a ticker the hold does not stop, and draws them without a fade', async () => {
    const view = heldView();
    await MapController.loadAndDisplay({} as App, view, 'maps/a.atlasmap');

    const deps = made[0];
    expect(deps.ticker).toBe(Ticker.shared);
    expect(deps.ticker).not.toBe(view.getAppInstance().ticker);
    expect(deps.drawAtOnce?.()).toBe(true);

    (view.getAppInstance().ticker as { started: boolean }).started = true;
    expect(deps.drawAtOnce?.()).toBe(false);
  });
});
