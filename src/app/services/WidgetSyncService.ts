import { App, Plugin } from 'obsidian';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { shallow } from 'zustand/vanilla/shallow';
import {
  pickLibraryWidgets,
  sameWidgets,
  withCollectionEdit,
  withCollectionWidgets,
  type SceneWidgets,
  type WidgetRecord,
} from '../utils/collectionWidgets';
import { runUntracked } from '../stores/history';
import { TimerSessions } from './widgetTimerSessions';
import { AssetService } from './AssetService';
import { CollectionWidgetStore } from './CollectionWidgetStore';
import type { WidgetAnimationPayloads, WidgetAnimationState, WidgetAnimationType } from './widgetAnimationTypes';

export type { WidgetAnimationPayloads, WidgetAnimationState, WidgetAnimationType } from './widgetAnimationTypes';

/** Shared fallback, so a store without widget settings never looks changed. */
const NO_WIDGETS: WidgetRecord = {};

/** The library entries of a view's widgets when it was last synced, and their collection. */
interface ShownCollectionWidgets {
  collectionId: string | null;
  widgets: WidgetRecord;
}

/** The slice of view state that is mirrored between views. */
function sceneWidgets(state: ViewAtlasState): SceneWidgets {
  return { widgets: state.widgetSettings?.widgets ?? NO_WIDGETS, widgetValues: state.widgetValues };
}

/**
 * Keeps widgets consistent between all Atlas views. Every widget of a collection
 * is kept in its library (the collection settings); a scene switches each one on
 * for itself, while widgets on in every scene show in all of them with one value.
 * Views showing the same scene mirror all its widgets.
 */
export class WidgetSyncService {
  private static readonly instances = new WeakMap<App, WidgetSyncService>();

  /** The plugin's sync service, once a map view has created it. */
  static forApp(app: App): WidgetSyncService | undefined {
    return this.instances.get(app);
  }

