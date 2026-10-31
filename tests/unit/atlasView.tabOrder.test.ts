import { describe, expect, it, vi } from 'vitest';
import { TFile, type App, type ViewState } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { keepAtlasInMainWindow } from '../../src/app/plugin/atlasMainWindow';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));
vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

function context() {
  const tabMetaStore = createTabMetaStore();
  const ids = ['A', 'B', 'C'].map((name) => tabMetaStore.getState().addTab(`${name}.atlasmap`, name));
  tabMetaStore.getState().setActiveTab(ids[1]!);
  const cameras = new Map([[ids[0]!, { centerX: 10, centerY: 20, scale: 2 }], [ids[1]!, { centerX: 30, centerY: 40, scale: 3 }]]);
  const ctx = {
    tabMetaStore, viewportCache: cameras, temporalCache: new Map([['history', { step: 1 }]]), sceneRequests: 7,
    currentMapFilePath: 'B.atlasmap',
    store: { getState: () => ({ isMapLoading: false }) },
    saveViewportState: vi.fn(), flushPendingSaves: vi.fn(), performSceneLoad: vi.fn(),
    switchToTab: vi.fn(), onOpen: vi.fn().mockResolvedValue(undefined),
    _serviceManager: { getRendererService: () => ({ isInitialized: () => false }) },
    app: { vault: { getFileByPath: (path: string) => new TFile(path) }, workspace: { requestSaveLayout: vi.fn() } },
  };
  Object.setPrototypeOf(ctx, AtlasView.prototype);
  return { ctx, ids, view: ctx as unknown as AtlasView };
}

describe('scene tab order in the workspace', () => {
  it('requests layout save once for an actual move without loading or changing scene caches', () => {
    const { ctx, ids, view } = context();
    const cameras = [...ctx.viewportCache];
    const history = [...ctx.temporalCache];
    expect(view.moveSceneTab(ids[0]!, null)).toBe(true);
    expect(view.moveSceneTab(ids[0]!, null)).toBe(false);
    expect(view.moveSceneTab('closed', null)).toBe(false);
    expect(ctx.app.workspace.requestSaveLayout).toHaveBeenCalledTimes(1);
    expect(ctx.tabMetaStore.getState().activeTabId).toBe(ids[1]);
    expect(ctx.flushPendingSaves).not.toHaveBeenCalled();
    expect(ctx.performSceneLoad).not.toHaveBeenCalled();
    expect(ctx.switchToTab).not.toHaveBeenCalled();
    expect(ctx.viewportCache).toEqual(new Map(cameras));
    expect(ctx.temporalCache).toEqual(new Map(history));
    expect(ctx.sceneRequests).toBe(7);
  });

  it('restores serialized order, active identity and camera associations into an independent view', async () => {
    const first = context();
    first.view.moveSceneTab(first.ids[2]!, first.ids[0]!);
    const saved: unknown = JSON.parse(JSON.stringify(first.view.getState()));
    const second = context();
    second.ctx.viewportCache.clear();
    await second.view.setState(saved, { history: false });
    expect(second.ctx.tabMetaStore.getState().tabs.map((tab) => tab.id)).toEqual([first.ids[2], first.ids[0], first.ids[1]]);
    expect(second.ctx.tabMetaStore.getState().activeTabId).toBe(first.ids[1]);
    expect(second.view.file?.path).toBe('B.atlasmap');
    expect(second.ctx.viewportCache.get(first.ids[0]!)).toEqual({ centerX: 10, centerY: 20, scale: 2 });
    expect(second.ctx.viewportCache.get(first.ids[1]!)).toEqual({ centerX: 30, centerY: 40, scale: 3 });
    expect(second.ctx.onOpen).toHaveBeenCalledOnce();
    second.view.moveSceneTab(first.ids[1]!, first.ids[2]!);
    expect(first.ctx.tabMetaStore.getState().tabs.map((tab) => tab.id)).toEqual([first.ids[2], first.ids[0], first.ids[1]]);
  });

  it('retains reordered tabs and their active scene when a restored popout returns to the main window', async () => {
    const first = context();
    first.view.moveSceneTab(first.ids[2]!, first.ids[0]!);
    const second = context();
    second.ctx.viewportCache.clear();
    const rootSplit = {};
    let type = 'atlas-vtt';
    let restoration: Promise<void> | undefined;
    const target = {
      getContainer: () => rootSplit,
      view: { getViewType: () => 'empty' },
      setViewState: (state: ViewState): Promise<void> => {
        restoration = second.view.setState(state.state, { history: false });
        return restoration;
      },
    };
    const popout = {
      getContainer: () => ({}),
      getViewState: (): ViewState => ({ type, state: first.view.getState() }),
      view: { getViewType: () => type },
      setViewState: async (state: ViewState): Promise<void> => { type = state.type; },
      detach: vi.fn(),
    };
    const app = { workspace: {
      rootSplit,
      getLeavesOfType: () => [popout],
      getMostRecentLeaf: () => target,
      revealLeaf: async (): Promise<void> => undefined,
    } } as unknown as App;

    keepAtlasInMainWindow(app);
    await vi.waitFor(() => expect(restoration).toBeDefined());
    await restoration;

    expect(popout.detach).toHaveBeenCalledOnce();
    expect(second.ctx.tabMetaStore.getState().tabs.map((tab) => tab.id)).toEqual([first.ids[2], first.ids[0], first.ids[1]]);
    expect(second.ctx.tabMetaStore.getState().activeTabId).toBe(first.ids[1]);
    expect(second.view.file?.path).toBe('B.atlasmap');
    expect(second.ctx.viewportCache.get(first.ids[1]!)).toEqual({ centerX: 30, centerY: 40, scale: 3 });
  });
});
