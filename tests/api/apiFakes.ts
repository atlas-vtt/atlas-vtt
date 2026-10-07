import type { App } from 'obsidian';
import type AtlasVTTPlugin from '../../main';
import type { ApiServices } from '../../src/api/services';
import { ApiEvents } from '../../src/api/events';
import type { ConnectingPlugin } from '../../src/api/types/api';
import { ViewTracker, type TrackedMapView } from '../../src/api/viewTracker';
import type { SettingsService } from '../../src/app/services/SettingsService';
import type { LaserHub } from '../../src/app/pixi/laser/LaserHub';
import type { CameraViewport } from '../../src/app/services/presentedCamera';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

export interface FakePlugin extends ConnectingPlugin {
  /** Runs what `register` was given, as Obsidian does when a plugin unloads. */
  unload(): void;
}

export function fakePlugin(id: string): FakePlugin {
  const cleanups: Array<() => void> = [];
  return {
    manifest: { id, name: id, version: '1.0.0', minAppVersion: '1.8.7', author: 'test', description: '' },
    register: (cleanup: () => void): void => { cleanups.push(cleanup); },
    unload: (): void => { for (const cleanup of cleanups.splice(0)) cleanup(); },
  } as FakePlugin;
}

export interface FakeWorkspaceApp { app: App; triggered: Array<{ name: string; data: unknown[] }> }

export function fakeApp(): FakeWorkspaceApp {
  const triggered: Array<{ name: string; data: unknown[] }> = [];
  const workspace = {
    trigger: (name: string, ...data: unknown[]): void => { triggered.push({ name, data }); },
    on: (): object => ({}),
    offref: (): void => undefined,
    getLeavesOfType: (): unknown[] => [],
    getActiveViewOfType: (): null => null,
  };
  const app = { workspace } as unknown as App;
  return { app, triggered };
}

/** The services every facade is built with; later groups add their fields here as they land. */
export function fakeServices(app: App): ApiServices {
  return {
    app, plugin: {} as unknown as AtlasVTTPlugin, views: {} as unknown as ViewTracker, settings: {} as unknown as SettingsService,
  };
}

export interface FakeView extends TrackedMapView {
  close(): void;
}

export interface FakeViewOptions {
  viewport?: CameraViewport | null;
  /** The view's lasers; without one the renderer has none. */
  laserHub?: LaserHub;
}

/** A map view with a real store and tab meta, a 1000 x 500 background and no viewport unless `options` gives one; `close()` runs what `register` was given; `switchToTab` activates the tab and loads its map. */
export function fakeView(viewId: string, options: FakeViewOptions = {}): FakeView {
  const { viewport = null, laserHub } = options;
  const { app } = createInMemoryApp();
  const closers: Array<() => void> = [];
  let closed = false;
  const tabs = createTabMetaStore();
  const tabId = tabs.getState().addTab('maps/a.atlasmap', 'A');
  tabs.getState().setActiveTab(tabId);
  const view: FakeView = {
    viewId, atlasStore: createViewAtlasStore(app, viewId), tabMetaStore: tabs,
    renderer: {
      getBackgroundSprite: () => ({ width: 1000, height: 500, destroyed: false }), getViewportInstance: () => viewport,
      ...(laserHub ? { getLaserHub: () => laserHub } : {}),
    },
    get isClosed(): boolean { return closed; },
    register: (callback: () => void): void => { closers.push(callback); },
    switchToTab: (tabId: string): Promise<void> => {
      tabs.getState().setActiveTab(tabId);
      loadMap(view);
      return Promise.resolve();
    },
    close: (): void => { closed = true; for (const callback of closers.splice(0)) callback(); },
  };
  return view;
}

/** An app whose workspace holds `views` (open ones only) and reports `active()` as the active view; `layoutChanged()` fires `layout-change`. */
export function workspaceWith(views: FakeView[], active: () => FakeView | null = () => null): { app: App; layoutChanged(): void } {
  let onLayout: () => void = () => undefined;
  const app = {
    workspace: {
      getLeavesOfType: () => views.filter((view) => !view.isClosed).map((view) => ({ view })),
      getActiveViewOfType: () => active(),
      on: (_name: string, callback: () => void) => { onLayout = callback; return {}; },
      offref: () => undefined,
    },
  } as unknown as App;
  return { app, layoutChanged: () => onLayout() };
}

