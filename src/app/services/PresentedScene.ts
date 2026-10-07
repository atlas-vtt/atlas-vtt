import type { StoreApi } from 'zustand';
import type { LaserHub } from '../pixi/laser/LaserHub';
import type { ViewAtlasState } from '../storeFactory';
import type { TabMetaStore } from '../stores/tabMetaStore';
import { loadedMapSize, type MapSize } from './viewMapSize';
import { viewCamera, watchViewCamera, type CameraViewport, type ViewCamera } from './presentedCamera';

interface BackgroundSprite {
  width: number;
  height: number;
  destroyed: boolean;
}

/** What `PresentedScene` needs of an Atlas view; `AtlasView` provides it. */
export interface PresentedView {
  /** Identifies the view to the extension API; never reused. */
  readonly viewId: string;
  readonly tabMetaStore: TabMetaStore;
  readonly atlasStore: StoreApi<ViewAtlasState>;
  register(callback: () => void): void;
  /** True once the view has closed; a closed view is never presented. */
  readonly isClosed?: boolean;
  readonly renderer?: {
    getBackgroundSprite(): BackgroundSprite | null;
    getViewportInstance?(): CameraViewport | null;
    getLaserHub?(): LaserHub;
  } | null;
}

export interface PresentedSceneInfo {
  /** Names this presentation: the same while it is held and resumed, new for every `present` (even of the same tab) and never repeated after Atlas reloads. */
  readonly presentationId: string;
  readonly view: PresentedView;
  readonly tabId: string;
  /** The view store holding the scene; all tabs of a view share it. */
  readonly store: StoreApi<ViewAtlasState>;
  /** The loaded background's size in world pixels; 0 × 0 without one. */
  mapSize(): MapSize;
  /** The GM's working view of the scene now: the viewport's centre and visible world size; null without one. */
  camera(): ViewCamera | null;
  /** Calls `listener` after every frame of the view's viewport; returns the unsubscribe. */
  watchCamera(listener: () => void): () => void;
  /** The view's lasers: the GM's own as drawn, and where other people's are shown; null without a renderer. */
  laser(): LaserHub | null;
}

export interface PresentedSceneListener {
  /** `resumed` is false for a new presentation, true when a held scene is shown again after loading. */
  presented?(scene: PresentedSceneInfo, resumed: boolean): void;
  /** The GM switched the presented view to another tab; players keep the last scene they saw. */
  held?(scene: PresentedSceneInfo): void;
  /** Nothing is presented any more: stopped, the view closed, or its tab was closed. */
  cleared?(previous: PresentedSceneInfo, wasHeld: boolean): void;
  /** A view that was presented has closed, whether or not it is still the presented one. */
  viewClosed?(view: PresentedView): void;
}

/** Resolves once the store is not loading a map. */
export function whenMapLoaded(store: StoreApi<ViewAtlasState>): Promise<void> {
  if (!store.getState().isMapLoading) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.subscribe((state) => {
      if (state.isMapLoading) return;
      unsubscribe();
      resolve();
    });
  });
}

/** Whether the view's store holds `tabId`'s scene completely: its map, loaded and drawn. */
export function showsTab(view: PresentedView, tabId: string): boolean {
  const state = view.atlasStore.getState();
  if (!state.mapLoaded || state.isMapLoading) return false;
  const tab = view.tabMetaStore.getState().tabs.find((entry) => entry.id === tabId);
  return tab !== undefined && state.mapPath === tab.filePath;
}

/** The presented tab when it belongs to the view whose tabs `tabStore` holds; else null. */
export function presentedTabIdIn(scene: PresentedSceneInfo | null, tabStore: TabMetaStore): string | null {
  return scene && scene.view.tabMetaStore === tabStore ? scene.tabId : null;
}

/**
 * Which scene players see: one, shared by the player window and anything else that follows it.
 * While the GM shows the presented view another tab the scene is held, since
 * the view's store then holds that other map; once the presented tab is active
 * again and the store holds its map, loaded, the scene is presented again (`resumed`).
 */
export class PresentedScene {
  private scene: PresentedSceneInfo | null = null;
  private held = false;
  /** Invalidates resume waits that a later tab change made stale. */
  private resumeToken = 0;
  private stopWatching: (() => void) | null = null;
  /** Stops waiting for the presented tab's scene to load again. */
  private stopResuming: (() => void) | null = null;
  private readonly listeners = new Set<PresentedSceneListener>();
  private readonly viewsClearingOnClose = new WeakSet<PresentedView>();

