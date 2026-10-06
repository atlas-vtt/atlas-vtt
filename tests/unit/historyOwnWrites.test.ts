import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Texture } from 'pixi.js';
import { AtlasView } from '../../src/app/atlas-view';
import { MapLoader } from '../../src/app/MapLoader';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { migrateMapFile, type PersistedMapEnvelope } from '../../src/app/services/MapPersistence';
import { MapService } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { StatblockTokenSync } from '../../src/app/plugin/StatblockTokenSync';
import { AssetService } from '../../src/app/services/AssetService';
import { removeUndefinedConditions } from '../../src/app/services/collectionConditionCleanup';
import { removeUndefinedSenses } from '../../src/app/services/collectionSenseCleanup';
import { deleteCollectionWidget } from '../../src/app/services/collectionWidgetDeletion';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, type HistoryState } from '../../src/app/stores/history';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import type { CounterWidget } from '../../src/app/types/widgetTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { HP, STRESS } from '../mocks/resourceFixtures';
import { character, statblockFixture } from '../mocks/statblockTokenSync';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/MapLoader', () => ({ MapLoader: { load: vi.fn() } }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const SCENE = 'atlas-vtt/collections/heist/scenes/Vault.atlasmap';

function openStore(app = createInMemoryApp().app, mapPath = SCENE): { store: ViewAtlasStore; history: () => HistoryState } {
  const store = createViewAtlasStore(app, `own-writes-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath, mapLoaded: true });
  const history = getHistoryStore(store)!;
  return { store, history: () => history.getState() };
}

/** What a view does when a file the map uses is renamed in the vault. */
function rename(store: ViewAtlasStore, oldPath: string, newPath: string): void {
  const view = {
    store,
    _serviceManager: { getMapService: () => ({ handleFileRenamed: (): void => undefined }) },
    tabMetaStore: { getState: () => ({ getTabByFilePath: (): undefined => undefined }) },
  };
  Object.setPrototypeOf(view, AtlasView.prototype);
  (view as unknown as AtlasView).handleFileRenamed(oldPath, newPath, newPath.split('/').pop()!);
}

const token = (store: ViewAtlasStore, id: string): Record<string, unknown> => store.getState().objects.tokens[id] as unknown as Record<string, unknown>;

describe('a renamed file that the map uses', () => {
  it('keeps the new path of a token\'s art when another token\'s move is undone and redone', () => {
    const { store, history } = openStore();
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    const b = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/b.png' });
    store.getState().moveToken(a, 70, 0);
    const steps = history().pastStates.length;
    rename(store, 'art/b.png', 'art/b2.png');
    expect(history().pastStates).toHaveLength(steps);
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0 });
    expect(token(store, b)).toMatchObject({ imagePath: 'art/b2.png' });
    history().redo();
    expect(token(store, a)).toMatchObject({ x: 70 });
    expect(token(store, b)).toMatchObject({ imagePath: 'art/b2.png' });
  });

  it('keeps the new path of the map image when an edit of the map\'s objects is undone', () => {
    const { store, history } = openStore();
    store.getState().setBackground('maps/vault.webp');
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    rename(store, 'maps/vault.webp', 'maps/old-vault.webp');
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0 });
    expect(store.getState().background).toBe('maps/old-vault.webp');
  });

  it('keeps a pin on the renamed note when a token\'s move is undone', () => {
    const { store, history } = openStore();
    const pin = store.getState().addNotePin(10, 10, 'notes/Vault.md');
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    rename(store, 'notes/Vault.md', 'notes/The Vault.md');
    history().undo();
    expect(token(store, a)).toMatchObject({ x: 0 });
    expect(store.getState().objects.pins[pin]?.notePath).toBe('notes/The Vault.md');
  });
});

describe('resources Atlas starts by itself', () => {
  it('keeps a statblock\'s missing resources it filled in when another token\'s move is undone', async () => {
    const fixture = statblockFixture();
    const store = createViewAtlasStore(fixture.app, `own-writes-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    let definitions: readonly ResourceDefinition[] = [HP];
    const sync = new StatblockTokenSync(fixture.app, store, fixture.links, () => definitions);
    const history = getHistoryStore(store)!;
    store.getState().addToken(character({ resources: { hp: { current: 2, max: 7 } } }));
    const a = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(a, 70, 0);
    definitions = [HP, STRESS];
    sync.fillMissingResources();
    await vi.waitFor(() => expect(token(store, 'hero')).toMatchObject({ resources: { stress: { current: 0, max: 6 } } }));
    history.getState().undo();
    expect(token(store, a)).toMatchObject({ x: 0 });
    expect(token(store, 'hero')).toMatchObject({ resources: { hp: { current: 2, max: 7 }, stress: { current: 0, max: 6 } } });
    sync.destroy();
  });
});

describe('a collection cleaned up while its map is open', () => {
  const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
  const darkvision = senseWithRole(dnd5e.rules.senses!, 'darkvision').id;

  function cleanupSetup(): { store: ViewAtlasStore; history: () => HistoryState; app: ReturnType<typeof createInMemoryApp>['app']; a: string; b: string } {
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
    store.getState().moveToken(b, 70, 0);
    return { store, history, app, a, b };
  }

  it('keeps conditions it took away when another token\'s move is undone', async () => {
    const { store, history, app, a, b } = cleanupSetup();
    await removeUndefinedConditions(app as never, 'heist');
    expect(token(store, a)).toMatchObject({ conditions: ['poisoned'] });
    history().undo();
    expect(token(store, b)).toMatchObject({ x: 0 });
    expect(token(store, a)).toMatchObject({ conditions: ['poisoned'] });
  });

  it('keeps senses it took away when another token\'s move is undone', async () => {
    const { store, history, app, a, b } = cleanupSetup();
    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);
    expect(token(store, a)).toMatchObject({ vision: { enabled: true, senses: [{ id: darkvision }] } });
    history().undo();
    expect(token(store, b)).toMatchObject({ x: 0 });
    expect(token(store, a)).toMatchObject({ vision: { enabled: true, senses: [{ id: darkvision }] } });
  });
});

