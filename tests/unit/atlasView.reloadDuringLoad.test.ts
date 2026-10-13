import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeMapRenderer, loadedMap } from '../helpers/fakeMapRenderer';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/MapLoader', () => ({ MapLoader: { load: vi.fn() } }));

import { AtlasView } from '../../src/app/atlas-view';
import { MapLoader, type LoadedMap } from '../../src/app/MapLoader';
import { migrateMapFile, type PersistedMapEnvelope } from '../../src/app/services/MapPersistence';
import { MapService } from '../../src/app/services/MapService';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

const TOWER = 'maps/tower.atlasmap';

const sceneFile = (tokenId: string): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, mapPath: TOWER, background: null, grid: null,
    objects: { tokens: { [tokenId]: { id: tokenId, kind: 'token', x: 0, y: 0, imagePath: `tokens/${tokenId}.png` } }, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    camera: { x: 0, y: 0, scale: 1 },
  },
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

interface Harness {
  files: Map<string, string>;
  store: ReturnType<typeof createViewAtlasStore>;
  eventBus: EventEmitter;
  view: AtlasView;
  load: () => Promise<boolean>;
  releaseFirstImage: () => void;
}

/** A view over the scene at TOWER whose first load waits for its image until released, unless `holdImage` is off. */
function harness(holdImage: boolean): Harness {
  const { app, files } = createInMemoryApp({ files: { [TOWER]: sceneFile('mage') } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const store = createViewAtlasStore(app, 'reload-during-load-test');
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  let releaseImage: (() => void) | null = holdImage ? null : () => undefined;
  vi.mocked(MapLoader.load).mockImplementation(async (_app, path): Promise<LoadedMap> => {
    const envelope = JSON.parse(files.get(path) ?? '{}') as PersistedMapEnvelope;
    if (!releaseImage) await new Promise<void>((resolve) => { releaseImage = resolve; });
    return loadedMap(migrateMapFile(envelope.state));
  });
  const renderer = fakeMapRenderer();
  const rendererService = { getRenderer: () => renderer, isInitialized: () => true, getViewport: () => null };
  const mapService = new MapService(app, eventBus, store);
  const tabMetaStore = createTabMetaStore();
  tabMetaStore.getState().setActiveTab(tabMetaStore.getState().addTab(TOWER, 'Tower'));
  const view = Object.assign(Object.create(AtlasView.prototype) as AtlasView, {
    app, store, tabMetaStore, sceneRequests: 0, file: new TFile(TOWER),
    temporalCache: new Map(), viewportCache: new Map(),
    _serviceManager: { getMapService: () => mapService, getRendererService: () => rendererService, flushSceneThumbnail: vi.fn() },
  });
  const viewInternals = view as unknown as { performSceneLoad(file: TFile): Promise<boolean> };
  return {
    files, store, eventBus, view,
    load: () => viewInternals.performSceneLoad(new TFile(TOWER)),
    releaseFirstImage: () => releaseImage?.(),
  };
}

const savedTokens = (files: Map<string, string>): string[] =>
  Object.keys((JSON.parse(files.get(TOWER) ?? '{}') as { state: ViewAtlasState }).state.objects.tokens);

describe('reloading a scene while it is still loading', () => {
  it('keeps the rewritten file: the load that was running must not save its old state over it', async () => {
    const { files, store, view, load, releaseFirstImage } = harness(true);

    const opening = load();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().mapPath).toBe(TOWER);

    // A transfer rewrites the scene; meanwhile the image of the first load arrives
    const reloading = view.reloadActiveScene(async () => {
      releaseFirstImage();
      await vi.advanceTimersByTimeAsync(0);
      files.set(TOWER, sceneFile('dragon'));
    });
    await vi.advanceTimersByTimeAsync(600);
    await reloading;
    await opening;
    await vi.advanceTimersByTimeAsync(600);
    await store.flushStorage();

    expect(savedTokens(files)).toEqual(['dragon']);
    expect(Object.keys(store.getState().objects.tokens)).toEqual(['dragon']);
    expect(store.getState().mapLoaded).toBe(true);
  });
});

describe('reloading a loaded scene', () => {
  it('keeps the rewritten file though the scene saved something on its way out', async () => {
    const { files, store, eventBus, view, load } = harness(false);
    await load();
    expect(store.getState().mapLoaded).toBe(true);
    // As the lighting does: the unloading scene saves its pending explored memory
    eventBus.on('map-unloading', () => store.setState({ exploredMask: 'data:image/png;base64,AAAA' } as Partial<ViewAtlasState>));

    await view.reloadActiveScene(async () => { files.set(TOWER, sceneFile('dragon')); });
    await vi.advanceTimersByTimeAsync(600);
    await store.flushStorage();

    expect(savedTokens(files)).toEqual(['dragon']);
    expect(Object.keys(store.getState().objects.tokens)).toEqual(['dragon']);
  });
});
