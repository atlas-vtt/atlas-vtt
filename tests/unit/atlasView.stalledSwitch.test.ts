import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { LatestRequestQueue, STALLED_JOB_MS } from '../../src/app/services/latestRequestQueue';
import type { ViewCamera } from '../../src/app/pixi/viewCamera';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));

const CAVE = new TFile('maps/cave.atlasmap');
const TOWER = new TFile('maps/tower.atlasmap');
const CRYPT = new TFile('maps/crypt.atlasmap');
const files = [CAVE, TOWER, CRYPT];
const CRYPT_CAMERA: ViewCamera = { centerX: 300, centerY: 200, scale: 2 };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('a tab switch whose scene never finishes loading', () => {
  it('lets a later switch to another tab and a tab close through', async () => {
    vi.useFakeTimers();
    const tabMetaStore = createTabMetaStore();
    const [caveId, towerId, cryptId] = files.map((file) => tabMetaStore.getState().addTab(file.path, file.basename));
    tabMetaStore.getState().setActiveTab(caveId!);
    const scene = { mapLoaded: true, isMapLoading: false, mapPath: CAVE.path as string | null };
    // The store and queue side of MapService.loadMap; Tower's file never arrives
    const loads = new LatestRequestQueue();
    const cameras: Array<[string, ViewCamera | undefined]> = [];
    const performSceneLoad = (file: TFile, camera?: ViewCamera): Promise<boolean> => loads.run(async (isSuperseded) => {
      cameras.push([file.path, camera]);
      Object.assign(scene, { mapLoaded: false, isMapLoading: true, mapPath: file.path });
      if (file === TOWER) await new Promise<void>(() => {});
      if (isSuperseded()) return false;
      Object.assign(scene, { mapLoaded: true, isMapLoading: false });
      return true;
    }).then((loaded) => loaded === true);
    const context = {
      tabMetaStore, sceneRequests: 0,
      store: { getState: () => scene },
      flushPendingSaves: vi.fn().mockResolvedValue(undefined),
      temporalCache: new Map(), viewportCache: new Map([[cryptId!, CRYPT_CAMERA]]),
      saveTemporalState: vi.fn(), saveViewportState: vi.fn(),
      restoreTemporalState: vi.fn(),
      performSceneLoad,
      leaf: { detach: vi.fn() },
      app: {
        vault: { getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null },
        workspace: { requestSaveLayout: vi.fn() },
      },
    };
    // Private helpers of the view resolve through its prototype
    Object.setPrototypeOf(context, AtlasView.prototype);
    const view = context as unknown as AtlasView;

    void AtlasView.prototype.switchToTab.call(view, towerId!);
    await vi.advanceTimersByTimeAsync(0);
    expect(tabMetaStore.getState().activeTabId).toBe(towerId);

    let switched = false;
    void AtlasView.prototype.switchToTab.call(view, cryptId!).then(() => { switched = true; });
    await vi.advanceTimersByTimeAsync(STALLED_JOB_MS);

    expect(switched).toBe(true);
    expect(tabMetaStore.getState().activeTabId).toBe(cryptId);
    expect(scene).toEqual({ mapLoaded: true, isMapLoading: false, mapPath: CRYPT.path });
    expect(context.restoreTemporalState).toHaveBeenCalledWith(cryptId);
    expect(cameras).toContainEqual([CRYPT.path, CRYPT_CAMERA]);
    // Only Cave was loaded when it was left; the stalled Tower has nothing to cache
    expect(context.saveViewportState.mock.calls).toEqual([[caveId]]);

    await AtlasView.prototype.closeTab.call(view, towerId!);
    expect(tabMetaStore.getState().tabs.map((tab) => tab.id)).toEqual([caveId, cryptId]);
    expect(tabMetaStore.getState().activeTabId).toBe(cryptId);
  });
});
