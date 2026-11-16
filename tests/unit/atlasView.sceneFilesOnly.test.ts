import { describe, expect, it, vi } from 'vitest';
import { Notice, TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));

const SCENE = 'atlas-vtt/collections/default/scenes/Cave.atlasmap';
const IMAGE = 'atlas-vtt/assets/cave.webp';

function viewContext(currentMapFilePath: string | null = null) {
  const setMapLoading = vi.fn();
  const context = {
    tabMetaStore: createTabMetaStore(),
    viewportCache: new Map(),
    currentMapFilePath,
    store: { getState: () => ({ setMapLoading }) },
    flushPendingSaves: vi.fn().mockResolvedValue(undefined),
    performSceneLoad: vi.fn().mockResolvedValue(undefined),
    saveTemporalState: vi.fn(),
    saveViewportState: vi.fn(),
    onLoadFile: vi.fn().mockResolvedValue(undefined),
    _serviceManager: { getRendererService: () => ({ isInitialized: () => true }) },
    app: {
      vault: { getFileByPath: (path: string) => new TFile(path) },
      workspace: { requestSaveLayout: vi.fn() },
    },
  };
  // Private helpers of the view resolve through its prototype
  Object.setPrototypeOf(context, AtlasView.prototype);
  return { context, setMapLoading };
}

describe('Atlas view opens scene files only', () => {
  it('refuses a map image instead of loading it as a scene', async () => {
    const { context, setMapLoading } = viewContext();

    await AtlasView.prototype.onLoadFile.call(context as unknown as AtlasView, new TFile(IMAGE));

    expect(context.performSceneLoad).not.toHaveBeenCalled();
    expect(context.tabMetaStore.getState().tabs).toEqual([]);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining('"cave.webp" is not an Atlas scene'), 5000);
    // The view opened on the image, so its loading overlay must not stay up
    expect(setMapLoading).toHaveBeenCalledWith(false);
  });

  it('leaves a scene that is still loading alone when refusing another file', async () => {
    const { context, setMapLoading } = viewContext(SCENE);

    await AtlasView.prototype.onLoadFile.call(context as unknown as AtlasView, new TFile(IMAGE));

    expect(setMapLoading).not.toHaveBeenCalled();
  });

  it('loads a scene file into a new tab', async () => {
    const { context } = viewContext();

    await AtlasView.prototype.onLoadFile.call(context as unknown as AtlasView, new TFile(SCENE));

    expect(context.performSceneLoad).toHaveBeenCalled();
    expect(context.tabMetaStore.getState().tabs.map((tab) => tab.filePath)).toEqual([SCENE]);
  });

  it('keeps the level an opening asks for until the scene loads', async () => {
    const { context } = viewContext();

    await AtlasView.prototype.setState.call(context as unknown as AtlasView, { file: SCENE, level: 'level_a' }, { history: false });

    expect(context.onLoadFile).toHaveBeenCalledWith(new TFile(SCENE));
    expect((context as unknown as { openingLevel: string | null }).openingLevel).toBe('level_a');
  });

  it('drops restored tabs that point at other files', async () => {
    const { context } = viewContext();
    const state = {
      file: SCENE,
      tabs: [
        { id: 'image', filePath: IMAGE, displayName: 'cave' },
        { id: 'scene', filePath: SCENE, displayName: 'Cave' },
      ],
      activeTabId: 'scene',
    };

    await AtlasView.prototype.setState.call(context as unknown as AtlasView, state, { history: false });

    expect(context.tabMetaStore.getState().tabs.map((tab) => tab.id)).toEqual(['scene']);
  });
});