  current(): PresentedSceneInfo | null {
    return this.scene;
  }

  isHeld(): boolean {
    return this.scene !== null && this.held;
  }

  subscribe(listener: PresentedSceneListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Present `tabId` of `view`. The caller has waited for its map to load. A closed view is ignored. */
  present(view: PresentedView, tabId: string): void {
    // Its close callback already ran, so nothing would ever clear the scene.
    if (view.isClosed) return;
    this.stopWatching?.();
    this.stopResuming?.();
    const scene: PresentedSceneInfo = {
      presentationId: crypto.randomUUID(),
      view, tabId, store: view.atlasStore,
      mapSize: () => loadedMapSize(view),
      camera: () => viewCamera(view),
      watchCamera: (listener) => watchViewCamera(view, listener),
      laser: () => view.renderer?.getLaserHub?.() ?? null,
    };
    this.scene = scene;
    // A store that does not hold the tab's loaded map (a load that failed, or one still running) is held too, so the resume releases the frame once the map is there.
    this.held = view.tabMetaStore.getState().activeTabId !== tabId || !showsTab(view, tabId);
    this.resumeToken++;
    this.clearOnClose(view);
    this.stopWatching = view.tabMetaStore.subscribe((state) => {
      this.tabsChanged(scene, state.activeTabId, state.tabs.some((tab) => tab.id === tabId));
    });
    if (this.held) {
      this.emit((listener) => listener.held?.(scene));
      if (view.tabMetaStore.getState().activeTabId === tabId) this.resumeWhenLoaded(scene, this.resumeToken);
    } else {
      this.emit((listener) => listener.presented?.(scene, false));
    }
  }

  clear(): void {
    const previous = this.scene;
    if (!previous) return;
    const wasHeld = this.held;
    this.stopWatching?.();
    this.stopWatching = null;
    this.stopResuming?.();
    this.scene = null;
    this.held = false;
    this.resumeToken++;
    this.emit((listener) => listener.cleared?.(previous, wasHeld));
  }

  private tabsChanged(scene: PresentedSceneInfo, activeTabId: string | null, tabExists: boolean): void {
    if (this.scene !== scene) return;
    if (!tabExists) {
      this.clear();
      return;
    }
    if (activeTabId !== scene.tabId) {
      this.resumeToken++;
      this.stopResuming?.();
      if (this.held) return;
      this.held = true;
      this.emit((listener) => listener.held?.(scene));
      return;
    }
    if (this.held) this.resumeWhenLoaded(scene, ++this.resumeToken);
  }

  /**
   * Views switch the active tab before its map starts loading, so the store may still hold the
   * scene the GM browsed, and a retry after a failed load changes no tab. The store is watched
   * until it holds the presented tab's map, loaded: players never get another scene meanwhile.
   */
  private resumeWhenLoaded(scene: PresentedSceneInfo, token: number): void {
    this.stopResuming?.();
    const stop = (): void => {
      unsubscribe();
      if (this.stopResuming === stop) this.stopResuming = null;
    };
    const check = (): void => {
      if (this.scene !== scene || !this.held || token !== this.resumeToken
        || scene.view.tabMetaStore.getState().activeTabId !== scene.tabId) {
        stop();
        return;
      }
      if (!showsTab(scene.view, scene.tabId)) return;
      stop();
      this.held = false;
      this.emit((listener) => listener.presented?.(scene, true));
    };
    const unsubscribe = scene.store.subscribe(check);
    this.stopResuming = stop;
    // After the tab change has settled: a load the switch starts right away is seen first.
    void Promise.resolve().then(check);
  }

  private clearOnClose(view: PresentedView): void {
    if (this.viewsClearingOnClose.has(view)) return;
    this.viewsClearingOnClose.add(view);
    // A closed view must not stay reachable from the presented scene.
    view.register(() => {
      if (this.scene?.view === view) this.clear();
      this.emit((listener) => listener.viewClosed?.(view));
    });
  }

  private emit(notify: (listener: PresentedSceneListener) => void): void {
    for (const listener of [...this.listeners]) {
      // One listener's failure must not keep the others from learning of the change.
      try {
        notify(listener);
      } catch (error) {
        console.error('Atlas: a presented scene listener failed', error);
      }
    }
  }
}

/** The plugin's presented scene; like `playerWindowStore`, one per plugin and so per vault. */
export const presentedScene = new PresentedScene();
