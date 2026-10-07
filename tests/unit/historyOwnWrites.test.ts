import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { AtlasView } from '../../src/app/atlas-view';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { StatblockTokenSync } from '../../src/app/plugin/StatblockTokenSync';
import { AssetService } from '../../src/app/services/AssetService';
import { removeUndefinedConditions } from '../../src/app/services/collectionConditionCleanup';
import { removeUndefinedSenses } from '../../src/app/services/collectionSenseCleanup';
import { deleteCollectionWidget } from '../../src/app/services/collectionWidgetDeletion';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import type { CounterWidget } from '../../src/app/types/widgetTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { HP, STRESS } from '../mocks/resourceFixtures';
import { character, statblockFixture } from '../mocks/statblockTokenSync';
import { CAVE, collectionScene, darkvision, openStore, rename, tabScene, token, TOWER } from '../helpers/historyScenes';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/MapLoader', () => ({ MapLoader: { load: vi.fn() } }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
  function cleanupSetup(): ReturnType<typeof collectionScene> {
    const scene = collectionScene();
    scene.store.getState().moveToken(scene.b, 70, 0);
    return scene;
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
  it('keeps the rewritten path of a token\'s art when the move made before leaving is undone', async () => {
    const scene = tabScene();
    await scene.load(CAVE);
    scene.store.getState().moveToken('a', 80, 20);
    await scene.save();
    scene.leave();
    await scene.load(TOWER);
    await new FileReferenceService(scene.app).handleFilesMoved([{ from: 'tokens/b.png', to: 'art/b.png' }]);
    expect(scene.files.get(CAVE)).toContain('art/b.png');
    await scene.load(CAVE);
    scene.comeBack();

    getHistoryStore(scene.store)!.getState().undo();
    expect(token(scene.store, 'a')).toMatchObject({ x: 10 });
    expect(token(scene.store, 'b')).toMatchObject({ imagePath: 'art/b.png' });
  });
});