describe('widgets kept in step by Atlas', () => {
  const scenePath = 'atlas-vtt/collections/campaign/scenes/cave.atlasmap';
  const fear: CounterWidget = { id: 'fear', type: 'counter', label: 'Fear', icon: 'skull', scope: 'collection', visible: true, visibleToPlayers: true, value: 2, order: 0 };
  const torches: CounterWidget = { ...fear, id: 'torches', label: 'Torches', scope: 'scene', order: 1 };

  function widgetSetup(files: Record<string, string> = {}): { app: ReturnType<typeof createInMemoryApp>['app']; open: (viewId: string) => ViewAtlasStore } {
    const { app } = createInMemoryApp({ files });
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      initialize: () => Promise.resolve(),
      getCollectionForMap: (path: string) => path.match(/collections\/([^/]+)\//)?.[1] ?? null,
      getCollectionSettings: () => ({ conditions: [], widgets: { fear } }),
      updateCollectionSettings: () => Promise.resolve(),
    } as never);
    const sync = new WidgetSyncService({ app } as never);
    const open = (viewId: string): ViewAtlasStore => {
      const store = createViewAtlasStore(app, `${viewId}-${Math.random()}`);
      store.getState().setPersistenceEnabled(false);
      sync.registerStore(viewId, store);
      store.getState().setMapLoading(true);
      store.getState().setMapPath(scenePath);
      store.getState().setMapLoading(false);
      return store;
    };
    return { app, open };
  }

  it('keeps a value mirrored from another view of the scene when this view\'s move is undone', async () => {
    const { open } = widgetSetup();
    const a = open('a');
    const b = open('b');
    await Promise.resolve();
    a.getState().addWidget(torches);
    const piece = b.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    b.getState().moveToken(piece, 70, 0);
    a.getState().setWidgetValue('torches', 3);
    expect(b.getState().widgetValues.torches).toBe(3);
    getHistoryStore(b)!.getState().undo();
    expect(token(b, piece)).toMatchObject({ x: 0 });
    expect(b.getState().widgetValues.torches).toBe(3);
    expect(a.getState().widgetValues.torches).toBe(3);
  });

  it('keeps a deleted collection widget gone when an earlier move is undone', async () => {
    const { app, open } = widgetSetup({ [scenePath]: JSON.stringify({ version: 4, state: { objects: { tokens: {} } } }) });
    const store = open('only');
    await waitFor(() => expect(store.getState().widgetValues.fear).toBe(2));
    const view = Object.assign(Object.create(AtlasView.prototype) as object, { getStore: () => store, saveMap: async (): Promise<void> => undefined });
    app.workspace = { getLeavesOfType: () => [{ view }] } as never;
    const piece = store.getState().addToken({ x: 0, y: 0, imagePath: 'art/a.png' });
    store.getState().moveToken(piece, 70, 0);
    store.setState({ mapLoaded: true });
    await deleteCollectionWidget(app as never, 'campaign', 'fear');
    expect(store.getState().widgetValues.fear).toBeUndefined();
    getHistoryStore(store)!.getState().undo();
    expect(token(store, piece)).toMatchObject({ x: 0 });
    expect(store.getState().widgetValues.fear).toBeUndefined();
    expect(store.getState().widgetSettings.widgets.fear).toBeUndefined();
  });
});

describe('a scene whose file was rewritten while its tab was away', () => {
  const CAVE = 'maps/cave.atlasmap';
  const TOWER = 'maps/tower.atlasmap';
  const sceneFile = (path: string, tokens: string[]): string => JSON.stringify({
    version: 4,
    state: {
      schema: 'atlas-vtt', version: 4, mapPath: path, background: null,
      grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
      objects: { tokens: Object.fromEntries(tokens.map((id) => [id, { id, kind: 'token', x: 10, y: 20, imagePath: `tokens/${id}.png` }])), fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
      camera: { x: 0, y: 0, scale: 1 },
    },
  });

  it('keeps the rewritten path of a token\'s art when the move made before leaving is undone', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { app, files } = createInMemoryApp({ files: { [CAVE]: sceneFile(CAVE, ['a', 'b']), [TOWER]: sceneFile(TOWER, ['c']) } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
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

    await service.loadMap(rendererService, CAVE);
    store.getState().moveToken('a', 80, 20);
    await vi.advanceTimersByTimeAsync(600);
    await store.flushStorage();
    tabs.saveTemporalState('cave');
    await service.loadMap(rendererService, TOWER);
    await new FileReferenceService(app).handleFilesMoved([{ from: 'tokens/b.png', to: 'art/b.png' }]);
    expect(files.get(CAVE)).toContain('art/b.png');
    await service.loadMap(rendererService, CAVE);
    tabs.restoreTemporalState('cave');

    getHistoryStore(store)!.getState().undo();
    expect(token(store, 'a')).toMatchObject({ x: 10 });
    expect(token(store, 'b')).toMatchObject({ imagePath: 'art/b.png' });
  });
});