/** A started tracker over `views` (fake views are recognised by their store), plus the events it emits to. */
export function trackerWith(views: FakeView[], active: () => FakeView | null = () => null): { tracker: ViewTracker; events: ApiEvents; layoutChanged(): void } {
  const { app, layoutChanged } = workspaceWith(views, active);
  const events = new ApiEvents();
  const tracker = new ViewTracker(app, events, {
    viewTypes: ['atlas-vtt'],
    isMapView: (view): view is TrackedMapView => typeof view === 'object' && view !== null && 'atlasStore' in view,
    activeView: (workspaceApp) => (workspaceApp.workspace as unknown as { getActiveViewOfType(): unknown }).getActiveViewOfType(),
  });
  tracker.start();
  return { tracker, events, layoutChanged };
}

export interface TabbedView extends FakeView {
  /** One tab per path given, in order; the first is active and loaded. */
  readonly tabIds: string[];
  /** Ends the load of the switch in progress: the store then holds its tab's map, loaded. */
  finishLoad(): void;
}

/**
 * A map view with one tab per path, the first active and loaded. `switchToTab` follows Atlas's order: it activates the
 * tab while the store still holds the previous tab's scene, marks the store loading, and holds the next tab's map,
 * loaded, once `finishLoad()` runs (at once, a microtask later, with `autoLoad`).
 */
export function tabbedView(viewId: string, paths: readonly string[], options: { autoLoad?: boolean } = {}): TabbedView {
  const view = fakeView(viewId);
  const tabs = view.tabMetaStore.getState();
  tabs.setTabs([], null);
  const tabIds = paths.map((path) => tabs.addTab(path, path.replace(/^.*\/|\.atlasmap$/g, '')));
  tabs.setActiveTab(tabIds[0]!);
  view.atlasStore.setState({ mapPath: paths[0]!, mapLoaded: true, isMapLoading: false });
  // The switch in progress: `finish` loads its tab; a later switch ends it unloaded, as Atlas drops a superseded load.
  let pending: { finish(): void; drop(): void } | null = null;
  let switches = 0;
  const finishLoad = (): void => { const current = pending; pending = null; current?.finish(); };
  const switchToTab = async (tabId: string): Promise<void> => {
    const tab = view.tabMetaStore.getState().tabs.find((entry) => entry.id === tabId);
    if (!tab) return;
    // As Atlas: the active tab whose scene the store holds needs no load.
    const state = view.atlasStore.getState();
    if (view.tabMetaStore.getState().activeTabId === tabId && state.mapLoaded && !state.isMapLoading && state.mapPath === tab.filePath) return;
    const request = ++switches;
    const previous = pending;
    pending = null;
    previous?.drop();
    view.tabMetaStore.getState().setActiveTab(tabId);
    await Promise.resolve();
    if (request !== switches) return;
    view.atlasStore.setState({ isMapLoading: true, mapLoaded: false });
    await new Promise<void>((resolve) => {
      pending = {
        finish: (): void => { view.atlasStore.setState({ mapPath: tab.filePath, mapLoaded: true, isMapLoading: false }); resolve(); },
        drop: resolve,
      };
      if (options.autoLoad) queueMicrotask(finishLoad);
    });
  };
  return Object.assign(view, { tabIds, finishLoad, switchToTab });
}

/** Marks `view`'s store as holding `maps/a.atlasmap`, loaded. */
export function loadMap(view: FakeView): void {
  view.atlasStore.setState({ mapPath: 'maps/a.atlasmap', mapLoaded: true, isMapLoading: false });
}

/** A plain token at the origin, typed in full; tests spread their own fields over it. */
export function makeToken(id: string): TokenEntity {
  return { kind: 'token', id, x: 0, y: 0, imagePath: `tokens/${id}.png` };
}
