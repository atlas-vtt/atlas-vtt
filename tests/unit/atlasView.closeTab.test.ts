// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf, TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { createStore } from 'zustand/vanilla';
import { runUntracked, withHistory } from '../../src/app/stores/history';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));

describe('Atlas scene tab closing', () => {
  it('allows Atlas to manage scene deletion without Obsidian replacing the entire view', () => {
    const view = new AtlasView(new WorkspaceLeaf());
    expect(view.allowNoFile).toBe(true);
  });

  it('loads the adjacent scene after removing the active tab, preserving its cached viewport and history', async () => {
    const tabMetaStore = createTabMetaStore();
    const next = new TFile('maps/next.atlasmap');
    const nextId = tabMetaStore.getState().addTab(next.path, 'Next');
    const closingId = tabMetaStore.getState().addTab('maps/closing.atlasmap', 'Closing');
    const nextCamera = { centerX: 300, centerY: 200, scale: 2 };
    const context = {
      tabMetaStore, sceneRequests: 0,
      store: { getState: () => ({ mapLoaded: true }) },
      flushPendingSaves: vi.fn().mockResolvedValue(undefined),
      temporalCache: new Map(), viewportCache: new Map([[nextId, nextCamera]]),
      saveTemporalState: vi.fn(), saveViewportState: vi.fn(),
      restoreTemporalState: vi.fn(),
      performSceneLoad: vi.fn().mockResolvedValue(true),
      leaf: { detach: vi.fn() },
      app: { vault: { getAbstractFileByPath: () => next }, workspace: { requestSaveLayout: vi.fn() } },
      switchToTab: (id: string): Promise<void> => AtlasView.prototype.switchToTab.call(context as unknown as AtlasView, id),
    };
    Object.setPrototypeOf(context, AtlasView.prototype);
    await AtlasView.prototype.closeTab.call(context as unknown as AtlasView, closingId);
    expect(context.performSceneLoad).toHaveBeenCalledWith(next, nextCamera);
    expect(context.restoreTemporalState).toHaveBeenCalledWith(nextId);
    expect(context.saveTemporalState).not.toHaveBeenCalled();
    expect(context.saveViewportState).not.toHaveBeenCalled();
    expect(context.leaf.detach).not.toHaveBeenCalled();
  });

  it('closes onto the new right-hand neighbor after reordering, with that scene\'s camera and undo history', async () => {
    const tabMetaStore = createTabMetaStore();
    const files = ['Left', 'Closing', 'Old neighbor', 'New neighbor'].map((name) => new TFile(`maps/${name}.atlasmap`));
    const [leftId, closingId, oldId, nextId] = files.map((file) => tabMetaStore.getState().addTab(file.path, file.basename));
    tabMetaStore.getState().setActiveTab(closingId!);
    tabMetaStore.getState().moveTab(nextId!, oldId!);
    const snapshot = (x: number) => ({ objects: { tokens: { marker: { x, y: 0 } } }, grid: null, background: null, widgetValues: {} });
    const nextHistory = { pastStates: [{ before: snapshot(0), after: snapshot(5) }], futureStates: [] };
    const closingHistory = { pastStates: [{ before: snapshot(100), after: snapshot(200) }], futureStates: [] };
    const store = createStore(withHistory(() => ({ ...snapshot(200), mapLoaded: true, isMapLoading: false, mapPath: files[1]!.path })));
    store.temporal.setState(closingHistory);
    const nextCamera = { centerX: 300, centerY: 200, scale: 2 };
    const context = {
      tabMetaStore, store, sceneRequests: 0,
      flushPendingSaves: vi.fn().mockResolvedValue(undefined),
      temporalCache: new Map([[nextId!, nextHistory], [closingId!, closingHistory]]),
      viewportCache: new Map([[nextId!, nextCamera], [closingId!, { centerX: 1, centerY: 2, scale: 1 }]]),
      performSceneLoad: vi.fn(async (file: TFile) => {
        runUntracked(store, () => store.setState({ ...snapshot(5), mapPath: file.path }));
        return true;
      }),
      rememberOpened: vi.fn(),
      leaf: { detach: vi.fn() },
      app: {
        vault: { getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null },
        workspace: { requestSaveLayout: vi.fn() },
      },
    };
    Object.setPrototypeOf(context, AtlasView.prototype);

    await AtlasView.prototype.closeTab.call(context as unknown as AtlasView, closingId!);

    expect(tabMetaStore.getState().tabs.map((tab) => tab.id)).toEqual([leftId, nextId, oldId]);
    expect(tabMetaStore.getState().activeTabId).toBe(nextId);
    expect(context.performSceneLoad).toHaveBeenCalledWith(files[3], nextCamera);
    expect(store.temporal.getState().pastStates).toEqual(nextHistory.pastStates);
    store.temporal.getState().undo();
    expect(store.getState().objects.tokens.marker.x).toBe(0);
    expect(context.temporalCache.has(closingId!)).toBe(false);
    expect(context.viewportCache.has(closingId!)).toBe(false);
    expect(context.leaf.detach).not.toHaveBeenCalled();
  });
});
