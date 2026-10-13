import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf, TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));

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
});
