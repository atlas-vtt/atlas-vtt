import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice, type App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeMapRenderer, loadedMap, type FakeMapImage } from '../helpers/fakeMapRenderer';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/MapLoader', () => ({ MapLoader: { load: vi.fn() } }));

import { MapLoader, type LoadedMap } from '../../src/app/MapLoader';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';
import { migrateMapFile, type PersistedMapEnvelope } from '../../src/app/services/MapPersistence';
import { STALLED_SAVE_MS } from '../../src/app/services/sceneFileWriter';
import { MAP_IMAGE_READY_MS, MapService, STALLED_LOAD_MS } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';
import { STALLED_JOB_MS } from '../../src/app/services/latestRequestQueue';
import { getHistoryStore } from '../../src/app/stores/history';

const CAVE = 'maps/cave.atlasmap';
const TOWER = 'maps/tower.atlasmap';

function sceneFile(path: string, tokenId: string): string {
  const token = { id: tokenId, kind: 'token', x: 10, y: 20, imagePath: `tokens/${tokenId}.png` };
  const wall = { id: 'wall-1', kind: 'wall', type: 'wall', p1: { x: 0, y: 0 }, p2: { x: 70, y: 0 } };
  return JSON.stringify({
    version: 4,
    state: {
      schema: 'atlas-vtt', version: 4, mapPath: path, background: null,
      grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
      objects: { tokens: { [tokenId]: token }, fog: {}, pins: {}, texts: {}, drawings: {}, walls: { 'wall-1': wall }, lights: {} },
      camera: { x: 0, y: 0, scale: 1 },
    },
  });
}

interface Deferred { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface Harness {
  app: App;
  service: MapService;
  store: ViewAtlasStore;
  files: Map<string, string>;
  eventBus: EventEmitter;
  rendererService: RendererService;
  /** Scenes whose image the renderer was given, in order. */
  shown: string[];
  /** Counts how often the renderer was told to take the map image off the canvas. */
  clearMapImage: ReturnType<typeof vi.fn>;
  /** Holds back reading a scene's file until the returned gate is resolved or rejected. */
  holdBack: (path: string) => Deferred;
  mapImage: FakeMapImage;
}

function setup(): Harness {
  const { app, files } = createInMemoryApp({ files: { [CAVE]: sceneFile(CAVE, 'bat'), [TOWER]: sceneFile(TOWER, 'mage') } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'scene-loads-test');
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());

  const gates = new Map<string, Deferred>();
  const reading: string[] = [];
  vi.mocked(MapLoader.load).mockImplementation(async (_app, path): Promise<LoadedMap> => {
    reading.push(path);
    // The file is read first; the image then takes its time
    const envelope = JSON.parse(files.get(path) ?? '{}') as PersistedMapEnvelope;
    await gates.get(path)?.promise;
    return loadedMap(migrateMapFile(envelope.state));
  });

  const shown: string[] = [];
  const renderer = fakeMapRenderer(() => { shown.push(reading[reading.length - 1] ?? ''); });
  const { clearMapImage } = renderer;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    app,
    service: new MapService(app, eventBus, store),
    store, files, eventBus, shown, clearMapImage, mapImage: renderer.mapImage,
    rendererService: { getRenderer: () => renderer } as unknown as RendererService,
    holdBack: (path) => {
      const gate = deferred();
      gates.set(path, gate);
      return gate;
    },
  };
}

const tokenIds = (state: Pick<ViewAtlasState, 'objects'>): string[] => Object.keys(state.objects.tokens);
const savedState = (files: Map<string, string>, path: string): ViewAtlasState =>
  (JSON.parse(files.get(path) ?? '{}') as { state: ViewAtlasState }).state;

/** Any edit the GM might make after a load; the observed one was the lighting toggle. */
async function editAndSave(store: ViewAtlasStore): Promise<void> {
  store.getState().setSceneLighting({ enabled: true });
  store.getState().setGridVisible(false);
  await vi.advanceTimersByTimeAsync(600);
  await store.flushStorage();
}

