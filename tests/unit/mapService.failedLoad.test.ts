import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));

vi.mock('../../src/app/MapController', () => ({
  MapController: { loadAndDisplay: vi.fn().mockRejectedValue(new Error('[MapLoader] Failed to parse map JSON')) },
}));

import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createSceneSource } from '../../src/app/plugin/host/sceneSource';
import { SyncService } from '../../src/app/pixi/token-renderer/SyncService';
import { token } from '../mocks/tokenSyncHarness';
import { MapService } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';

const BROKEN_MAP = 'maps/broken.atlasmap';
const BROKEN_CONTENT = '{"state": {"objects": ';

function setup(renderer: object | null): {
  service: MapService;
  store: ReturnType<typeof createViewAtlasStore>;
  files: Map<string, string>;
  rendererService: RendererService;
} {
  const { app, files } = createInMemoryApp({ files: { [BROKEN_MAP]: BROKEN_CONTENT } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'failed-load-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return {
    service: new MapService(app, new EventEmitter(), store),
    store,
    files,
    rendererService: { getRenderer: () => renderer } as unknown as RendererService,
  };
}

describe('MapService.loadMap failure', () => {
  it('never saves the emptied store over a map that failed to load', async () => {
    const { service, store, files, rendererService } = setup({ clearBackgroundSprite: vi.fn() });

    expect(await service.loadMap(rendererService, BROKEN_MAP)).toBeNull();
    expect(store.getState().mapPath).toBeNull();

    store.getState().setGridVisible(false);
    await store.flushStorage();
    expect(files.get(BROKEN_MAP)).toBe(BROKEN_CONTENT);
  });

  it('keeps the previous map bound when loading fails before the store was switched', async () => {
    const { service, store, rendererService } = setup(null);
    store.setState({ mapPath: 'maps/previous.atlasmap', mapLoaded: true });

    expect(await service.loadMap(rendererService, BROKEN_MAP)).toBeNull();
    expect(store.getState().mapPath).toBe('maps/previous.atlasmap');
  });

  it('takes the tokens of the scene before off the canvas, which waits for the load to end before it follows the store', async () => {
    const { service, store, rendererService } = setup({ clearBackgroundSprite: vi.fn() });
    const previous = { hero: token() };
    store.setState((state) => ({ mapPath: 'maps/previous.atlasmap', mapLoaded: true, objects: { ...state.objects, tokens: previous } }));
    const drawn = vi.fn();
    const sync = new SyncService(
      createSceneSource(store, (state) => ({ tokens: state.objects.tokens, isMapLoading: state.isMapLoading, selectedIds: state.selectedIds })),
      vi.fn(),
      new EventEmitter(),
    );
    sync.setTokensChangedCallback(drawn);
    sync.initialize();
    drawn.mockClear();

    await service.loadMap(rendererService, BROKEN_MAP);

    expect(drawn).toHaveBeenCalledExactlyOnceWith({}, previous);
    sync.destroyAll();
  });

  it('tells the user which scene failed and why, instead of leaving an empty canvas', async () => {
    const { service, rendererService } = setup({ clearBackgroundSprite: vi.fn() });

    await service.loadMap(rendererService, BROKEN_MAP);

    expect(Notice).toHaveBeenCalledWith('Atlas VTT could not open the scene broken (Failed to parse map JSON).', 0);
  });
});
