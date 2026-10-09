import { App, Notice, TFile } from 'obsidian';
import { MapController } from '../MapController';
import { EventEmitter } from 'events';
import { RendererService } from './RendererService';
import type { ViewAtlasStore } from '../storeFactory';
import type { MapFile } from './MapPersistence';
import { getHistoryStore } from '../stores/history';
import { autoDetectGridOnFirstLoad } from './gridAutoDetect';
import { offerGridAlignment } from './gridAlignmentNotice';
import { describeError } from '../utils/errors';
import { sceneNameOf } from '../utils/sceneName';
import { settledWithin } from '../utils/settledWithin';
import { LatestRequestQueue } from './latestRequestQueue';
import { fillStoreFromMapFile } from './mapFileFallback';
import { t } from '../i18n';
import type { ViewCamera } from '../pixi/viewCamera';
import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
import { fitMapRect } from '../pixi/fitMapRect';
import { readMapStretch, sameStretch } from '../grid/mapStretch';

/** How long a scene may take to load before the load is given up. */
export const STALLED_LOAD_MS = 30_000;
/** How long the loading screen waits for the map image's tiles in view; past it the map shows as they arrive. */
export const MAP_IMAGE_READY_MS = 1500;

export class MapService {
  private currentMapFilePath: string | null = null;
  private currentMapData: MapFile | null = null;
  private eventBus: EventEmitter;
  private readonly loads = new LatestRequestQueue();

  constructor(private app: App, eventBus: EventEmitter, private store: ViewAtlasStore) {
    this.eventBus = eventBus;
  }

  /**
   * Load a map from a file. One load runs at a time: a request made while another is
   * in flight starts once that one has stopped, and of several waiting only the latest runs.
   * @param rendererService The RendererService instance
   * @param filePath The path to the map file
   * @param camera Where the scene is shown (its tab's own camera); without one the map is fitted to the view.
   * The loading screen waits for the tiles this camera shows.
   * @returns The loaded map data, or null when loading failed or a later request replaced this one
   */
  public loadMap(rendererService: RendererService, filePath: string, camera: ViewCamera | null = null): Promise<MapFile | null> {
    return this.loads.run(async (isSuperseded) => {
      const load = this.runLoad(rendererService, filePath, camera, isSuperseded);
      if (await settledWithin(load, STALLED_LOAD_MS)) return load;
      if (isSuperseded()) return null;
      // The loading overlay covers the whole view, its tabs included: a load that never ends
      // (a file or an image that never arrives) is given up, and stopped should it wake up.
      this.loads.cancel();
      this.recoverFromFailedLoad(rendererService, filePath, new Error('The scene took too long to load'));
      return null;
    });
  }

