import { FileView, WorkspaceLeaf, TFile, normalizePath, ViewStateResult, Notice } from "obsidian";
import { ServiceManager } from './services/ServiceManager';
import { SceneOpenHistory } from './services/sceneOpenHistory';
import { createViewAtlasStore, ViewAtlasStore } from './storeFactory';
import { getHistoryStore, runUntracked, type HistoryState } from './stores/history';
import { withoutExploredEdits } from './stores/exploredEditHistory';
import { createTabMetaStore, type TabMetaStore } from './stores/tabMetaStore';
import type { SceneTab } from './types/sceneTabTypes';
import type AtlasVTTPlugin from '../../main';
import { claimWorkspaceLeafFocus } from './utils/activeLeafGuard';
import { t } from './i18n';
import { isScenePath } from './utils/sceneFiles';
import { runInBackground } from './utils/backgroundTask';
import { restoreLinkedSnapshot } from './links/openAtlasLink';

export const ATLAS_VIEW_TYPE = "atlas-vtt";

interface TabViewportState {
  centerX: number;
  centerY: number;
  scale: number;
}

interface AtlasViewState {
  mapFilePath: string | null;
  tabs?: SceneTab[];
  activeTabId?: string | null;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tabs of other files (older versions opened map images as scenes) are dropped on restore. */
function isSceneTab(value: unknown): value is SceneTab {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.filePath === 'string'
    && isScenePath(value.filePath)
    && typeof value.displayName === 'string';
}

function isTabViewportState(value: unknown): value is TabViewportState {
  return isRecord(value)
    && typeof value.centerX === 'number'
    && typeof value.centerY === 'number'
    && typeof value.scale === 'number';
}

/**
 * AtlasView implementation after modularization
 *
 * Responsibilities:
 * 1. Act as a thin orchestrator that delegates to specialized services
 * 2. Handle Obsidian view lifecycle and state management
 * 3. Manage scene tabs for multi-scene navigation within a single view
 * 4. Ensure proper initialization and cleanup of services
 */
export class AtlasView extends FileView {
  private _serviceManager: ServiceManager;
  private currentMapFilePath: string | null = null;
  private store: ViewAtlasStore;
  public tabMetaStore: TabMetaStore;
  private temporalCache: Map<string, Pick<HistoryState, 'pastStates' | 'futureStates'>> = new Map();
  private viewportCache: Map<string, TabViewportState> = new Map();
  public readonly viewId: string;
  /**
   * Counts tab switches, new tabs and reloads. One that is no longer the latest after
   * a wait leaves the view to the newer one; the scene loads themselves are arbitrated
   * by MapService. Nothing is held while waiting, so a stalled load cannot block the tabs.
   */
  private sceneRequests = 0;
  private plugin: AtlasVTTPlugin | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private lastContainerWidth: number = 0;
  private lastContainerHeight: number = 0;
  private mapLoadingUnsubscribe: (() => void) | null = null;
  private pendingViewportRestoreRaf: number | null = null;
  private isViewClosing = false;
  private boundClaimLeafFocus: (() => void) | null = null;
  private boundHeaderLeafActivation: ((event: MouseEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin, isPlayerView: boolean = false) {
    super(leaf);
    // Scene tabs handle deleted maps. Prevent FileView from concurrently replacing
    // or detaching this leaf while Atlas closes the deleted scene's tab.
    this.allowNoFile = true;

    // Store plugin reference
    this.plugin = plugin;

    // Create unique view ID
    this.viewId = `view-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Create isolated store for this view with plugin reference for collection service
    // Pass isPlayerView flag during store creation to ensure it's set from the start
    this.store = createViewAtlasStore(this.app, this.viewId, this.plugin, isPlayerView);

    // Create the per-view tab metadata store
    this.tabMetaStore = createTabMetaStore();

    // Initialize the service manager with the view store and plugin
    this._serviceManager = new ServiceManager(this.app, this.store, this.plugin, this.viewId);
  }

  // --- State Management ---

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const rendererService = this._serviceManager.getRendererService();

    // Workspace state comes from workspace.json, so every field is validated before use
    const persisted = isRecord(state) ? state : {};
    const stateFilePath = typeof persisted.file === 'string' ? persisted.file : null;

    // Restore tabs from persisted state if present
    const persistedTabs = Array.isArray(persisted.tabs) ? persisted.tabs.filter(isSceneTab) : [];
    const firstTab = persistedTabs[0];
    if (firstTab) {
      const restoredTabs: SceneTab[] = persistedTabs.map((t) => ({
        ...t,
        isLoaded: false,
        isDirty: false,
      }));
      const activeTabId = typeof persisted.activeTabId === 'string' ? persisted.activeTabId : firstTab.id;
      this.tabMetaStore.getState().setTabs(restoredTabs, activeTabId);
    }

    // Restore per-tab viewport positions from persisted state
    if (isRecord(persisted.viewportPerTab)) {
      for (const [tabId, camera] of Object.entries(persisted.viewportPerTab)) {
        if (isTabViewportState(camera)) {
          this.viewportCache.set(tabId, camera);
        }
      }
    }

    // If renderer already exists, we don't want to trigger the full Obsidian
    // view-swap cycle again (which would call `onClose`/`onOpen`). Instead we
    // update our own file reference and load the map.
    if (rendererService.isInitialized()) {
      if (stateFilePath !== null) {
        this.file = this.app.vault.getFileByPath(normalizePath(stateFilePath));
      }

      if (this.file instanceof TFile) {
        await this.onLoadFile(this.file);
      }
    } else {
      // Determine which file to load: the active tab's file (for tab restore),
      // falling back to state.file.  We intentionally skip super.setState()
      // because it may internally call onLoadFile() with the wrong file
      // (the leaf-level file rather than the active tab's file), which would
      // reset the active tab before we can correct it.
      const tabState = this.tabMetaStore.getState();
      const activeTab = tabState.tabs.find((t: SceneTab) => t.id === tabState.activeTabId);
      if (activeTab) {
        const activeFile = this.app.vault.getFileByPath(normalizePath(activeTab.filePath));
        if (activeFile) {
          this.file = activeFile;
        }
      } else if (stateFilePath !== null) {
        this.file = this.app.vault.getFileByPath(normalizePath(stateFilePath));
      }

      await this.onOpen();
    }
  }

  /**
   * Obsidian passes the `#` part of a link that opened this view here: a link
   * to one of the scene's snapshots offers to restore it once the scene is open.
   */
  setEphemeralState(state: unknown): void {
    super.setEphemeralState(state);
    const subpath = isRecord(state) && typeof state.subpath === 'string' ? state.subpath : null;
    const mapPath = this.file?.path;
    if (!subpath || !mapPath) return;
    runInBackground(restoreLinkedSnapshot(this.app, mapPath, subpath), `Opening a link to a snapshot of ${mapPath}`, t('snapshots.restoreFailed'));
  }

  getState(): AtlasViewState {
    const { tabs, activeTabId } = this.tabMetaStore.getState();

    // Snapshot the current viewport position for the active tab — but only
    // when no map is loading.  During load, centerAndFitMap() positions the
    // viewport temporarily and we don't want that to overwrite the user's
    // saved position in the cache.
    if (activeTabId && !this.store.getState().isMapLoading) {
      this.saveViewportState(activeTabId);
    }

    // Build a plain object of viewport positions per tab for persistence
    const viewportPerTab: Record<string, TabViewportState> = {};
    for (const [tabId, camera] of this.viewportCache) {
      viewportPerTab[tabId] = camera;
    }

    return {
      file: this.currentMapFilePath,
      mapFilePath: this.currentMapFilePath,
      tabs,
      activeTabId,
      viewportPerTab,
    };
  }

  getStore(): ViewAtlasStore {
    return this.store;
  }

  getTabMetaStore(): TabMetaStore {
    return this.tabMetaStore;
  }

  async saveMap(): Promise<void> {
    if (this.file instanceof TFile) {
      await this.flushPendingSaves();
    }
  }

  // --- Lifecycle Methods ---

  /** Obsidian will call this when the view is first shown or state is updated. */
  async onOpen(): Promise<void> {
    this.isViewClosing = false;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('atlas-vtt-plugin');
    containerEl.addClass('atlas-vtt-view');
    containerEl.tabIndex = -1;

    this.detachLeafFocusHandlers();
    this.boundClaimLeafFocus = () => this.claimLeafFocus();
    containerEl.addEventListener('pointerdown', this.boundClaimLeafFocus, true);
    containerEl.addEventListener('pointerenter', this.boundClaimLeafFocus, true);
    this.attachTabHeaderActivationHandler();

    try {
      // Show loading overlay immediately if we have a file to load
      if (this.file instanceof TFile) {
        this.store.getState().setMapLoading(true, 0, t('view.initializing'));
      }


      // Initialize renderer
      const rendererService = this._serviceManager.getRendererService();
      const pixiApp = await rendererService.init(containerEl);
      if (this.isViewClosing) {
        return;
      }

      // Mount UI overlay once the renderer is initialized
      const uiOverlay = this._serviceManager.getUIOverlay();
      uiOverlay.mount(containerEl, this, pixiApp);

      // If state already has a map, trigger load now (file property provided by FileView)
      if (this.file instanceof TFile) {
        await this.onLoadFile(this.file);
        if (this.isViewClosing) {
          return;
        }

        // Restore viewport position for the active tab.  We must wait until
        // loading finishes because (a) getState() → saveViewportState would
        // overwrite the cache with centerAndFitMap values while loading, and
        // (b) BackgroundSprite's useEffect calls moveCenter() asynchronously
        // after texture load, which would override an immediate restore.
        const activeTabId = this.tabMetaStore.getState().activeTabId;
        if (activeTabId && this.viewportCache.has(activeTabId)) {
          const doRestore = (): void => {
            if (this.isViewClosing) return;
            if (this.pendingViewportRestoreRaf !== null) {
              window.cancelAnimationFrame(this.pendingViewportRestoreRaf);
            }
            // One extra frame so any remaining React effects (BackgroundSprite
            // moveCenter) have already flushed.
            this.pendingViewportRestoreRaf = window.requestAnimationFrame(() => {
              this.pendingViewportRestoreRaf = null;
              if (this.isViewClosing) return;
              this.restoreViewportState(activeTabId);
            });
          };

          if (!this.store.getState().isMapLoading) {
            doRestore();
          } else {
            this.mapLoadingUnsubscribe?.();
            this.mapLoadingUnsubscribe = this.store.subscribe((state) => {
              if (!state.isMapLoading) {
                this.mapLoadingUnsubscribe?.();
                this.mapLoadingUnsubscribe = null;
                doRestore();
              }
            });
          }
        }
      }

      // Set up window resize detection
      if (!this.isViewClosing) {
        this.setupWindowResizeDetection();
      }
    } catch (error) {
      if (!this.isViewClosing) {
        console.error("[AtlasView] Error during onOpen:", error);
      }
    }
  }

  /** Obsidian will call this when the view is being destroyed. */
  async onClose(): Promise<void> {
    if (this.isViewClosing) {
      return;
    }
    this.isViewClosing = true;

    if (this.mapLoadingUnsubscribe) {
      this.mapLoadingUnsubscribe();
      this.mapLoadingUnsubscribe = null;
    }

    if (this.pendingViewportRestoreRaf !== null) {
      window.cancelAnimationFrame(this.pendingViewportRestoreRaf);
      this.pendingViewportRestoreRaf = null;
    }

    // Pinned note previews keep their scroll and cursor with the map
    this._serviceManager.getNotePreviewUIManager().savePinnedPreviewStates();

    // Flush all pending saves before destroying
    await this.flushPendingSaves();

    // Release cached state
    this.temporalCache.clear();
    this.viewportCache.clear();

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up event listeners
    this.detachLeafFocusHandlers();
    this.detachTabHeaderActivationHandler();

    // Clean up all services
    this._serviceManager.destroy();
  }



  // --- Tab Management ---

  /**
   * Switch to a specific tab by ID.
   * Flushes pending saves, resolves the file, and loads the scene.
   */
  public async switchToTab(tabId: string): Promise<void> {
    const tabState = this.tabMetaStore.getState();
    const tab = tabState.tabs.find((t: SceneTab) => t.id === tabId);
    if (!tab) {
      console.warn(`[AtlasView] switchToTab: tab not found: ${tabId}`);
      return;
    }

    // Already active: nothing to do while the store holds its scene or is loading it. A tab
    // whose scene failed to load is tried again.
    if (tabState.activeTabId === tabId && (this.loadedTabId() === tabId || this.store.getState().isMapLoading)) return;

    // Flush pending saves before capturing any state snapshots
    const request = ++this.sceneRequests;
    await this.flushPendingSaves();
    if (request !== this.sceneRequests) return;

    this.cacheLoadedTabState();

    // Resolve the TFile from the tab's filePath
    const abstractFile = this.app.vault.getAbstractFileByPath(normalizePath(tab.filePath));
    if (!(abstractFile instanceof TFile)) {
      new Notice(t('view.sceneNotFound', { path: tab.filePath }));
      this.tabMetaStore.getState().removeTab(tabId);
      return;
    }

    // Update FileView's internal file reference
    this.file = abstractFile;

    // Set active tab in meta store
    this.tabMetaStore.getState().setActiveTab(tabId);

    // Load the map from disk (clears state, rehydrates, emits map-loaded)
    const loaded = await this.performSceneLoad(abstractFile);

    // Restore the target tab's undo/redo history and viewport position.
    // Writing past/future states directly never records a step, so tracking can stay as the load left it.
    // A scene that failed to load, or was replaced by a later request, takes none of them.
    if (loaded) {
      this.restoreTemporalState(tabId);
      this.restoreViewportState(tabId);
      this.rememberOpened(abstractFile);
    } else if (request === this.sceneRequests) {
      this.showLoadedTab();
    }

    // Tell Obsidian the view state changed so workspace.json is updated
    this.app.workspace.requestSaveLayout();
  }

  /**
   * Points the active tab and the view's file at the scene the store holds as loaded.
   * A load that fails before it replaces that scene leaves it open, while the tab bar
   * and the file already name the scene that did not open.
   */
  private showLoadedTab(): void {
    const tabId = this.loadedTabId();
    const file = this.sceneFile();
    if (!tabId || !file) return;
    this.file = file;
    this.tabMetaStore.getState().setActiveTab(tabId);
  }

  /** The file of the scene the store is bound to; without one, the view's file (a tab whose scene did not open). */
  private sceneFile(): TFile | null {
    const { mapPath } = this.store.getState();
    const file = mapPath ? this.app.vault.getAbstractFileByPath(normalizePath(mapPath)) : this.file;
    return file instanceof TFile ? file : null;
  }

  /**
   * The tab whose scene the store holds as loaded. While a switch is under way the
   * active tab is already the next one, so the store's own path decides.
   */
  private loadedTabId(): string | null {
    const { mapLoaded, mapPath } = this.store.getState();
    if (!mapLoaded || !mapPath) return null;
    return this.tabMetaStore.getState().getTabByFilePath(mapPath)?.id ?? null;
  }

  /** Keeps the undo/redo history and viewport of the scene being left for its tab; without a loaded scene there is nothing to keep. */
  private cacheLoadedTabState(): void {
    const tabId = this.loadedTabId();
    if (!tabId) return;
    this.saveTemporalState(tabId);
    this.saveViewportState(tabId);
  }

  /**
   * Close a tab by ID.
   * If closing the active tab, switches to an adjacent tab or closes the view entirely.
   */

  /**
   * Save the current tab's undo/redo history into the temporal cache, without its edits of the
   * explored memory: the memory keeps what they changed only until its scene is left.
   */
  private saveTemporalState(tabId: string): void {
    const history = getHistoryStore(this.store);
    if (!history) return;
    this.temporalCache.set(tabId, withoutExploredEdits(history.getState()));
  }

  /** Restore a tab's undo/redo history from the temporal cache (if any). */
  private restoreTemporalState(tabId: string): void {
    const cached = this.temporalCache.get(tabId);
    if (!cached) return;
    getHistoryStore(this.store)?.setState({
      pastStates: cached.pastStates,
      futureStates: cached.futureStates,
    });
  }

  /** Save the current viewport position/zoom for a tab. */
  private saveViewportState(tabId: string): void {
    const viewport = this._serviceManager.getRendererService().getViewport();
    if (!viewport) return;
    this.viewportCache.set(tabId, {
      centerX: viewport.center.x,
      centerY: viewport.center.y,
      scale: viewport.scale.x,
    });
  }

  /** Restore a tab's viewport position/zoom from the cache (if any). */
  private restoreViewportState(tabId: string): void {
    const cached = this.viewportCache.get(tabId);
    if (!cached) return;
    const viewport = this._serviceManager.getRendererService().getViewport();
    if (!viewport) return;
    // setZoom MUST come before moveCenter — moveCenter calculates viewport.x/y
    // using the current scale, so the scale must already be correct.
    viewport.setZoom(cached.scale);
    viewport.moveCenter(cached.centerX, cached.centerY);
  }

  public async closeTab(tabId: string): Promise<void> {
    const tabState = this.tabMetaStore.getState();
    const tab = tabState.tabs.find((t: SceneTab) => t.id === tabId);
    if (!tab) return;

    // Flush pending saves before closing
    await this.flushPendingSaves();

    // Read after the wait: a switch may have changed the active tab meanwhile
    const wasActive = this.tabMetaStore.getState().activeTabId === tabId;

    // Remove the tab from store (this also picks an adjacent tab as active)
    this.tabMetaStore.getState().removeTab(tabId);

    // Clean up cached state for this tab
    this.temporalCache.delete(tabId);
    this.viewportCache.delete(tabId);

    const updatedTabState = this.tabMetaStore.getState();

    // If no tabs remain, close the entire leaf
    if (updatedTabState.tabs.length === 0) {
      this.leaf.detach();
      return;
    }

    // If the closed tab was active, switch to the newly active scene
    if (wasActive && updatedTabState.activeTabId) {
      const nextTabId = updatedTabState.activeTabId;
      // removeTab selected the neighbour in metadata, but its map is not loaded yet.
      // Clear that selection so switching loads it without caching the closed map
      // over the neighbour's saved viewport and history.
      this.tabMetaStore.setState({ activeTabId: null });
      await this.switchToTab(nextTabId);
    }

    // Tell Obsidian the view state changed so workspace.json is updated
    this.app.workspace.requestSaveLayout();
  }

  /**
   * Update a tab's file path after a vault rename/move.
   * Also updates the internal file reference if the renamed file is the active scene.
   */
  /**
   * Follows a vault rename: the open map's tokens and pins, its save target and
   * its tab. Without the new save target, the next autosave would recreate the
   * map under its old name.
   */
  public handleFileRenamed(oldPath: string, newPath: string, newName: string): void {
    const state = this.store.getState();
    if (state.mapPath === oldPath) state.setMapPath(newPath);
    this._serviceManager.getMapService().handleFileRenamed(oldPath, newPath);
    // A rename is not an edit: undo must never point tokens back at a path that no longer exists.
    runUntracked(this.store, () => this.store.getState().retargetRenamedFile(oldPath, newPath));

    const tabState = this.tabMetaStore.getState();
    if (!tabState.getTabByFilePath(oldPath)) return;

    tabState.updateTabFilePath(oldPath, newPath, newName);

    if (this.currentMapFilePath === oldPath) {
      this.currentMapFilePath = newPath;
      this.file = this.app.vault.getFileByPath(newPath);
    }
  }

  /**
   * Lets `rewrite` replace the file of the scene the store holds, then loads the scene again
   * from it, keeping the camera where it is. Pending changes are saved first
   * and nothing the store holds can be saved over the rewritten file. The
   * reload clears the scene's undo history, like opening a map does.
   */
  public async reloadActiveScene(rewrite: (file: TFile) => Promise<void>): Promise<void> {
    // The store decides which scene that is: the view's file names a tab that may not have opened
    const file = this.sceneFile();
    if (!file) return;

    const request = ++this.sceneRequests;
    // Only a loaded scene has a camera to keep
    const tabId = this.loadedTabId();
    if (tabId) this.saveViewportState(tabId);

    // Nothing the store holds may be saved over the rewritten file. A load that is still
    // running is stopped as well: finishing meanwhile, it would mark the store as loaded
    // with the content from before and queue that for saving.
    this._serviceManager.getMapService().suspendForRewrite();
    // What is pending reaches the file before the rewrite, including what the unloading scene
    // saved on its way out (the explored memory): flushed later, by the load, it would land on
    // the rewritten file and put the old scene back.
    await this.flushPendingSaves();
    try {
      await rewrite(file);
    } catch (error) {
      // The store went out of use above; the scene comes back from its file as it is now
      if (request === this.sceneRequests) await this.performSceneLoad(file);
      throw error;
    }

    // A tab switch made meanwhile shows its own scene
    if (request !== this.sceneRequests) return;
    if (!(await this.performSceneLoad(file))) return;
    this.showLoadedTab();
    if (tabId) this.restoreViewportState(tabId);
  }

  /**
   * Open the scene browser via the plugin's global asset manager.
   */
  public openSceneBrowser(): void {
    this.plugin?.globalAssetManager?.open('scenes');
  }

  // --- Scene Loading ---

  /** Obsidian will call this each time a file is loaded into this view (including first open). */
  public async onLoadFile(file: TFile): Promise<void> {
    if (!isScenePath(file.path)) {
      new Notice(`"${file.name}" is not an Atlas scene. To play on a map image, create a scene from it in the asset manager.`, 5000);
      // onOpen shows the loading overlay before it gets here; nothing else will hide it
      if (!this.currentMapFilePath) this.store.getState().setMapLoading(false);
      return;
    }
    const tabState = this.tabMetaStore.getState();
    const existingTab = tabState.getTabByFilePath(file.path);

    if (existingTab) {
      // File is already a tab
      if (tabState.activeTabId === existingTab.id) {
        this.sceneRequests++;
        if (await this.performSceneLoad(file)) {
          this.tabMetaStore.getState().markTabLoaded(existingTab.id);
          this.rememberOpened(file);
        }
      } else {
        await this.switchToTab(existingTab.id);
      }
    } else {
      const request = ++this.sceneRequests;
      await this.flushPendingSaves();

      // Save current tab's temporal + viewport state before loading a new scene
      this.cacheLoadedTabState();

      const displayName = file.basename;
      const tabId = tabState.addTab(file.path, displayName);

      // Update FileView's file reference so Obsidian's leaf tracks the current file
      this.file = file;

      // Perform the scene load (single store — loadMap handles clear + rehydrate)
      if (await this.performSceneLoad(file)) {
        this.tabMetaStore.getState().markTabLoaded(tabId);
        this.rememberOpened(file);
      } else if (request === this.sceneRequests) this.showLoadedTab();
    }

    // Tell Obsidian the view state changed so workspace.json is updated
    this.app.workspace.requestSaveLayout();
  }

  /**
   * Loads a scene into the existing renderer and UI. Every renderer follows the
   * store, so switching maps never rebuilds the PIXI application.
   * @returns whether the view now shows the scene: false when loading failed or a later request replaced this one
   */
  private async performSceneLoad(file: TFile): Promise<boolean> {
    // The renderer still shows the previous scene; its pending thumbnail is taken now or never
    this._serviceManager.flushSceneThumbnail();
    this.store.getState().setMapLoading(true, 0, t('view.preparing'));
    this.currentMapFilePath = file.path;

    const rendererService = this._serviceManager.getRendererService();
    if (!rendererService.isInitialized()) {
      console.error('[AtlasView] performSceneLoad called before renderer initialised');
      this.store.getState().setMapLoading(false);
      return false;
    }

    const mapService = this._serviceManager.getMapService();
    return (await mapService.loadMapFromFile(rendererService, file)) !== null;
  }

  /** Remembers the scene the GM opened, for the dashboard's "Continue your adventure". Never fails the load. */
  private rememberOpened(file: TFile): void {
    const remember = async (): Promise<void> => SceneOpenHistory.forApp(this.app).recordOpened(file.path);
    runInBackground(remember(), 'Remembering the opened scene');
  }

  // --- Persistence Helpers ---

  /**
   * Flush any pending debounced saves to disk immediately.
   * Used before tab switches and view close to ensure data is not lost.
   */
  private async flushPendingSaves(): Promise<void> {
    try {
      await this.store.flushStorage();
    } catch (error) {
      console.error('[AtlasView] Error flushing saves:', error);
    }
  }

  private claimLeafFocus(): void {
    if (this.isViewClosing) {
      return;
    }

    claimWorkspaceLeafFocus(this.app.workspace, this.leaf, this.containerEl);
  }

  private detachLeafFocusHandlers(): void {
    if (!this.boundClaimLeafFocus) {
      return;
    }

    this.containerEl.removeEventListener('pointerdown', this.boundClaimLeafFocus, true);
    this.containerEl.removeEventListener('pointerenter', this.boundClaimLeafFocus, true);
    this.boundClaimLeafFocus = null;
  }

  private attachTabHeaderActivationHandler(): void {
    this.detachTabHeaderActivationHandler();

    const tabHeaderEl = (this.leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement | null }).tabHeaderEl;
    if (!tabHeaderEl) {
      return;
    }

    this.boundHeaderLeafActivation = () => {
      this.app.workspace.setActiveLeaf(this.leaf, { focus: false });
    };

    tabHeaderEl.addEventListener('mousedown', this.boundHeaderLeafActivation, true);
  }

  private detachTabHeaderActivationHandler(): void {
    if (!this.boundHeaderLeafActivation) {
      return;
    }

    const tabHeaderEl = (this.leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement | null }).tabHeaderEl;
    tabHeaderEl?.removeEventListener('mousedown', this.boundHeaderLeafActivation, true);
    this.boundHeaderLeafActivation = null;
  }

