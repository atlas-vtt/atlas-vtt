import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));

const CAVE = new TFile('maps/cave.atlasmap');
const TOWER = new TFile('maps/tower.atlasmap');
const TOWER_CAMERA = { centerX: 300, centerY: 200, scale: 2 };

function setup(options: { sceneLoads: boolean; mapLoaded: boolean; isMapLoading?: boolean }) {
  const tabMetaStore = createTabMetaStore();
  const caveId = tabMetaStore.getState().addTab(CAVE.path, 'Cave');
  const towerId = tabMetaStore.getState().addTab(TOWER.path, 'Tower');
  tabMetaStore.getState().setActiveTab(caveId);
  const context = {
    tabMetaStore, sceneRequests: 0,
    // Cave is the active tab; its scene is in the store when one is loaded
    store: { getState: () => ({
      mapLoaded: options.mapLoaded, isMapLoading: options.isMapLoading ?? false, mapPath: options.mapLoaded ? CAVE.path : null,
    }) },
    _serviceManager: { getMapService: () => ({ suspendForRewrite: vi.fn() }) },
    flushPendingSaves: vi.fn().mockResolvedValue(undefined),
    saveTemporalState: vi.fn(), saveViewportState: vi.fn(),
    restoreTemporalState: vi.fn(),
    viewportCache: new Map([[towerId, TOWER_CAMERA]]),
    performSceneLoad: vi.fn().mockResolvedValue(options.sceneLoads),
    app: {
      vault: { getAbstractFileByPath: (path: string) => (path === CAVE.path ? CAVE : TOWER) },
      workspace: { requestSaveLayout: vi.fn() },
    },
  };
  Object.setPrototypeOf(context, AtlasView.prototype);
  const switchToTab = (id: string): Promise<void> => AtlasView.prototype.switchToTab.call(context as unknown as AtlasView, id);
  return { context, switchToTab, caveId, towerId };
}

describe('switching scene tabs around a load that did not finish', () => {
  it('loads a tab\'s scene at the camera it was left with and restores its history', async () => {
    const { context, switchToTab, caveId, towerId } = setup({ sceneLoads: true, mapLoaded: true });

    await switchToTab(towerId);

    expect(context.saveViewportState).toHaveBeenCalledWith(caveId);
    expect(context.performSceneLoad).toHaveBeenCalledWith(TOWER, TOWER_CAMERA);
    expect(context.restoreTemporalState).toHaveBeenCalledWith(towerId);
  });

  it('opens the active tab\'s scene at the camera it is given, as the view does on opening', async () => {
    const { context } = setup({ sceneLoads: true, mapLoaded: false });
    const camera = { centerX: 10, centerY: 20, scale: 0.5 };

    await AtlasView.prototype.onLoadFile.call(context as unknown as AtlasView, CAVE, camera);

    expect(context.performSceneLoad).toHaveBeenCalledWith(CAVE, camera);
  });

  it('does not apply a tab\'s history when its scene failed to load or was replaced', async () => {
    const { context, switchToTab, towerId } = setup({ sceneLoads: false, mapLoaded: true });

    await switchToTab(towerId);

    expect(context.performSceneLoad).toHaveBeenCalledWith(TOWER, TOWER_CAMERA);
    expect(context.restoreTemporalState).not.toHaveBeenCalled();
  });

  it('keeps the cached history and viewport of a tab whose scene is not loaded', async () => {
    const { context, switchToTab, towerId } = setup({ sceneLoads: true, mapLoaded: false });

    await switchToTab(towerId);

    expect(context.saveTemporalState).not.toHaveBeenCalled();
    expect(context.saveViewportState).not.toHaveBeenCalled();
    expect(context.performSceneLoad).toHaveBeenCalledWith(TOWER, TOWER_CAMERA);
  });

  it('loads the active tab again when its scene failed to load', async () => {
    const { context, switchToTab, caveId } = setup({ sceneLoads: true, mapLoaded: false });

    await switchToTab(caveId);

    expect(context.performSceneLoad).toHaveBeenCalledWith(CAVE, undefined);
  });

  it.each([
    ['loaded', { mapLoaded: true }],
    ['still loading', { mapLoaded: false, isMapLoading: true }],
  ])('leaves the active tab alone while its scene is %s', async (_label, sceneState) => {
    const { context, switchToTab, caveId } = setup({ sceneLoads: true, ...sceneState });

    await switchToTab(caveId);

    expect(context.performSceneLoad).not.toHaveBeenCalled();
  });

  it('goes back to the tab of the scene still open when the next one fails before the store was switched', async () => {
    const { context, switchToTab, caveId, towerId } = setup({ sceneLoads: false, mapLoaded: true });

    await switchToTab(towerId);

    expect(context.tabMetaStore.getState().activeTabId).toBe(caveId);
    expect((context as { file?: TFile }).file).toBe(CAVE);

    await switchToTab(towerId);
    expect(context.performSceneLoad).toHaveBeenCalledTimes(2);
  });

  it('loads a tab that is marked active while the store still holds another scene', async () => {
    const { context, switchToTab, towerId } = setup({ sceneLoads: true, mapLoaded: true });
    context.tabMetaStore.getState().setActiveTab(towerId);

    await switchToTab(towerId);

    expect(context.performSceneLoad).toHaveBeenCalledWith(TOWER, TOWER_CAMERA);
  });

  it('reloads the scene the store holds, not the file of a tab that failed to open', async () => {
    const { context } = setup({ sceneLoads: true, mapLoaded: true });
    Object.assign(context, { file: TOWER });
    const rewrite = vi.fn().mockResolvedValue(undefined);

    await AtlasView.prototype.reloadActiveScene.call(context as unknown as AtlasView, rewrite);

    expect(rewrite).toHaveBeenCalledWith(CAVE);
    expect(context.performSceneLoad).toHaveBeenCalledWith(CAVE, undefined);
  });
});