  /**
   * Loads `filePath` into the store and the renderer. After every wait it checks
   * `isSuperseded` and, once replaced, returns without touching either again: the
   * load that replaced it starts from whatever state it finds.
   */
  private async runLoad(
    rendererService: RendererService,
    filePath: string,
    camera: ViewCamera | null,
    isSuperseded: () => boolean,
  ): Promise<MapFile | null> {
    try {
      // Services save what belongs to the map being left while its state is still loaded
      if (this.store.getState().mapLoaded) this.eventBus.emit('map-unloading');

      // Show loading overlay FIRST before any state changes
      this.store.getState().setMapLoading(true, 0, t('map.loadingShort'));

      // Get the actual renderer object from the service
      const renderer = rendererService.getRenderer();
      if (!renderer) {
        throw new Error('[MapService] Renderer not initialized');
      }
      
      const storeState = this.store.getState();
      
      // Temporarily disable persistence for THIS store only to prevent saving empty state to the map file
      storeState.setPersistenceEnabled(false);
      
      // Flush any pending saves for the CURRENT/OLD map before switching
      // This prevents the debounced save from writing cleared state to the old file
      try {
        // Force immediate save of current state to the old map file
        await this.store.flushStorage();
      } catch (flushError) {
        console.warn('[MapService] Could not flush pending saves:', flushError);
      }
      if (isSuperseded()) return null;

      // From here the store no longer holds the previous map. Until this load has
      // finished it holds no loaded map at all, so nothing it contains is saved.
      storeState.setMapLoaded(false);
      this.currentMapFilePath = filePath;
      storeState.setMapPath(filePath);

      // Clear the store state so nothing bleeds between maps
      storeState.clearMapState();

      // Clear the undo/redo history when loading a new map and pause tracking
      // so the setup writes below never become undo steps
      const history = getHistoryStore(this.store)?.getState();
      history?.clear();
      history?.pause();
      
      // Update loading progress
      storeState.setMapLoading(true, 20, t('map.clearing'));
      
      // Update loading progress
      storeState.setMapLoading(true, 40, t('map.loadingImage'));
      
      // Load and display the map in the renderer
      // Note: this loads the actual map image and sets up the grid
      const displayed = await MapController.loadAndDisplay(
        this.app,
        renderer,
        filePath,
        camera,
        isSuperseded,
      );
      if (!displayed) return null;
      this.currentMapData = displayed.mapData;
      // The tiles in view load meanwhile; the loading screen stays until they are drawn, or for a while.
      const mapImage = renderer.getMapImage();
      const imageReady = mapImage ? mapImage.whenCameraReady(MAP_IMAGE_READY_MS) : null;

      if (this.currentMapData) {
        // Update loading progress
        storeState.setMapLoading(true, 60, t('map.restoring'));
        
        // Set the background from loaded map data BEFORE rehydration
        // This ensures we have a valid background even if rehydration fails
        if (this.currentMapData.background) {
          storeState.setBackground(this.currentMapData.background);
        }
        
        // Re-hydrate persisted state for this map now that the path is known. A file whose
        // state the store did not take fails the load here: the store must not be saved over it.
        await this.store.rehydrateFromFile(isSuperseded);
        // Rehydration that was under way has written to the store; the load that replaced this one clears it
        if (isSuperseded()) return null;

        // The file may have been renamed while the image loaded (the store follows it) or be gone.
        // Without a file there was nothing to restore, and saving the store would create one.
        const mapPath = this.store.getState().mapPath;
        if (!mapPath || !this.app.vault.getAbstractFileByPath(mapPath)) {
          throw new Error('[MapService] The scene file was moved or deleted while it opened');
        }

        // NOW re-enable persistence after successful rehydration
        storeState.setPersistenceEnabled(true);
        
        // Update loading progress
        storeState.setMapLoading(true, 80, t('map.loadingTokens'));

        // After rehydration, populate what it did not load from the map file data
        fillStoreFromMapFile(this.store, this.currentMapData);
      } else {
        // Failed to load map data, re-enable persistence anyway
        storeState.setPersistenceEnabled(true);
        throw new Error('[MapService] Failed to load map data from MapController');
      }
      
      if (this.store.getState().grid?.autoDetect) {
        storeState.setMapLoading(true, 85, t('map.detectingGrid'));
        // Let the overlay paint before the CPU-bound detection blocks the thread.
        await new Promise(resolve => window.setTimeout(resolve, 30));
        if (isSuperseded()) return null;
        const detection = await autoDetectGridOnFirstLoad(this.store, mapImage, () => !isSuperseded());
        if (isSuperseded()) return null;
        this.showDetectedStretch(renderer, camera === null);
        if (detection === 'none') offerGridAlignment(this.store);
      }

      // Legacy mapData is now mostly for the renderer
      // The state is managed by the persist middleware      
      // Update loading progress
      const finalState = this.store.getState();
      const tokenCount = Object.keys(finalState.objects?.tokens || {}).length;
      const loadingMessage = tokenCount > 0 ? t('map.loadingNTokens', { count: tokenCount }) : t('map.finalizing');
      storeState.setMapLoading(true, 90, loadingMessage);
      
      // Get current grid settings from store (live settings) instead of static map file data
      const currentGridSettings = this.store.getState().grid;
      
      const mapInitData = {
        mapPath: this.currentMapFilePath || '',
        mapName: sceneNameOf(this.currentMapFilePath),
        background: this.currentMapData?.background,
        grid: currentGridSettings || this.currentMapData?.grid, // Use live grid settings if available
        tokens: finalState.objects?.tokens ?? {},
        fog: finalState.objects?.fog ?? {},
        tokenSettings: finalState.tokenSettings,
      };
      this.eventBus.emit('map-loaded', mapInitData);

      // map-loaded starts every token sprite synchronously, so the wait below sees all of them
      const revealMap = (): void => {
        // Tokens of a map that was left meanwhile must not end the next load's setup
        if (isSuperseded()) return;
        this.store.getState().setMapLoading(false);

        // Resume history tracking now that map load is complete
        getHistoryStore(this.store)?.getState().resume();
      };
      const hideLoadingScreen = (): void => {
        if (imageReady) void imageReady.then(revealMap);
        else revealMap();
      };
      this.eventBus.emit('wait-for-tokens-loaded', hideLoadingScreen);

      // Last: only a map that loaded completely may be saved to its file
      storeState.setMapLoaded(true);
      return this.currentMapData;
    } catch (error) {
      console.error('[MapService] Error loading map:', error);
      if (isSuperseded()) return null;
      this.recoverFromFailedLoad(rendererService, filePath, error);
      return null;
    }
  }