  // --- Tool Mode Delegations ---

  /**
   * Set the active tool mode
   * Delegates to ToolController
   */
  public setToolMode(mode: import('./types').ToolMode): void {
    this._serviceManager.getToolController().setToolMode(mode);
  }

  /**
   * Toggle player/DM mode
   * Delegates to ToolController
   */
  public setPlayerMode(isPlayerMode: boolean): void {
    this._serviceManager.getToolController().setPlayerMode(isPlayerMode);
  }

  public isInPlayerMode(): boolean {
    return this._serviceManager.getToolController().isInPlayerMode();
  }

  /**
   * Toggle drawing/normal mode
   * Delegates to ToolController
   */
  public setDrawingMode(isDrawingMode: boolean): void {
    this._serviceManager.getToolController().setDrawingMode(isDrawingMode);
  }

  /**
   * Toggle grid visibility
   * Delegates to ToolController and GridManager
   */
  public toggleGrid(): void {
    const toolController = this._serviceManager.getToolController();
    const rendererService = this._serviceManager.getRendererService();
    const gridManager = this._serviceManager.getGridManager();
    const mapService = this._serviceManager.getMapService();

    if (!rendererService.isInitialized()) {
      console.warn('[AtlasView] Cannot toggle grid: renderer not initialized');
      return;
    }

    // Get the actual renderer
    const renderer = rendererService.getRenderer();
    if (!renderer) {
      console.warn('[AtlasView] Cannot toggle grid: renderer not available');
      return;
    }

    // Get the current map data
    const mapData = mapService.getCurrentMapData();

    // Toggle the grid visibility in both the tool controller and grid manager
    toolController.toggleGrid();
    gridManager?.toggle(renderer, mapData);
  }

