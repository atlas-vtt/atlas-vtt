import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import type { LaserHub } from '../app/pixi/laser/LaserHub';
import type { CameraViewport } from '../app/services/presentedCamera';
import type { ViewAtlasStore } from '../app/storeFactory';
import type { TabMetaStore } from '../app/stores/tabMetaStore';
import type { ApiEvents } from './events';
import { isLoaded, viewInfo } from './viewInfo';

/** What the API reads of an open Atlas map view (`AtlasView` provides it). */
export interface TrackedMapView {
  readonly viewId: string;
  readonly atlasStore: ViewAtlasStore;
  readonly tabMetaStore: TabMetaStore;
  readonly renderer: {
    getBackgroundSprite(): { width: number; height: number; destroyed: boolean } | null;
    getViewportInstance?(): CameraViewport | null;
    getLaserHub?(): LaserHub;
  } | null;
  readonly isClosed: boolean;
  /** The view's own event bus: Atlas's dice log, toasts, sounds and the player window it feeds hear its `dice-rolled` rolls there. */
  readonly serviceManager?: { getEventBus(): EventEmitter };
  register(callback: () => void): void;
  switchToTab(tabId: string): Promise<void>;
}

/** How the tracker recognises Atlas map views; injected so it never loads the view's code itself (`atlasViewHooks.ts` holds the real ones). */
export interface ViewHooks {
  /** The leaf types that hold Atlas map views. */
  readonly viewTypes: readonly string[];
  isMapView(view: unknown): view is TrackedMapView;
  /** The view the user is working in, if it is an Atlas map view. */
  activeView(app: App): unknown;
}

interface Entry {
  view: TrackedMapView;
  unsubscribe: () => void;
  loadedPath: string | null;
  closeHooks: Set<() => void>;
}

/** Follows the open map views for the API: which there are, and when one loads a map or closes. */
export class ViewTracker {
  private readonly entries = new Map<string, Entry>();
  private stopLayout: (() => void) | null = null;

  constructor(
    private readonly app: App,
    private readonly events: ApiEvents,
    private readonly hooks: ViewHooks,
  ) {}

  start(): void {
    const ref = this.app.workspace.on('layout-change', () => this.scan());
    this.stopLayout = (): void => this.app.workspace.offref(ref);
    this.scan();
  }

  stop(): void {
    this.stopLayout?.();
    this.stopLayout = null;
    for (const entry of this.entries.values()) entry.unsubscribe();
    this.entries.clear();
  }

  views(): TrackedMapView[] {
    return [...this.entries.values()].map((entry) => entry.view).filter((view) => !view.isClosed);
  }

  view(viewId: string): TrackedMapView | null {
    const view = this.entries.get(viewId)?.view ?? null;
    return view && !view.isClosed ? view : null;
  }

  /** The active map view, once tracked and open. */
  activeView(): TrackedMapView | null {
    const active = this.hooks.activeView(this.app);
    if (!this.hooks.isMapView(active)) return null;
    return this.view(active.viewId) === active ? active : null;
  }

  /** Tracks `view` now, without waiting for the layout change that would find it. */
  adopt(view: TrackedMapView): void {
    if (!view.isClosed && !this.entries.has(view.viewId)) this.track(view);
  }

  /** Calls `callback` once when the view closes (before `map-closed`); the returned function cancels it. A view not open runs nothing. */
  onClose(viewId: string, callback: () => void): () => void {
    const entry = this.entries.get(viewId);
    if (!entry || entry.view.isClosed) return () => undefined;
    entry.closeHooks.add(callback);
    return () => { entry.closeHooks.delete(callback); };
  }

  private scan(): void {
    for (const type of this.hooks.viewTypes) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        const view: unknown = leaf.view;
        if (this.hooks.isMapView(view)) this.adopt(view);
      }
    }
  }

  private track(view: TrackedMapView): void {
    const entry: Entry = { view, unsubscribe: () => undefined, loadedPath: null, closeHooks: new Set() };
    const check = (): void => {
      const state = view.atlasStore.getState();
      const path = isLoaded(state) ? state.mapPath : null;
      const changed = path !== null && path !== entry.loadedPath;
      entry.loadedPath = path;
      if (changed) this.events.emit('map-loaded', viewInfo(view));
    };
    entry.unsubscribe = view.atlasStore.subscribe(check);
    this.entries.set(view.viewId, entry);
    let closed = false;
    view.register(() => {
      if (closed) return;
      closed = true;
      entry.unsubscribe();
      for (const hook of [...entry.closeHooks]) hook();
      entry.closeHooks.clear();
      if (this.entries.get(view.viewId) !== entry) return;
      this.entries.delete(view.viewId);
      this.events.emit('map-closed', view.viewId);
    });
    check();
  }
}