  /**
   * Draws the map with the stretch the grid found on a new scene's first load asks for. The load
   * showed the image before its grid was known, so the store's stretch is shown here, and a camera
   * that was fitted to the map is fitted again to its new size.
   */
  private showDetectedStretch(renderer: Pick<PixiRendererOrchestrator, 'getMapImage' | 'getViewportInstance'>, refit: boolean): void {
    const mapImage = renderer.getMapImage();
    if (!mapImage) return;
    const stretch = readMapStretch(this.store.getState().grid?.mapStretch);
    if (sameStretch(stretch, mapImage.mapStretch)) return;
    mapImage.setStretch(stretch);
    const viewport = renderer.getViewportInstance();
    const rect = mapImage.worldRect;
    if (refit && viewport && rect) fitMapRect(viewport, rect);
  }

  /** Tells the user and leaves the view ready for another load. */
  private recoverFromFailedLoad(rendererService: RendererService, filePath: string, error: unknown): void {
    // Without this the view only shows an empty canvas
    const reason = describeError(error).replace(/^\[\w+\]\s*/, '');
    new Notice(t('map.openFailed', { name: sceneNameOf(filePath), reason }), 0);

    // A load that failed before it switched the store leaves the previous map open and saved as before
    const mapStillLoaded = this.store.getState().mapLoaded;
    const history = getHistoryStore(this.store)?.getState();
    try {
      if (!mapStillLoaded) {
        this.currentMapFilePath = null;
        this.currentMapData = null;
        // The image of the map before must not stay on the canvas without its fog and tokens
        rendererService.getRenderer()?.clearMapImage();
      }
      // One write, so a subscriber that throws cannot leave the store half reset. Unbinding
      // it from the file states what `mapLoaded` already enforces: this state is not the map's.
      this.store.setState({
        ...(mapStillLoaded ? {} : { mapPath: null, background: null }),
        persistenceEnabled: true,
        isMapLoading: false,
      });
    } finally {
      // Nothing of the load, nor its removal, is an edit to undo
      if (!mapStillLoaded) history?.clear();
      history?.resume();
    }
  }

  /**
   * Takes the store out of use before the scene's file is rewritten from outside: loads that
   * wait or run are stopped, and the store, left like a scene that is being closed, is no
   * longer saved. The caller loads the scene again afterwards.
   */
  public suspendForRewrite(): void {
    this.loads.cancel();
    const state = this.store.getState();
    if (state.mapLoaded) this.eventBus.emit('map-unloading');
    state.setMapLoaded(false);
  }

  /** Stops waiting and running loads; the map image belongs to the renderer, which releases it. */
  public destroy(): void {
    this.loads.cancel();
  }

  /** `loadMap` for a file of the vault. */
  public async loadMapFromFile(rendererService: RendererService, file: TFile, camera: ViewCamera | null = null): Promise<MapFile | null> {
    return this.loadMap(rendererService, file.path, camera);
  }

  /** The data of the loaded map, or null if none is loaded. */
  public getCurrentMapData(): MapFile | null {
    return this.currentMapData;
  }
  
  /** The path of the loaded map, or null if none is loaded. */
  public getCurrentMapFilePath(): string | null {
    return this.currentMapFilePath;
  }

  /** Keeps the loaded map's path current when its file is renamed. */
  public handleFileRenamed(oldPath: string, newPath: string): void {
    if (this.currentMapFilePath === oldPath) this.currentMapFilePath = newPath;
  }
  
  public isMapLoaded(): boolean {
    return this.currentMapData !== null;
  }
}