  /**
   * Set fog brush size
   * Delegates to ToolController
   */
  public setFogBrushSize(size: number): void {
    this._serviceManager.getToolController().setFogBrushSize(size);
  }

  /**
   * Clear all fog
   * Delegates to ToolController
   */
  public clearAllFog(): void {
    this._serviceManager.getToolController().clearAllFog();
  }

  /**
   * Set measurement shape
   * Delegates to ToolController
   */
  public setMeasureShape(shape: 'line' | 'cone' | 'circle'): void {
    this._serviceManager.getToolController().setMeasureShape(shape);
  }

  /**
   * Set measurement persistence
   * Delegates to ToolController
   */
  public setMeasurePersistence(persist: boolean): void {
    this._serviceManager.getToolController().setMeasurePersistence(persist);
  }

  /**
   * Get the service manager
   * Exposes the service manager for UI components
   */
  public get serviceManager(): ServiceManager {
    return this._serviceManager;
  }

  /**
   * Get the store
   * Exposes the store for UI components
   */
  public get atlasStore(): typeof this.store {
    return this.store;
  }

  /* ------------------------------------------------------------------ */
  /* Obsidian view metadata                                             */
  /* ------------------------------------------------------------------ */
  getViewType(): string {
    return ATLAS_VIEW_TYPE;
  }

