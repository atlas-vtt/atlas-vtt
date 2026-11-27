import { vi } from 'vitest';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeMapRenderer } from './fakeMapRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { MapService } from '../../src/app/services/MapService';
import type { RendererService } from '../../src/app/services/RendererService';

/** A view store bound to an in-memory vault, loading and saving scene files as a view does. */
export interface SceneFileHarness {
  store: ViewAtlasStore;
  files: Map<string, string>;
  /** Loads the scene at `path` through `MapService`, as opening it in a view does. */
  open(path: string): Promise<void>;
  /** Lets the debounced save of the store's last write reach the file. */
  save(): Promise<void>;
}

/**
 * A view over `files`. Needs fake timers (the save is debounced) and jsdom; stubs the canvas
 * the map image would be drawn on.
 */
export function sceneFileHarness(files: Record<string, string>, viewId = 'scene-file-harness'): SceneFileHarness {
  const { app, files: vault } = createInMemoryApp({ files });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, viewId);
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  const renderer = fakeMapRenderer(() => undefined);
  const rendererService = { getRenderer: () => renderer } as unknown as RendererService;
  const service = new MapService(app, eventBus, store);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return {
    store,
    files: vault,
    open: async (path) => {
      if (!(await service.loadMap(rendererService, path))) throw new Error(`${path} did not load`);
    },
    save: async () => {
      await vi.advanceTimersByTimeAsync(600);
      await store.flushStorage();
    },
  };
}
