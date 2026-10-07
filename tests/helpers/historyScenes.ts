import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { Texture } from 'pixi.js';
import { TFile, TFolder } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { MapLoader } from '../../src/app/MapLoader';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { migrateMapFile, type PersistedMapEnvelope } from '../../src/app/services/MapPersistence';
import { MapService } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';
import { AssetService } from '../../src/app/services/AssetService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, type HistoryState } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * Scenes for the undo history tests on the real view store. A test file that uses the tab
 * scene must mock `../../src/app/MapLoader` (to `{ MapLoader: { load: vi.fn() } }`) and
 * `../../src/app/services/ServiceManager` itself.
 */

type App = ReturnType<typeof createInMemoryApp>['app'];
export type History = () => HistoryState;

export const SCENE = 'atlas-vtt/collections/heist/scenes/Vault.atlasmap';

export function openStore(app: App = createInMemoryApp().app, mapPath = SCENE): { store: ViewAtlasStore; history: History } {
  const store = createViewAtlasStore(app, `history-scene-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath, mapLoaded: true });
  const history = getHistoryStore(store)!;
  return { store, history: () => history.getState() };
}

/** What a view does when a file the map uses is renamed in the vault. */
export function rename(store: ViewAtlasStore, oldPath: string, newPath: string): void {
  const view = {
    store,
    _serviceManager: { getMapService: () => ({ handleFileRenamed: (): void => undefined }) },
    tabMetaStore: { getState: () => ({ getTabByFilePath: (): undefined => undefined }) },
  };
  Object.setPrototypeOf(view, AtlasView.prototype);
  (view as unknown as AtlasView).handleFileRenamed(oldPath, newPath, newPath.split('/').pop()!);
}

export const token = (store: ViewAtlasStore, id: string): Record<string, unknown> => store.getState().objects.tokens[id] as unknown as Record<string, unknown>;

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
/** The D&D 5e darkvision sense, which the cleaned-up collection keeps. */
export const darkvision = senseWithRole(dnd5e.rules.senses!, 'darkvision').id;

/**
 * An open map of the collection `heist`, which defines only the condition `poisoned` and the
 * D&D 5e senses. Token `a` carries `poisoned` and `gone`, darkvision and `home-gone`.
 */
export function collectionScene(): { store: ViewAtlasStore; history: History; app: App; a: string; b: string } {
  const { app } = createInMemoryApp({ files: { [SCENE]: JSON.stringify({ version: 4, state: { objects: { tokens: {} } } }) } });
  const { store, history } = openStore(app);
  const view = Object.assign(Object.create(AtlasView.prototype) as object, { getStore: () => store, saveMap: async (): Promise<void> => undefined });
  app.workspace = { getLeavesOfType: () => [{ view }] } as never;
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionSettings: () => ({ conditions: [{ id: 'poisoned', name: 'Poisoned' }], systemPresetId: dnd5e.id }),
    getCollectionForMap: () => 'heist',
    updateCollectionSettings: async (): Promise<void> => undefined,
  } as never);
  const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png', conditions: ['poisoned', 'gone'], vision: { enabled: true, senses: [{ id: darkvision }, { id: 'home-gone' }] } });
  const b = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/b.png' });
  return { store, history, app, a, b };
}

export const CAVE = 'maps/cave.atlasmap';
export const TOWER = 'maps/tower.atlasmap';

const sceneFile = (path: string, tokens: string[]): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, mapPath: path, background: null,
    grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: Object.fromEntries(tokens.map((id) => [id, { id, kind: 'token', x: 10, y: 20, imagePath: `tokens/${id}.png` }])), fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    camera: { x: 0, y: 0, scale: 1 },
  },
});

export interface TabScene {
  store: ViewAtlasStore;
  files: Map<string, string>;
  app: App;
  /** Loads a map into the view as a tab switch does. */
  load: (path: string) => Promise<void>;
  /** Waits for the map's file to hold what the store holds. */
  save: () => Promise<void>;
  /** Keeps the view's history for the tab, as leaving it does. */
  leave: () => void;
  /** Puts the tab's history back over the freshly loaded scene, as returning to it does. */
  comeBack: () => void;
}

/**
 * One view switching between the tabs of two scenes: `maps/cave.atlasmap` holds tokens `a` and
 * `b` at (10, 20) with art `tokens/<id>.png`, `maps/tower.atlasmap` token `c`. Uses fake timers.
 */
export function tabScene(): TabScene {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { app, files } = createInMemoryApp({ files: { [CAVE]: sceneFile(CAVE, ['a', 'b']), [TOWER]: sceneFile(TOWER, ['c']) } });
  app.vault.getFileByPath = (path) => { const file = app.vault.getAbstractFileByPath(path); return file instanceof TFile ? file : null; };
  app.vault.getFolderByPath = (path) => { const folder = app.vault.getAbstractFileByPath(path); return folder instanceof TFolder ? folder : null; };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    initialize: async (): Promise<void> => undefined, rewriteAssets: async (): Promise<boolean> => false, getAssets: async (): Promise<[]> => [],
    getCollections: async (): Promise<[]> => [], getCollectionForMap: (): null => null, getCollectionSettings: () => ({ conditions: [] }),
  } as never);
  vi.mocked(MapLoader.load).mockImplementation(async (_app, path) => ({
    mapData: migrateMapFile((JSON.parse(files.get(path)!) as PersistedMapEnvelope).state), texture: Texture.WHITE, hasBackground: false, backgroundUrl: null,
  }));
  const store = createViewAtlasStore(app, `tab-cache-${Math.random()}`);
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  const renderer = { clearBackgroundSprite: vi.fn(), setBackgroundSprite: vi.fn(), getGridSystem: () => null, initGrid: vi.fn(), getViewportInstance: () => null, getBackgroundSprite: () => null };
  const rendererService = { getRenderer: () => renderer } as unknown as RendererService;
  const service = new MapService(app, eventBus, store);
  const view = { store, temporalCache: new Map<string, Pick<HistoryState, 'pastStates' | 'futureStates'>>() };
  Object.setPrototypeOf(view, AtlasView.prototype);
  const tabs = view as unknown as { saveTemporalState: (tabId: string) => void; restoreTemporalState: (tabId: string) => void };
  return {
    store,
    files,
    app,
    load: async (path) => {
      await service.loadMap(rendererService, path);
    },
    save: async () => {
      await vi.advanceTimersByTimeAsync(600);
      await store.flushStorage();
    },
    leave: () => tabs.saveTemporalState('cave'),
    comeBack: () => tabs.restoreTemporalState('cave'),
  };
}