  getDisplayText(): string {
    // Display the map name if available
    const mapFilePath = this._serviceManager.getMapService().getCurrentMapFilePath();
    return mapFilePath ? `Atlas: ${mapFilePath.split('/').pop()}` : t('view.canvas');
  }

  getIcon(): string {
    return "map";
  }

  /**
   * Expose the PixiRenderer for React UI components
   */
  public get renderer() {
    return this._serviceManager.getRendererService().getRenderer();
  }

  /**
   * Sets up window resize detection to update the PIXI canvas
   * Only responds to actual window size changes, not container changes
   */
  private setupWindowResizeDetection(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Observe the actual container element so PIXI sizes to the pane, not the window
    this.resizeObserver = new ResizeObserver(() => {
      const currentWidth = this.containerEl.clientWidth;
      const currentHeight = this.containerEl.clientHeight;

      // Only resize if the container dimensions actually changed
      if (currentWidth !== this.lastContainerWidth ||
          currentHeight !== this.lastContainerHeight) {

        this.lastContainerWidth = currentWidth;
        this.lastContainerHeight = currentHeight;

        // Resize the renderer to match the container
        const rendererService = this._serviceManager.getRendererService();
        rendererService.resize(currentWidth, currentHeight);
      }
    });

    // Observe the container element for size changes (fires immediately)
    this.resizeObserver.observe(this.containerEl);
  }
}