/** Makes a store write throw once, as a renderer's subscriber did: the first that changes `select`'s value to one `when` accepts. */
function throwOnChange<T>(store: ViewAtlasStore, select: (state: ViewAtlasState) => T, when: (value: T) => boolean = () => true): void {
  const unsubscribe = store.subscribe(select, (value) => {
    if (!when(value)) return;
    unsubscribe();
    throw new TypeError("Cannot read properties of null (reading 'x')");
  });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('MapService scene loads', () => {
  it('loads a scene and saves later edits to its file', async () => {
    const { service, store, files, rendererService } = setup();

    expect(await service.loadMap(rendererService, CAVE)).not.toBeNull();
    await editAndSave(store);

    expect(store.getState().mapPath).toBe(CAVE);
    expect(tokenIds(savedState(files, CAVE))).toEqual(['bat']);
    expect(savedState(files, CAVE).lighting.enabled).toBe(true);
  });

  it('saves what changed while the scene was loading once it is loaded', async () => {
    const { service, store, files, eventBus, rendererService } = setup();
    eventBus.on('map-loaded', () => store.getState().setGridVisible(false));

    await service.loadMap(rendererService, CAVE);
    await vi.advanceTimersByTimeAsync(600);

    expect(savedState(files, CAVE).grid?.visible).toBe(false);
    expect(tokenIds(savedState(files, CAVE))).toEqual(['bat']);
  });

  describe('when a load fails', () => {
    it('keeps the open scene loaded and saved when the next one fails before the store was switched', async () => {
      const { service, store, files, rendererService } = setup();
      await service.loadMap(rendererService, CAVE);
      const tower = files.get(TOWER);

      expect(await service.loadMap({ getRenderer: () => null } as unknown as RendererService, TOWER)).toBeNull();
      await editAndSave(store);

      expect(store.getState().mapPath).toBe(CAVE);
      expect(store.getState().isMapLoading).toBe(false);
      expect(tokenIds(savedState(files, CAVE))).toEqual(['bat']);
      expect(savedState(files, CAVE).lighting.enabled).toBe(true);
      expect(files.get(TOWER)).toBe(tower);
    });

    it.each<[string, (store: ViewAtlasStore) => void]>([
      ['binds the store to the scene', (store) => throwOnChange(store, (state) => state.mapPath)],
      ['clears the store for the scene', (store) => throwOnChange(store, (state) => state.grid)],
      // Saving is switched off first; it is back on once the scene data was restored
      ['has restored the scene data', (store) => throwOnChange(store, (state) => state.persistenceEnabled, (enabled) => enabled)],
      ['marks the scene as loaded', (store) => throwOnChange(store, (state) => state.mapLoaded, (loaded) => loaded)],
    ])('opens the scene although a store subscriber throws while the load %s', async (_stage, failAtStage) => {
      const { service, store, files, rendererService } = setup();
      await service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(600);
      const cave = files.get(CAVE);
      vi.mocked(Notice).mockClear();

      failAtStage(store);
      expect(await service.loadMap(rendererService, TOWER)).not.toBeNull();
      await editAndSave(store);

      expect(Notice).not.toHaveBeenCalled();
      expect(store.getState().mapPath).toBe(TOWER);
      expect(tokenIds(savedState(files, TOWER))).toEqual(['mage']);
      expect(savedState(files, TOWER).lighting.enabled).toBe(true);
      expect(files.get(CAVE)).toBe(cave);
    });

    it('never saves over the scene when showing it fails after its data was restored', async () => {
      const { service, store, files, eventBus, rendererService } = setup();
      const tower = files.get(TOWER);
      eventBus.on('map-loaded', () => { throw new Error('token renderer failed'); });

      expect(await service.loadMap(rendererService, TOWER)).toBeNull();
      await editAndSave(store);

      expect(store.getState().mapPath).toBeNull();
      expect(files.get(TOWER)).toBe(tower);
    });

    it('takes the image of the scene before it off the canvas, so no map shows without its fog and tokens', async () => {
      const { service, store, rendererService, clearMapImage, holdBack } = setup();
      await service.loadMap(rendererService, CAVE);
      store.getState().setBackground('maps/cave.png');
      holdBack(TOWER).reject(new Error('[MapLoader] Map file not found'));

      expect(await service.loadMap(rendererService, TOWER)).toBeNull();

      expect(store.getState().background).toBeNull();
      expect(clearMapImage).toHaveBeenCalledTimes(1);
      expect(getHistoryStore(store)?.getState().pastStates).toEqual([]);
    });

    it('leaves the image of the open scene when the next one fails before the store was switched', async () => {
      const { service, store, rendererService, clearMapImage } = setup();
      await service.loadMap(rendererService, CAVE);
      store.getState().setBackground('maps/cave.png');

      await service.loadMap({ getRenderer: () => null } as unknown as RendererService, TOWER);

      expect(store.getState().background).toBe('maps/cave.png');
      expect(clearMapImage).not.toHaveBeenCalled();
    });

    it('gives up on a scene that never finishes loading, so the loading overlay does not block the view for good', async () => {
      const { service, store, files, rendererService, holdBack } = setup();
      const tower = files.get(TOWER);
      holdBack(TOWER);

      let result: unknown = 'pending';
      void service.loadMap(rendererService, TOWER).then((map) => { result = map; });
      await vi.advanceTimersByTimeAsync(STALLED_LOAD_MS - 1);
      expect(store.getState().isMapLoading).toBe(true);
      await vi.advanceTimersByTimeAsync(1);

      expect(result).toBeNull();
      expect(Notice).toHaveBeenCalledWith('Atlas VTT could not open the scene tower (The scene took too long to load).', 0);
      expect(store.getState()).toMatchObject({ isMapLoading: false, mapLoaded: false, mapPath: null });

      expect(await service.loadMap(rendererService, CAVE)).not.toBeNull();
      await editAndSave(store);
      expect(tokenIds(savedState(files, CAVE))).toEqual(['bat']);
      expect(files.get(TOWER)).toBe(tower);
    });

    it('lets the GM open a scene again afterwards', async () => {
      const { service, store, files, rendererService, holdBack } = setup();
      holdBack(TOWER).reject(new Error('[MapLoader] Failed to parse map JSON'));
      expect(await service.loadMap(rendererService, TOWER)).toBeNull();

      expect(await service.loadMap(rendererService, CAVE)).not.toBeNull();
      await editAndSave(store);

      expect(tokenIds(store.getState())).toEqual(['bat']);
      expect(tokenIds(savedState(files, CAVE))).toEqual(['bat']);
      expect(savedState(files, CAVE).lighting.enabled).toBe(true);
    });
  });

  describe('when the scene file moves while its image loads', () => {
    it('opens a scene that was renamed meanwhile with everything it holds, and saves it under its new name', async () => {
      const { app, service, store, files, rendererService, holdBack } = setup();
      const renamed = 'maps/keep.atlasmap';
      const image = holdBack(TOWER);

      const opening = service.loadMap(rendererService, TOWER);
      await vi.advanceTimersByTimeAsync(0);
      // What the view does when the vault reports the rename
      await app.vault.rename(app.vault.getFileByPath(TOWER)!, renamed);
      store.getState().setMapPath(renamed);
      service.handleFileRenamed(TOWER, renamed);
      image.resolve();

      expect(await opening).not.toBeNull();
      expect(tokenIds(store.getState())).toEqual(['mage']);
      await editAndSave(store);
      expect(tokenIds(savedState(files, renamed))).toEqual(['mage']);
      expect(files.has(TOWER)).toBe(false);
    });

    it('fails the load of a scene whose file is gone by then, and creates no file in its place', async () => {
      const { service, store, files, rendererService, holdBack } = setup();
      const image = holdBack(TOWER);

      const opening = service.loadMap(rendererService, TOWER);
      await vi.advanceTimersByTimeAsync(0);
      files.delete(TOWER);
      image.resolve();

      expect(await opening).toBeNull();
      expect(Notice).toHaveBeenCalledWith('Atlas VTT could not open the scene tower (The scene file was moved or deleted while it opened).', 0);
      await editAndSave(store);
      expect(store.getState().mapLoaded).toBe(false);
      expect(files.has(TOWER)).toBe(false);
    });
  });

  describe('when a scene is requested while another is loading', () => {
    it.each(['first', 'second'])('shows only the latest one, whichever file is read first (%s)', async (releasedFirst) => {
      const { service, store, files, rendererService, shown, holdBack } = setup();
      const gates = { first: holdBack(CAVE), second: holdBack(TOWER) };
      const cave = files.get(CAVE);

      const restoring = service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(0);
      const opening = service.loadMap(rendererService, TOWER);
      gates[releasedFirst === 'first' ? 'first' : 'second'].resolve();
      await vi.advanceTimersByTimeAsync(0);
      gates.first.resolve();
      gates.second.resolve();

      expect(await restoring).toBeNull();
      expect(await opening).not.toBeNull();
      expect(shown).toEqual([TOWER]);
      expect(store.getState().mapPath).toBe(TOWER);
      expect(tokenIds(store.getState())).toEqual(['mage']);

      await editAndSave(store);
      expect(tokenIds(savedState(files, TOWER))).toEqual(['mage']);
      expect(files.get(CAVE)).toBe(cave);
    });

    it('opens the latest one although the load it replaced fails', async () => {
      const { service, store, files, rendererService, holdBack } = setup();
      const restoringGate = holdBack(CAVE);
      const cave = files.get(CAVE);

      const restoring = service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(0);
      const opening = service.loadMap(rendererService, TOWER);
      await vi.advanceTimersByTimeAsync(0);
      restoringGate.reject(new Error('[MapLoader] Map file not found'));

      expect(await restoring).toBeNull();
      expect(await opening).not.toBeNull();
      expect(store.getState().mapPath).toBe(TOWER);
      expect(tokenIds(store.getState())).toEqual(['mage']);

      await editAndSave(store);
      expect(tokenIds(savedState(files, TOWER))).toEqual(['mage']);
      expect(files.get(CAVE)).toBe(cave);
    });

    it('opens the latest one when the load before it never settles', async () => {
      const { service, store, files, rendererService, shown, holdBack } = setup();
      const cave = files.get(CAVE);
      holdBack(CAVE);

      void service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(0);
      let opened = false;
      const opening = service.loadMap(rendererService, TOWER).then((map) => { opened = map !== null; });
      await vi.advanceTimersByTimeAsync(STALLED_JOB_MS);

      expect(opened).toBe(true);
      await opening;
      expect(shown).toEqual([TOWER]);
      expect(tokenIds(store.getState())).toEqual(['mage']);
      await editAndSave(store);
      expect(tokenIds(savedState(files, TOWER))).toEqual(['mage']);
      expect(files.get(CAVE)).toBe(cave);
    });

    it('opens the next scene and tells the GM when the save of the scene being left cannot finish', async () => {
      const { app, service, store, rendererService } = setup();
      await service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(600);
      vi.spyOn(app.vault, 'process').mockImplementation(() => new Promise<string>(() => {}));
      store.getState().setGridVisible(false);

      let opened = false;
      void service.loadMap(rendererService, TOWER).then((map) => { opened = map !== null; });
      await vi.advanceTimersByTimeAsync(STALLED_SAVE_MS);

      expect(opened).toBe(true);
      expect(tokenIds(store.getState())).toEqual(['mage']);
      expect(Notice).toHaveBeenCalledWith('Atlas VTT could not finish saving cave. Its latest changes may be missing from its file.', 0);
    });

    it('drops what a stalled load reads from its file after the next scene took over', async () => {
      const { app, service, store, files, rendererService } = setup();
      const cave = files.get(CAVE);
      const tower = files.get(TOWER);
      // Cave's file is read by the store once the image is shown; that read hangs
      const read = vi.mocked(app.vault.read).getMockImplementation()!;
      const caveRead = deferred();
      vi.spyOn(app.vault, 'read').mockImplementation(async (file) => {
        if (file.path === CAVE) await caveRead.promise;
        return read(file);
      });

      const stalled = service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(0);
      const opening = service.loadMap(rendererService, TOWER);
      await vi.advanceTimersByTimeAsync(STALLED_JOB_MS);
      expect(await opening).not.toBeNull();
      await vi.advanceTimersByTimeAsync(600);
      const towerSaved = files.get(TOWER);

      caveRead.resolve();
      expect(await stalled).toBeNull();

      expect(store.getState().mapPath).toBe(TOWER);
      expect(store.getState().mapLoaded).toBe(true);
      expect(tokenIds(store.getState())).toEqual(['mage']);
      store.getState().setDMNotePath('notes/tower.md');
      await vi.advanceTimersByTimeAsync(600);
      await store.flushStorage();
      expect(files.get(CAVE)).toBe(cave);
      expect(savedState(files, TOWER)).toMatchObject({ mapPath: TOWER, dmNotePath: 'notes/tower.md' });
      expect(tokenIds(savedState(files, TOWER))).toEqual(['mage']);
      expect(tower && towerSaved).toBeTruthy();
    });

    it('starts no load and shows no notice after the view was closed', async () => {
      const { service, store, rendererService, shown, holdBack } = setup();
      holdBack(CAVE);
      void service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(0);
      const waiting = service.loadMap(rendererService, TOWER);
      vi.mocked(Notice).mockClear();

      service.destroy();
      await vi.advanceTimersByTimeAsync(STALLED_JOB_MS);

      expect(await waiting).toBeNull();
      expect(shown).toEqual([]);
      expect(store.getState().mapPath).toBe(CAVE);
      expect(Notice).not.toHaveBeenCalled();
    });

    it('runs only the latest of several requests', async () => {
      const { service, store, rendererService, shown, holdBack } = setup();
      const gate = holdBack(CAVE);

      const first = service.loadMap(rendererService, CAVE);
      await vi.advanceTimersByTimeAsync(0);
      const second = service.loadMap(rendererService, TOWER);
      const third = service.loadMap(rendererService, CAVE);
      gate.resolve();

      expect(await first).toBeNull();
      expect(await second).toBeNull();
      expect(await third).not.toBeNull();
      expect(shown).toEqual([CAVE]);
      expect(tokenIds(store.getState())).toEqual(['bat']);
    });
  });

  describe('when the map image is still loading its tiles', () => {
    it('keeps the loading screen until the tiles in view are drawn, waiting at most a while', async () => {
      const { service, store, rendererService, mapImage } = setup();
      const tiles = deferred();
      mapImage.whenCameraReady.mockReturnValue(tiles.promise);

      await service.loadMap(rendererService, CAVE);

      expect(mapImage.whenCameraReady).toHaveBeenCalledWith(MAP_IMAGE_READY_MS);
      expect(store.getState().mapLoaded).toBe(true);
      expect(store.getState().isMapLoading).toBe(true);
      tiles.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState().isMapLoading).toBe(false);
    });

    it('waits for the tiles of the camera the scene opens at, not of the fitted map', async () => {
      const { service, rendererService, mapImage } = setup();
      // The viewport places itself by its scale, as pixi-viewport does
      const viewport = {
        screenWidth: 1000, screenHeight: 800, scale: 1, center: { x: 0, y: 0 },
        setZoom(scale: number): void { this.scale = scale; },
        moveCenter(x: number, y: number): void { this.center = { x: x * this.scale, y: y * this.scale }; },
      };
      Object.assign(rendererService.getRenderer()!, { getViewportInstance: () => viewport });
      let waitedFor: { scale: number; center: { x: number; y: number } } | null = null;
      mapImage.whenCameraReady.mockImplementation(() => {
        waitedFor = { scale: viewport.scale, center: { ...viewport.center } };
        return Promise.resolve();
      });

      await service.loadMap(rendererService, CAVE, { centerX: 300, centerY: 200, scale: 2 });

      expect(waitedFor).toEqual({ scale: 2, center: { x: 600, y: 400 } });
    });

    it('leaves the loading screen to the next load when the scene was left meanwhile', async () => {
      const { service, store, rendererService, mapImage } = setup();
      const caveTiles = deferred();
      mapImage.whenCameraReady.mockReturnValueOnce(caveTiles.promise).mockReturnValueOnce(new Promise(() => undefined));

      await service.loadMap(rendererService, CAVE);
      await service.loadMap(rendererService, TOWER);
      caveTiles.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect(store.getState().mapPath).toBe(TOWER);
      expect(store.getState().isMapLoading).toBe(true);
    });
  });
});