  private plugin: Plugin;
  private collectionWidgets: CollectionWidgetStore;
  private stores: Map<string, ViewAtlasStore> = new Map();
  private unsubscribers: Map<string, () => void> = new Map();
  private shown = new WeakMap<ViewAtlasStore, ShownCollectionWidgets>();
  private timers: TimerSessions;
  private isUpdating = false;
  private animationListeners: Map<string, Set<(state: WidgetAnimationState) => void>> = new Map();
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.collectionWidgets = new CollectionWidgetStore(AssetService.getInstance(plugin.app));
    this.timers = new TimerSessions({
      stores: this.stores,
      collectionFor: (mapPath) => this.collectionWidgets.collectionFor(mapPath),
      library: (collectionId) => this.collectionWidgets.get(collectionId),
      setLibrary: (collectionId, widgets) => this.collectionWidgets.set(collectionId, widgets),
      editLibrary: (collectionId, edit) => this.editCollectionWidgets(collectionId, edit),
      writeWidgets: (store, widgets) => this.writeQuietly(store, () => store.setState({
        widgetSettings: { ...store.getState().widgetSettings, widgets },
      })),
    });
    WidgetSyncService.instances.set(plugin.app, this);
  }

  /** Every widget of the collection, including those off in the scene at hand. */
  collectionLibrary(collectionId: string): WidgetRecord {
    return this.collectionWidgets.get(collectionId);
  }

  /** Calls `listener` whenever a collection's library changes; returns the unsubscribe. */
  subscribeToLibraries(listener: () => void): () => void {
    return this.collectionWidgets.subscribe(listener);
  }

  /**
   * Changes a collection's library from outside its maps, e.g. when its game
   * system adds a timer, and shows the result in its open scenes at once.
   */
  editCollectionWidgets(collectionId: string, edit: (widgets: WidgetRecord) => WidgetRecord): void {
    const widgets = edit(this.collectionWidgets.get(collectionId));
    this.collectionWidgets.set(collectionId, widgets);
    this.stores.forEach((store) => {
      const { isMapLoading, mapPath } = store.getState();
      if (isMapLoading || !mapPath || this.collectionWidgets.collectionFor(mapPath) !== collectionId) return;
      this.replaceCollectionWidgets(store, collectionId, widgets);
    });
  }
  
  /**
   * Register a store to receive widget sync updates
   */
  registerStore(viewId: string, store: ViewAtlasStore): void {
    this.unsubscribers.get(viewId)?.();
    this.stores.set(viewId, store);

    const unsubscribeWidgets = store.subscribe(
      // Only widget definitions and values sync, not view-specific settings like globalVisible
      sceneWidgets,
      (curr) => {
        if (this.isUpdating) return;
        const { isMapLoading } = store.getState();
        // Loading a map clears and restores its widgets; the collection's stay on screen
        // throughout, and only edits reach other views.
        if (isMapLoading) this.showCollectionWidgets(store, false);
        else this.propagateWidgets(viewId, store, curr);
      },
      {
        // Immer keeps unchanged branches, so references tell whether widgets changed.
        // This runs on every store update, including each drag frame.
        equalityFn: (a, b) => a.widgets === b.widgets && a.widgetValues === b.widgetValues
      }
    );
    const unsubscribeLoading = store.subscribe(
      (state) => state.isMapLoading,
      (loading) => {
        if (!loading) this.applyCollectionWidgets(viewId, store);
      }
    );
    // A scene moved to another collection while open, e.g. in the file explorer, swaps its collection widgets.
    // Its own widgets still belong to the old collection, so they never join the new one's library here.
    const unsubscribePath = store.subscribe(
      (state) => state.mapPath,
      () => {
        if (!store.getState().isMapLoading) this.showCollectionWidgets(store, false);
      }
    );

    this.unsubscribers.set(viewId, () => {
      unsubscribeWidgets();
      unsubscribeLoading();
      unsubscribePath();
    });
  }
  
  /**
   * Unregister a store from widget sync
   */
  unregisterStore(viewId: string): void {
    this.unsubscribers.get(viewId)?.();
    this.unsubscribers.delete(viewId);
    this.stores.delete(viewId);
    this.timers.forget(viewId);
    
    // Clean up animation listeners
    this.animationListeners.delete(viewId);
  }

  /** Stops the scene's own timers only this view shows; call before the view leaves its scene. */
  leaveScene(viewId: string): void {
    this.timers.leaveScene(viewId);
  }

  /** Stops the timers only this view shows; call as the view closes, before its last save. */
  closeView(viewId: string): void {
    this.timers.closeView(viewId);
  }

  /** Adds the collection-wide widgets to a store whose scene has just loaded. */
  private applyCollectionWidgets(viewId: string, store: ViewAtlasStore): void {
    const left = this.timers.sceneLoaded(viewId, store);
    // The asset index loads once; waiting keeps a scene opened at startup from missing its widgets.
    void AssetService.getInstance(this.plugin.app).initialize().then(() => {
      this.timers.collectionLoaded(viewId, store, left);
      this.showCollectionWidgets(store, true);
    });
  }

  /** Adds the scene's widgets the library lacks, e.g. from older scenes or scenes moved in, to its collection. */
  private adoptSceneWidgets(store: ViewAtlasStore, collectionId: string): void {
    const library = this.collectionWidgets.get(collectionId);
    const missing = Object.values(pickLibraryWidgets(sceneWidgets(store.getState())))
      .filter((widget) => !library[widget.id]);
    if (missing.length === 0) return;
    const adopted = { ...library };
    for (const widget of missing) adopted[widget.id] = widget;
    this.collectionWidgets.set(collectionId, adopted);
  }

  /**
   * Applies the library of the store's collection to its scene; scenes outside
   * collections show no collection-wide widgets. With `adoptOwn`, once a scene
   * has loaded, its own widgets join the library.
   */
  private showCollectionWidgets(store: ViewAtlasStore, adoptOwn: boolean): void {
    const { mapPath, isMapLoading } = store.getState();
    const collectionId = mapPath ? this.collectionWidgets.collectionFor(mapPath) : null;
    this.replaceCollectionWidgets(store, collectionId, collectionId ? this.collectionWidgets.get(collectionId) : NO_WIDGETS);
    if (adoptOwn && collectionId && !isMapLoading) this.adoptSceneWidgets(store, collectionId);
  }

  /**
   * The collection's library after an edit in `source`. Only what the view changed
   * compared to what it was shown is applied, so a view that is behind (not yet
   * synced, or moved in from another collection) never undoes other scenes' edits.
   */
  private editedCollectionWidgets(source: ViewAtlasStore, collectionId: string, scene: SceneWidgets): WidgetRecord {
    const shown = this.shown.get(source);
    const before = shown?.collectionId === collectionId ? shown.widgets : NO_WIDGETS;
    return withCollectionEdit(this.collectionWidgets.get(collectionId), before, pickLibraryWidgets(scene));
  }

  /** Mirrors an edit in one view to the collection settings and every related view. */
  private propagateWidgets(sourceViewId: string, source: ViewAtlasStore, scene: SceneWidgets): void {
    const { mapPath } = source.getState();
    if (!mapPath) return;
    const collectionId = this.collectionWidgets.collectionFor(mapPath);
    const shared = collectionId ? this.editedCollectionWidgets(source, collectionId, scene) : NO_WIDGETS;
    if (collectionId) {
      this.collectionWidgets.set(collectionId, shared);
      this.replaceCollectionWidgets(source, collectionId, shared);
    }

    this.isUpdating = true;
    try {
      this.stores.forEach((store, viewId) => {
        const state = store.getState();
        if (viewId === sourceViewId || state.isMapLoading || !state.mapPath) return;
        if (state.mapPath === mapPath) {
          // Same scene: mirror every widget, keeping view-specific globalVisible, position and scale
          runUntracked(store, () => store.setState({
            widgetSettings: { ...state.widgetSettings, widgets: scene.widgets },
            widgetValues: scene.widgetValues
          }));
        }
        if (collectionId && this.collectionWidgets.collectionFor(state.mapPath) === collectionId) {
          this.replaceCollectionWidgets(store, collectionId, shared);
        }
      });
    } finally {
      this.isUpdating = false;
    }
  }

  /** Syncs and loads are not edits of this view, so they never become undo steps. */
  private replaceCollectionWidgets(store: ViewAtlasStore, collectionId: string | null, library: WidgetRecord): void {
    const state = store.getState();
    const current = sceneWidgets(state);
    const { widgets, widgetValues } = withCollectionWidgets(current, library);
    this.shown.set(store, { collectionId, widgets: pickLibraryWidgets({ widgets, widgetValues }) });
    if (sameWidgets(widgets, current.widgets) && shallow(widgetValues, current.widgetValues)) return;
    this.writeQuietly(store, () => store.setState({ widgetSettings: { ...state.widgetSettings, widgets }, widgetValues }));
  }

  /** A write of the sync itself: never mirrored back to other views, never an undo step. */
  private writeQuietly(store: ViewAtlasStore, write: () => void): void {
    const wasUpdating = this.isUpdating;
    this.isUpdating = true;
    try {
      runUntracked(store, write);
    } finally {
      this.isUpdating = wasUpdating;
    }
  }
  
  /**
   * Broadcast widget animation events to all views
   */
  public broadcastWidgetAnimation<T extends WidgetAnimationType>(
    sourceViewId: string,
    animationType: T,
    widgetId: string,
    data?: WidgetAnimationPayloads[T],
  ): void {
    // The signature ties `data` to `animationType`; TypeScript cannot carry that
    // correlation from a generic into the union, hence the assertion.
    const animationState = {
      sourceViewId,
      animationType,
      widgetId,
      data,
      timestamp: Date.now()
    } as WidgetAnimationState;
    
    // Directly notify all registered listeners in ALL views (including other windows)
    // This is the key - we iterate through all stores just like widget value sync does
    this.animationListeners.forEach((listeners, viewId) => {
      if (viewId !== sourceViewId) {
        listeners.forEach(listener => {
          try {
            listener(animationState);
          } catch (e) {
            console.error(`[WidgetSync] Error triggering animation in view ${viewId}:`, e);
          }
        });
      }
    });
  }
  
  /**
   * Subscribe to animation events for a specific view
   */
  public subscribeToAnimations(viewId: string, callback: (state: WidgetAnimationState) => void): () => void {
    if (!this.animationListeners.has(viewId)) {
      this.animationListeners.set(viewId, new Set());
    }
    
    const listeners = this.animationListeners.get(viewId)!;
    listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.animationListeners.delete(viewId);
      }
    };
  }
  
  /**
   * Get all registered view IDs
   */
  getRegisteredViews(): string[] {
    return Array.from(this.stores.keys());
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    WidgetSyncService.instances.delete(this.plugin.app);
    // Atlas unloads: every view closes, so no timer keeps running
    for (const viewId of this.stores.keys()) this.closeView(viewId);
    this.stores.forEach((store) => { void store.flushStorage(); });
    this.collectionWidgets.flush();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();

    // Clear all listeners and states
    this.animationListeners.clear();
    this.stores.clear();
  }
}
