// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeMapRenderer, loadedMap } from '../helpers/fakeMapRenderer';

const detect = vi.fn<() => Promise<unknown>>();
vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/MapLoader', () => ({ MapLoader: { load: vi.fn() } }));
vi.mock('../../src/app/pixi/spectralEngine/spectralEngineService', () => ({
  detectGridOfMap: async () => ({ result: await detect(), hits: null }),
}));
vi.mock('../../src/app/pixi/mosaicCanvas/mapProcessing', () => ({
  MapProcessing: { forApp: () => ({ whenDone: () => Promise.resolve() }) },
}));

import { MapLoader, type LoadedMap } from '../../src/app/MapLoader';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { migrateMapFile, type PersistedMapEnvelope } from '../../src/app/services/MapPersistence';
import { MapService } from '../../src/app/services/MapService';
import { newSceneFile } from '../../src/app/services/newSceneFile';
import type { RendererService } from '../../src/app/services/RendererService';
import { getHistoryStore } from '../../src/app/stores/history';
import { readMapStretch } from '../../src/app/grid/mapStretch';
import type { GridState } from '../../src/app/types/gridTypes';

const PLAINS = 'maps/plains.atlasmap';
const TOWER = 'maps/tower.atlasmap';
const HEXES = { gridType: 'hex-vertical', cellSize: 83.2, offsetX: 4, offsetY: 9, confidence: 0.8 };

/** A scene as the New scene dialog writes it; `detectGrid` as the setting for new scenes says. */
function newScene(path: string, detectGrid: boolean): string {
  const content = newSceneFile({ conditions: [] }, path.replace('.atlasmap', '.webp'), detectGrid);
  return JSON.stringify({ ...content, state: { ...content.state, mapPath: path } });
}

interface Harness {
  store: ViewAtlasStore;
  /** Opens the scene at `path` and lets its map be shown. */
  open: (path: string) => Promise<void>;
  /** Lets pending saves reach the files. */
  save: () => Promise<void>;
  /** The grid the scene's file holds. */
  savedGrid: (path: string) => GridState;
}

function setup(): Harness {
  const { app, files } = createInMemoryApp({ files: { [PLAINS]: newScene(PLAINS, true), [TOWER]: newScene(TOWER, false) } });
  const store = createViewAtlasStore(app, 'first-grid-detection-test');
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  vi.mocked(MapLoader.load).mockImplementation(async (_app, path): Promise<LoadedMap> => {
    const envelope = JSON.parse(files.get(path) ?? '{}') as PersistedMapEnvelope;
    return loadedMap(migrateMapFile(envelope.state));
  });
  // Without a viewport no scan shows: the detection writes its answer alone.
  const fake = fakeMapRenderer();
  const mapImage = { ...fake.mapImage, mapStretch: readMapStretch(undefined), setStretch: vi.fn() };
  const renderer = { ...fake, getMapImage: () => mapImage, getCanvasElement: () => null };
  const rendererService = { getRenderer: () => renderer } as unknown as RendererService;
  const service = new MapService(app, eventBus, store);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  const save = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(600);
    await store.flushStorage();
  };
  return {
    store,
    save,
    open: async (path) => {
      expect(await service.loadMap(rendererService, path)).not.toBeNull();
      // The map is revealed, and the search for its grid begins, a few turns after the load.
      await vi.advanceTimersByTimeAsync(0);
    },
    savedGrid: (path) => (JSON.parse(files.get(path) ?? '{}') as { state: { grid: GridState } }).state.grid,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  detect.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the grid of a new scene', () => {
  it('is looked for once: a map without a grid opens quietly from then on', async () => {
    detect.mockResolvedValue(null);
    const { open, save, savedGrid } = setup();

    await open(PLAINS);
    await save();
    expect(detect).toHaveBeenCalledOnce();
    expect(savedGrid(PLAINS)).toMatchObject({ visible: false, snapToGrid: false });
    expect(savedGrid(PLAINS)).not.toHaveProperty('autoDetect');

    await open(TOWER);
    await open(PLAINS);
    expect(detect).toHaveBeenCalledOnce();
  });

  it('is kept once found, and not looked for again', async () => {
    detect.mockResolvedValue(HEXES);
    const { open, save, savedGrid } = setup();

    await open(PLAINS);
    await save();
    expect(savedGrid(PLAINS)).toMatchObject({ type: 'hex-vertical', size: 83.2, visible: true, snapToGrid: true });

    await open(TOWER);
    await open(PLAINS);
    expect(detect).toHaveBeenCalledOnce();
  });

  it('is not looked for again in a scene that was left while its map was searched', async () => {
    // A search of a large map takes a minute and more: the GM opens another scene meanwhile.
    detect.mockReturnValue(new Promise(() => undefined));
    const { open, save, savedGrid } = setup();

    await open(PLAINS);
    expect(detect).toHaveBeenCalledOnce();
    await open(TOWER);
    await save();

    expect(savedGrid(PLAINS)).toMatchObject({ visible: false, snapToGrid: false });
    expect(savedGrid(PLAINS)).not.toHaveProperty('autoDetect');
    await open(PLAINS);
    expect(detect).toHaveBeenCalledOnce();
  });

  it('is not looked for again where the search failed', async () => {
    detect.mockRejectedValue(new Error('the map could not be read'));
    const { open, save, savedGrid } = setup();

    await open(PLAINS);
    await save();
    expect(savedGrid(PLAINS)).toMatchObject({ visible: false, snapToGrid: false });

    await open(TOWER);
    await open(PLAINS);
    expect(detect).toHaveBeenCalledOnce();
  });

  it('writes no step the GM could undo', async () => {
    detect.mockResolvedValue(HEXES);
    const { open, store } = setup();

    await open(PLAINS);

    expect(store.getState().grid).toMatchObject({ type: 'hex-vertical', visible: true });
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });

  it('is never looked for in a scene made for a table that plays without one', async () => {
    const { open } = setup();

    await open(TOWER);

    expect(detect).not.toHaveBeenCalled();
  });
});
