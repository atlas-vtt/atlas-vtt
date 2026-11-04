import React from 'react';
import { EventEmitter } from 'events';
import { act, cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { MainToolbar } from '../../src/app/packages/components/MainToolbar';
import { ToolbarSpaceContext } from '../../src/app/packages/components/toolbar/toolbarSpace';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { UndoRedoControls } from '../../src/app/react/components/UndoRedoControls';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { StoredToolbarLayout } from '../../src/app/toolbar/toolbarLayout';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * The jsdom tests of the toolbar editor share this: MainToolbar in the providers a map view
 * gives it, and the layout jsdom lacks. Each test file still mocks what MainToolbar pulls in
 * but these tests never open (vi.mock only applies in the test file).
 */

export interface ToolbarHarness {
  store: ViewAtlasStore;
  settings: SettingsService;
  bus: EventEmitter;
  workspaceOn: ReturnType<typeof vi.fn>;
  container: HTMLElement;
}

export interface ToolbarHarnessOptions {
  player?: boolean;
  stored?: StoredToolbarLayout;
  /** Room the bottom row gives the bar; null lays nothing out, so nothing overflows. */
  space?: number | null;
  /** The view's note previews, which a drag suspends. */
  notePreviews?: { suspendPreviews: () => void; resumePreviews: () => void };
  /** The bottom row as UIRoot lays it out, the undo/redo bar in its start slot; the row then gives the bar no room limit. */
  undoBar?: boolean;
}

// jsdom lays nothing out: every control of the bar is 40px wide where the bar has room to measure.
const CONTROL_WIDTH = 40;

export function renderToolbar({ player = false, stored = {}, space = null, notePreviews, undoBar = false }: ToolbarHarnessOptions = {}): ToolbarHarness {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  // The palette's first-run tutorial would cover it and take its keys.
  settings.completeTutorial('palette');
  settings.setToolbarLayout(stored);
  const store = createViewAtlasStore(app, `toolbar-editor-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const bus = new EventEmitter();
  const view = {
    viewId: 'view-1',
    getViewType: () => (player ? 'atlas-vtt-player' : 'atlas-vtt'),
    serviceManager: { getEventBus: () => bus, getToolController: () => null, getNotePreviewUIManager: () => notePreviews ?? null, getRendererService: () => null },
    setFogBrushSize: vi.fn(),
    clearAllFog: vi.fn(),
    openSceneBrowser: vi.fn(),
  };
  const ui = { app, view, pixiApp: null, renderer: { getTokenRenderer: () => ({ visibleTokenIds: () => [] }) } } as unknown as AtlasUIContextValue;
  const { container } = render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}>
        <ContextMenuProvider>
          {undoBar ? (
            <BottomToolbarRow start={!player && <UndoRedoControls viewId="view-1" />}>
              <MainToolbar viewId="view-1" />
            </BottomToolbarRow>
          ) : (
            <ToolbarSpaceContext.Provider value={space}>
              <MainToolbar viewId="view-1" />
            </ToolbarSpaceContext.Provider>
          )}
        </ContextMenuProvider>
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { store, settings, bus, workspaceOn: app.workspace.on as ReturnType<typeof vi.fn>, container };
}

export function startEditing({ store }: ToolbarHarness): void {
  act(() => store.getState().setToolbarEditing(true));
}

/** The handle of a control on the bar (the undo/redo bar's own for it), or in the tray. */
export const handle = (container: HTMLElement, id: string, where: 'bar' | 'tray' = 'bar'): HTMLElement => {
  const scope = where === 'tray' ? '.atlas-toolbar-tray' : id === 'undo' ? '.atlas-undo-bar' : '.atlas-main-toolbar';
  const element = container.querySelector<HTMLElement>(`${scope} .atlas-toolbar-handle[data-control="${id}"]`);
  if (!element) throw new Error(`No ${where} handle for ${id}`);
  return element;
};

/** Skipped animations, and the layout the bar measures; call once at the top of a test file. */
export function setUpToolbarTestDom(): void {
  let offsetWidth: PropertyDescriptor | undefined;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.matches('[data-toolbar-item], .atlas-toolbar-overflow, .atlas-toolbar-end') ? CONTROL_WIDTH : 0;
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
  });
}
