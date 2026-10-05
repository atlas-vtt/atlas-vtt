import { App } from 'obsidian';
import type AtlasVTTPlugin from '../../../main';
import { EventEmitter } from 'events';
import { RendererService } from './RendererService';
import { LayerGraph } from './LayerGraph';
import { UIOverlay } from './UIOverlay';
import { MapService } from './MapService';
import { ToolController } from './ToolController';
import { GridManager } from './GridManager';
import { NotePreviewUIManager } from './NotePreviewUIManager';
import { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';
import { MapThumbnailService, dataUrlToBytes, type ThumbnailSize } from './MapThumbnailService';
import { SceneThumbnailUpdater } from './SceneThumbnailUpdater';
import { WidgetSyncService } from './WidgetSyncService';
import { SoundEffectService } from './SoundEffectService';
import { DiceToastObserver } from './DiceToastObserver';
import type { ViewAtlasStore } from '../storeFactory';

/**
 * ServiceManager serves as a central registry for all Atlas services
 * It provides a single point of access to all services and manages their lifecycle
 */
export class ServiceManager {
  private eventBus: EventEmitter;
  private rendererService: RendererService;
  private layerGraph: LayerGraph;
  private uiOverlay: UIOverlay;
  private mapService: MapService;
  private toolController: ToolController;
  private gridManager: GridManager | null = null;
  private notePreviewUIManager: NotePreviewUIManager;
  private assetService: AssetService | null = null;
  private settingsService: SettingsService;
  private mapThumbnailService: MapThumbnailService;
  private widgetSyncService?: WidgetSyncService;
  private soundEffectService: SoundEffectService;
  private diceToastObserver: DiceToastObserver;
  private viewId: string;
  private sceneThumbnails: SceneThumbnailUpdater;
  
  constructor(private app: App, private store: ViewAtlasStore, private plugin?: AtlasVTTPlugin, viewId?: string) {
    // Create event bus for inter-service communication
    this.eventBus = new EventEmitter();
    this.eventBus.setMaxListeners(30); // Increase max listeners

    // Store viewId
    this.viewId = viewId || `view-${Date.now()}`;

    // Share the plugin-wide settings service so every view sees the same settings. A second
    // instance would take over SettingsService.forApp and save stale values over the file.
    this.settingsService = plugin?.settingsService ?? SettingsService.forApp(app) ?? new SettingsService(app);

    // Initialize all services with the view store
    this.rendererService = new RendererService(app, this.eventBus, store, this.viewId, this.settingsService);
    this.layerGraph = new LayerGraph(this.eventBus);
    this.uiOverlay = new UIOverlay(app, this.eventBus, store);
    this.mapService = new MapService(app, this.eventBus, store);
    // Initialize SoundEffectService before ToolController
    this.soundEffectService = new SoundEffectService();
    this.diceToastObserver = new DiceToastObserver(this.soundEffectService, this.settingsService, this.eventBus);

    this.toolController = new ToolController(this.eventBus, app, store);

    this.gridManager = new GridManager(this.eventBus);

    this.notePreviewUIManager = new NotePreviewUIManager(app, this.eventBus, store, this.viewId);

    this.assetService = AssetService.getInstance(app);
    this.mapThumbnailService = new MapThumbnailService(app);

    void Promise.all([this.settingsService.initialize(), this.assetService.initialize()]);
    
    this.sceneThumbnails = new SceneThumbnailUpdater(store, {
      render: () => this.renderMapThumbnail(),
      save: (mapPath, bytes) => this.mapThumbnailService.saveThumbnail(mapPath, bytes),
      hasThumbnail: (mapPath) => this.mapThumbnailService.hasThumbnail(mapPath),
    });
    
    // Initialize widget sync service if plugin is available
    if (plugin) {
      // Get or create singleton widget sync service from plugin
      plugin.widgetSyncService ??= new WidgetSyncService(plugin);
      this.widgetSyncService = plugin.widgetSyncService;

      // Register this store with widget sync
      this.widgetSyncService.registerStore(this.viewId, store);
    }
    
  }
  
  /**
   * Get the renderer service
   */
  public getRendererService(): RendererService {
    return this.rendererService;
  }
  
  /**
   * Get the layer graph
   */
  public getLayerGraph(): LayerGraph {
    return this.layerGraph;
  }
  
  /**
   * Get the UI overlay
   */
  public getUIOverlay(): UIOverlay {
    return this.uiOverlay;
  }
  
  /**
   * Get the map service
   */
  public getMapService(): MapService {
    return this.mapService;
  }
  
  /**
   * Get the tool controller
   */
  public getToolController(): ToolController {
    return this.toolController;
  }
  
  /**
   * Get the grid manager (may be null if gridSystem feature is disabled)
   */
  public getGridManager(): GridManager | null {
    return this.gridManager;
  }

  /**
   * Get the note preview UI manager
   */
  public getNotePreviewUIManager(): NotePreviewUIManager {
    return this.notePreviewUIManager;
  }

  /**
   * Get the asset service (may be null if assetManager feature is disabled)
   */
  public getAssetService(): AssetService | null {
    return this.assetService;
  }

  /**
   * Get the settings service
   */
  public getSettingsService(): SettingsService {
    return this.settingsService;
  }
  
  /**
   * Get the sound effect service
   */
  public getSoundEffectService(): SoundEffectService {
    return this.soundEffectService;
  }
  
  /**
   * Get the event bus
   * This allows services to subscribe to events from other services
   */
  public getEventBus(): EventEmitter {
    return this.eventBus;
  }
  
  /**
   * Get the store instance for this view
   */



  public getStore(): ViewAtlasStore {
    return this.store;
  }
  
  /** The map as it looks now as JPEG bytes: a scene card thumbnail by default, or `size`, e.g. 16:9 for a snapshot card. */
  public renderMapThumbnail(size?: ThumbnailSize): ArrayBuffer | null {
    const renderer = this.rendererService.getRenderer();
    const pixiApp = renderer?.getAppInstance();
    const viewport = renderer?.getViewportInstance();
    if (!renderer || !pixiApp || !viewport) return null;

    const dataUrl = this.mapThumbnailService.renderThumbnail(
      pixiApp, viewport, renderer.getBackgroundSprite(), size, (frame, render) => renderer.captureSceneFrame(frame, render),
    );
    return dataUrl ? dataUrlToBytes(dataUrl) : null;
  }

  /** Writes the scene's thumbnail now if an edit left it out of date; call before the view shows another scene. */
  public flushSceneThumbnail(): void {
    this.sceneThumbnails.flush();
  }

  /**
   * Cleanup all services
   * This should be called when the view is closed
   */
  public destroy(): void {
    // Unregister from widget sync
    if (this.widgetSyncService) {
      this.widgetSyncService.unregisterStore(this.viewId);
    }
    
    // Writes a pending thumbnail, so it must run while the renderer still shows the scene
    this.sceneThumbnails.destroy();

    // Destroy services in reverse order of dependency
    this.diceToastObserver.destroy();
    this.soundEffectService.destroy();
    this.toolController.destroy();
    this.rendererService.destroy();
    this.layerGraph.destroy();
    this.uiOverlay.unmount();
    this.mapService.destroy();
    this.notePreviewUIManager.destroy();

    // Remove all event listeners
    this.eventBus.removeAllListeners();
    
  }
}
