import { createSceneSource } from './plugin/host/sceneSource';
import { canRunMapHotkeys, matchesMapHotkey } from './keyboard/mapHotkeys';
import { SettingsService, type AtlasSettings } from './services/SettingsService';
import { DEFAULT_LASER_POINTER_SETTINGS } from './tools/laserPointerSettings';
import { Application, Sprite, Container, type FederatedPointerEvent } from "pixi.js";
import { runInBackground } from './utils/backgroundTask';
import { Viewport } from "pixi-viewport"; // Keep for type, but instance comes from PixiAppManager
import { WorkspaceLeaf } from 'obsidian';
import { GridOptions, GridSystem, GridType } from "./grid/GridSystem";
import { parseGridColor } from "./grid/gridContrastColor";
import { cellNumberStyleOfGrid } from "./grid/cellNumbering";
import type { App } from 'obsidian';
import type { ViewAtlasState, ViewAtlasStore } from './storeFactory';
import { EventEmitter } from 'events';
import { PixiAppManager } from "./pixi/PixiAppManager"; // Import the new manager
import { TokenRenderer } from "./pixi/token-renderer"; // Import TokenRenderer
// Import color utils
import { PinRenderer } from "./pixi/PinRenderer"; // Import PinRenderer
import { HexLinkRenderer } from "./pixi/hexLinks/HexLinkRenderer";
import { HexLinkInteraction } from "./pixi/hexLinks/HexLinkInteraction";
import type { MapRect } from "./grid/cellNumbering";
import type { NotePin } from "./types";
import { captureBeforeRender, captureWithLayerVisibility, type LayerVisibility } from "./pixi/playerSafeFrame";
import type { PlayerCameraState } from "./local-player-view";
import { SelectionManager } from "./pixi/SelectionManager"; // Import SelectionManager
import { FogOfWarRenderer } from "./pixi/fog/FogOfWarRenderer";
import { MeasureRenderer } from "./pixi/MeasureRenderer"; // Import MeasureRenderer
import { measurePlayersView } from './pixi/measurePlayersView';
import { NOTHING_SEEN } from './pixi/token-renderer/PlayerSightTokens';
import type { TokenPerception } from './vision/tokenPerception';
import { LaserPointerRenderer } from "./pixi/LaserPointerRenderer"; // Import LaserPointerRenderer
import { DrawingRenderer } from "./pixi/DrawingRenderer"; // Import DrawingRenderer
import { DrawingInteraction } from "./pixi/DrawingInteraction";
import { TextRenderer } from "./pixi/TextRenderer"; // Import TextRenderer
import { TextTool } from "./tools/TextTool"; // Import TextTool
import type { LightingController } from './pixi/lighting/LightingController';
import { LightingFeature } from './pixi/lighting/LightingFeature';
import type { SceneFrame } from './pixi/lighting/engine/types';
import { captureSceneFrame } from './pixi/sceneFrameCapture';
import { AudioTool } from './tools/AudioTool';
import { openAudioConfigPanel } from './pixi/audio/AudioConfigPanel';
import { AudioRenderer } from './pixi/audio/AudioRenderer';
import { SoundRegistry } from './audio/SoundRegistry';
import { AudioBufferCache } from './audio/AudioBufferCache';
import { SpatialAudioEngine } from './audio/SpatialAudioEngine';
import { AssetService } from './services/AssetService';
import { mapMeasurementSettings } from './services/mapMeasurementSettings';
import { findAtlasLeafByViewId } from './utils/atlasLeafLookup';
import { destroyTree } from './pixi/utils/destroyTree';
import { requestRender } from './pixi/RenderScheduler';
import { MAP_LAYER_Z } from './pixi/mapLayerOrder';
import { shownRollTokens } from './pixi/playerRollTokens';
import type { ShownRollToken } from './services/playerRollSource';
import { t } from './i18n';

export class PixiRendererOrchestrator { // Renamed class
  private _isDestroyed: boolean = false;
  private pixiAppManager: PixiAppManager;
  private tokenRenderer?: TokenRenderer; // Add TokenRenderer instance
  private pinRenderer?: PinRenderer; // Add PinRenderer instance
  private hexLinkRenderer?: HexLinkRenderer;
  private hexLinkInteraction?: HexLinkInteraction;
  private selectionManager?: SelectionManager; // Add SelectionManager instance
  private fogRenderer?: FogOfWarRenderer; // Add FogRenderer instance
  private measureRenderer?: MeasureRenderer; // Add MeasureRenderer instance
  /** Ends the measurements' watch on what the players see of the tokens. */
  private stopMeasuresFollowingPlayers: (() => void) | undefined;
  private laserPointerRenderer?: LaserPointerRenderer; // Add LaserPointerRenderer instance
  private drawingRenderer?: DrawingRenderer; // Add DrawingRenderer instance
  private drawingInteraction?: DrawingInteraction;
  private textRenderer?: TextRenderer; // Add TextRenderer instance
  private textTool?: TextTool; // Add TextTool instance
  /** The view's lighting, built and removed as the GM switches dynamic lighting on and off. */
  private lightingFeature?: LightingFeature;
  private get lighting(): LightingController | undefined {
    return this.lightingFeature?.controller;
  }
  private audioRenderer?: AudioRenderer;
  private audioTool?: AudioTool;
  private soundRegistry?: SoundRegistry;
  private bufferCache?: AudioBufferCache;
  private spatialAudioEngine?: SpatialAudioEngine;

  private layerMap: Container | null = null;
  private layerGrid: Container | null = null;
  private layerTemplate: Container | null = null;
  private layerLighting: Container | null = null;
  private layerFog: Container | null = null; // Add fog layer
  private gridSystem?: GridSystem; // Instance of GridSystem
  private backgroundSprite: Sprite | null = null;
  private obsApp: App;
  private eventBus: EventEmitter;
  private activeHoverLinkAnchorEl: HTMLElement | null = null;
  private notePreviewEl: HTMLDivElement | null = null;
  private notePreviewLeaf: WorkspaceLeaf | null = null;
  private isPreviewPinned: boolean = false;
  private _isShowingPreview: boolean = false;
  private store: ViewAtlasStore; // Add store
  private _unsubscribeFromToolChanges?: () => void; // Add tool subscription cleanup
  private _unsubscribeFromGridVisibility?: () => void; // Add grid visibility subscription cleanup
  private viewId: string;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private getViewportPositionHandler: ((e: WindowEventMap['get-viewport-position']) => void) | null = null;
  private eventBusUnsubscribers: Array<() => void> = [];
  private gridInitRetryTimeout: number | null = null;
  /** Screen-space overlays that exist only for the DM, such as tool previews. */
  private readonly dmScreenOverlays = new Set<Container>();

  private getSourceLeaf(): WorkspaceLeaf | null {
    return findAtlasLeafByViewId(this.obsApp.workspace, this.viewId);
  }

  // Getter for the viewport, now from PixiAppManager
  private get viewport(): Viewport | null {
    return this.pixiAppManager.getViewport();
  }

  // Getter for the application, now from PixiAppManager
  private get app(): Application {
    return this.pixiAppManager.getApp();
  }


  constructor(
    obsApp: App, 
    pixiAppManager: PixiAppManager, 
    eventBus: EventEmitter,
    store: ViewAtlasStore,
    viewId: string
  ) {
    this.obsApp = obsApp;
    this.pixiAppManager = pixiAppManager;
    this.eventBus = eventBus; 
    this.store = store;
    this.viewId = viewId;
    this.setupEventBusListeners(); // Call this to set up other listeners if any
  }

  async init(containerEl: HTMLElement): Promise<void> {
    if (this._isDestroyed) return;
    try {
      await this.pixiAppManager.init(containerEl);
      
      // Wait for viewport to be available with multiple retry attempts
      let retryCount = 0;
      const maxRetries = 10;
      const retryDelay = 100; // 100ms between retries
      
      while (!this.viewport && retryCount < maxRetries) {
        await new Promise(resolve => window.setTimeout(resolve, retryDelay));
        retryCount++;
      }
      
      const currentViewport = this.viewport; // this.viewport is a getter
      if (!currentViewport) {
        console.error("[PixiRendererOrchestrator] Viewport not available after", maxRetries, "retries.");
        // Try to force viewport creation
        this.pixiAppManager.initViewport();
        await new Promise(resolve => window.setTimeout(resolve, 100));
        
        if (!this.viewport) {
          console.error("[PixiRendererOrchestrator] Failed to create viewport even after forced initialization.");
          return;
        }
      }
      
      // Subscribe to tool changes from the isolated view store
      this._unsubscribeFromToolChanges = this.store.subscribe(
        (state: ViewAtlasState) => state.activeTool,
        (tool) => {
          if (!this.viewport) return;

          // Handle text tool activation/deactivation
          if (tool === 'text' && this.textTool) {
            this.textTool.activate();
          } else if (this.textTool) {
            this.textTool.deactivate();
          }

          // Laser pointer activation/cursor is self-managed by LaserPointerRenderer
        },
        { fireImmediately: true }
      );
      
      // Subscribe to grid changes (including visibility and offset)
      this._unsubscribeFromGridVisibility = this.store.subscribe(
        (state: ViewAtlasState) => state.grid,
        (grid) => {
          if (this.gridSystem && grid) {
            
            // Get current options BEFORE any updates to compare what actually changed
            const currentOptions = this.gridSystem.getOptions();
            const gridColorNum = parseGridColor(grid.color);

            const visibleChanged = grid.visible !== undefined && grid.visible !== currentOptions.enabled;
            const typeChanged = grid.type !== undefined && grid.type !== currentOptions.type;
            const offsetXChanged = grid.offsetX !== undefined && grid.offsetX !== currentOptions.offsetX;
            const offsetYChanged = grid.offsetY !== undefined && grid.offsetY !== currentOptions.offsetY;
            const sizeChanged = grid.size !== undefined && grid.size !== currentOptions.size;
            const opacityChanged = grid.opacity !== undefined && grid.opacity !== currentOptions.alpha;
            const lineWidthChanged = grid.lineWidth !== undefined && grid.lineWidth !== currentOptions.lineWidth;
            const lineTypeChanged = grid.lineType !== undefined && grid.lineType !== currentOptions.lineType;
            const colorChanged = gridColorNum !== currentOptions.color;
            const cellNumbers = cellNumberStyleOfGrid(grid);
            const cellNumberFormatChanged = cellNumbers?.format !== currentOptions.cellNumbers?.format;
            const cellNumberOpacityChanged = cellNumbers?.opacity !== currentOptions.cellNumbers?.opacity;

            const hasChanges = visibleChanged || typeChanged || offsetXChanged || offsetYChanged ||
                             sizeChanged || opacityChanged || lineWidthChanged || lineTypeChanged || colorChanged ||
                             cellNumberFormatChanged || cellNumberOpacityChanged;
            
            if (!hasChanges) {
              return;
            }
            
            // Batch all updates into a single options update to avoid multiple recreations
            const updates: Partial<GridOptions> = {};
            let needsOptionsUpdate = false;
            
            // Handle visibility separately as it uses setEnabled
            const visible = typeof grid.visible === 'boolean' ? grid.visible : true;
            if (visible !== currentOptions.enabled) {
              this.gridSystem.setEnabled(visible);
            }
            
            // Collect all other updates
            if (grid.type !== undefined && grid.type !== currentOptions.type) {
              updates.type = grid.type;
              needsOptionsUpdate = true;
            }
            if (typeof grid.offsetX === 'number' && grid.offsetX !== currentOptions.offsetX) {
              updates.offsetX = grid.offsetX;
              needsOptionsUpdate = true;
            }
            if (typeof grid.offsetY === 'number' && grid.offsetY !== currentOptions.offsetY) {
              updates.offsetY = grid.offsetY;
              needsOptionsUpdate = true;
            }
            if (typeof grid.size === 'number' && grid.size !== currentOptions.size) {
              updates.size = grid.size;
              needsOptionsUpdate = true;
            }
            if (typeof grid.opacity === 'number' && grid.opacity !== currentOptions.alpha) {
              updates.alpha = grid.opacity;
              needsOptionsUpdate = true;
            }
            if (colorChanged) {
              updates.color = gridColorNum;
              needsOptionsUpdate = true;
            }
            if (cellNumberFormatChanged) {
              updates.cellNumbers = cellNumbers;
              needsOptionsUpdate = true;
            } else if (cellNumbers && cellNumberOpacityChanged) {
              this.gridSystem.setCellNumberOpacity(cellNumbers.opacity);
            }
            if (grid.lineType !== undefined && grid.lineType !== currentOptions.lineType) {
              updates.lineType = grid.lineType;
              needsOptionsUpdate = true;
            }
            if (typeof grid.lineWidth === 'number' && grid.lineWidth !== currentOptions.lineWidth) {
              updates.lineWidth = grid.lineWidth;
              needsOptionsUpdate = true;
            }
            
            // Apply all updates at once
            if (needsOptionsUpdate) {
              this.gridSystem.updateOptions(updates);
              
              // Re-snap all tokens to the new grid if grid type, size, or offset changed
              if (updates.type || updates.size || updates.offsetX !== undefined || updates.offsetY !== undefined) {
                // If grid size or type changed, update all token sizes
                // Note: We check for type changes too since hex grids require different sizing
                if ((updates.size || updates.type) && this.tokenRenderer) {
                  this.tokenRenderer.updateAllTokenSizes();
                }
                
                this.resnapTokensToGrid();
              }
            }
          }
        },
        { fireImmediately: false } // Don't fire immediately, let initGrid handle initial state
      );
      
      if (currentViewport) {
        this.setupRenderersAndManagers(currentViewport);
      }
      // initPinContainer is now effectively handled by PinRenderer's constructor

      // Listen for requests to get viewport position for UI elements
      // Store the handler for cleanup
      this.getViewportPositionHandler = (e): void => {
        const vp = this.viewport; // Use getter
        if (!vp) return;
        const detail = e.detail;
        if (detail && typeof detail.callback === 'function') {
          let clientX, clientY;
          if (typeof detail.worldX === 'number' && typeof detail.worldY === 'number') {
            const screenPos = vp.toScreen(detail.worldX, detail.worldY);
            clientX = screenPos.x;
            clientY = screenPos.y;
          } else {
            console.warn('[PixiRendererOrchestrator] get-viewport-position event had no worldX/Y.');
            clientX = vp.screenWidth / 2;
            clientY = vp.screenHeight / 2;
          }
          detail.callback(clientX, clientY);
        }
      };
      window.addEventListener('get-viewport-position', this.getViewportPositionHandler);

      // Add keyboard handler for escape key to clear selection
      this.setupKeyboardHandlers();
      
      // Drawing tool event handlers will be attached dynamically when needed
      
    } catch (error) {
      console.error("[PixiRendererOrchestrator] Initialization error:", error);
      throw error;
    }
  }
  
  private setupRenderersAndManagers(viewport: Viewport): void {
    // The map sprite draws the background; the canvas around it stays black
    this.pixiAppManager.app.renderer.background.color = 0x000000;
    requestRender(this.pixiAppManager.app);
    
    // Initialize TokenRenderer first if GridSystem is ready
    // This also means tokenContainer will be added to viewport earlier
    if (this.gridSystem) {
        this.tokenRenderer = new TokenRenderer(
            this.obsApp,
            viewport,
            this.gridSystem,
            () => this.selectionManager?.updateSelectionOverlay(),
            this.store,
            this.eventBus,
            this.viewId
        );
        // Set PIXI app reference for renderer access
        this.tokenRenderer.setPixiApp(this.pixiAppManager.app);
    } else {
        // GridSystem not ready yet - TokenRenderer will be initialized later in initGrid()
    }

    // Initialize PinRenderer first
    // Check if this is a player view through the store
    const isPlayerView = this.store.getState().isPlayerView || false;
    this.pinRenderer = new PinRenderer(viewport, this.eventBus, this.store, isPlayerView);

    this.hexLinkRenderer = new HexLinkRenderer({
      viewport,
      store: this.store,
      eventBus: this.eventBus,
      getMapRect: () => this.getMapRect(),
    });
    viewport.addChild(this.hexLinkRenderer.container);
    this.hexLinkInteraction = new HexLinkInteraction({
      viewport,
      store: this.store,
      renderer: this.hexLinkRenderer,
      onNoteHover: (type, pin, e) => this.emitNoteHover(type, pin, e),
    });

    this.selectionManager = new SelectionManager(
        viewport,
        () => this.tokenRenderer?.getTokenSprites() || {},
        () => this.fogRenderer?.getFogSprites() || {},
        this.store,
        this.eventBus
    );
    this.selectionManager.barsReachProvider = (tokenId) => this.tokenRenderer?.barsReach(tokenId) ?? 0;

    // Initialize FogOfWarRenderer after pins so it can be on top when active
    this.fogRenderer = new FogOfWarRenderer(viewport, this.app, this.eventBus, this.store);
    
    // Add fog layer to viewport - it should be on top for interaction when the fog tool is active
    const fogContainer = this.fogRenderer.getContainer();
    viewport.addChild(fogContainer);
    
    // Set the fog container to a high z-index to ensure it's on top when visible
    fogContainer.zIndex = 1000;

    if (!isPlayerView) {
      this.lightingFeature = new LightingFeature({
        viewport,
        app: this.pixiAppManager.app,
        store: this.store,
        eventBus: this.eventBus,
        obsApp: this.obsApp,
        viewId: this.viewId,
        bounds: () => this.getMapRect(),
        albedo: () => (this.backgroundSprite && !this.backgroundSprite.destroyed ? this.backgroundSprite.texture : null),
        grid: () => this.gridSystem ?? null,
        fogCoverage: () => this.fogRenderer!.getCommittedCoverage(),
      });
    }

    // Initialize Audio system
    this.audioRenderer = new AudioRenderer(viewport, this.store);
    this.audioTool = new AudioTool(this.eventBus);

    // Initialize SoundRegistry and SpatialAudioEngine
    const pluginDir = this.store.getState().plugin?.manifest?.dir ?? `${this.obsApp.vault.configDir}/plugins/atlas-vtt`;
    this.soundRegistry = new SoundRegistry(this.obsApp, pluginDir);
    void this.soundRegistry.scanCustomSounds();
    this.bufferCache = new AudioBufferCache(new AudioContext(), this.obsApp, this.soundRegistry);
    this.spatialAudioEngine = new SpatialAudioEngine(this.store, this.bufferCache);


    // Wire viewport-level event dispatch providers (only if TokenRenderer is available now;
    // otherwise initGrid() will wire them when TokenRenderer is created later)
    this.wireViewportDispatchProviders();

    // Initialize MeasureRenderer if GridSystem is ready
    if (this.gridSystem) {
      this.measureRenderer = new MeasureRenderer(viewport, this.eventBus, this.store, this.gridSystem);
      this.wireMeasureRendererProvider();
    }
    
    // The laser reads only the active tool.
    this.laserPointerRenderer = new LaserPointerRenderer(
      viewport, this.app, createSceneSource(this.store, state => state.activeTool),
      this.pixiAppManager.getCanvasElement(),
      // Looked up on every draw: a plugin reload replaces the settings service.
      () => SettingsService.forApp(this.obsApp)?.getLaserPointerSettings() ?? DEFAULT_LASER_POINTER_SETTINGS,
    );
    const laserPointerContainer = this.laserPointerRenderer.getContainer();
    viewport.addChild(laserPointerContainer);
    laserPointerContainer.zIndex = 2000;

    // Initialize DrawingRenderer (ink strokes; self-manages activation via store subscription)
    this.drawingRenderer = new DrawingRenderer(viewport, this.eventBus, this.store);
    this.drawingInteraction = new DrawingInteraction(viewport, this.store);
    const drawingContainer = this.drawingRenderer.getContainer();
    viewport.addChild(drawingContainer);
    // Above tokens/text, below fog so hidden areas stay hidden
    drawingContainer.zIndex = 900;
    
    // Initialize TextRenderer if GridSystem is ready
    if (this.gridSystem) {
      this.textRenderer = new TextRenderer(
        viewport,
        this.gridSystem,
        () => this.selectionManager?.updateSelectionOverlay(),
        this.store,
        isPlayerView
      );
      // Add text container to viewport
      const textContainer = this.textRenderer.getContainer?.() || viewport.children.find(child => child.label === 'textContainer');
      if (textContainer) {
        textContainer.zIndex = MAP_LAYER_Z.text;
      }
    }
    
    
    // Initialize TextTool
    if (this.gridSystem && !isPlayerView) {
      this.textTool = new TextTool(viewport, this.store, this.gridSystem, this.eventBus);
    }
    
  }

  public initGrid(options: GridOptions, bgSprite: Sprite): void {
    const currentViewport = this.viewport;
    if (!currentViewport) return;
    if (!bgSprite) return;
    this.backgroundSprite = bgSprite;

    // Check if sprite is ready before initializing grid
    if (!bgSprite.width || !bgSprite.height || bgSprite.width <= 0 || bgSprite.height <= 0) {
      if (this.gridInitRetryTimeout) {
        window.clearTimeout(this.gridInitRetryTimeout);
        this.gridInitRetryTimeout = null;
      }

      // Wait for sprite to be ready
      const checkAndInitGrid = () => {
        if (this._isDestroyed || this.backgroundSprite !== bgSprite) {
          this.gridInitRetryTimeout = null;
          return;
        }

        if (bgSprite.width > 0 && bgSprite.height > 0) {
          this.gridInitRetryTimeout = null;
          this._initGridInternal(options, bgSprite);
        } else {
          // Check again after a short delay
          this.gridInitRetryTimeout = window.setTimeout(checkAndInitGrid, 50);
        }
      };
      
      this.gridInitRetryTimeout = window.setTimeout(checkAndInitGrid, 50);
      return;
    }

    if (this.gridInitRetryTimeout) {
      window.clearTimeout(this.gridInitRetryTimeout);
      this.gridInitRetryTimeout = null;
    }
    
    this._initGridInternal(options, bgSprite);
  }
  
  private _initGridInternal(options: GridOptions, bgSprite: Sprite): void {
    const currentViewport = this.viewport;
    const currentApp = this.app;
    if (!currentViewport || !bgSprite) return;
    
    if (!this.gridSystem) {
      this.gridSystem = new GridSystem(currentApp, currentViewport, bgSprite, options);
      // Apply current grid visibility state from store
      const currentState = this.store.getState();
      const grid = currentState.grid;
      const gridVisible = grid && typeof grid.visible === 'boolean' ? grid.visible : true;
      this.gridSystem.setEnabled(gridVisible);
    } else {
      this.gridSystem.updateBackgroundSprite(bgSprite);
      // Only update options that have changed, preserving offset if not provided
      const currentOptions = this.gridSystem.getOptions();
      const mergedOptions: GridOptions = {
        ...currentOptions,
        ...options,
        // Preserve current offset unless explicitly provided in options
        offsetX: options.offsetX !== undefined ? options.offsetX : currentOptions.offsetX || 0,
        offsetY: options.offsetY !== undefined ? options.offsetY : currentOptions.offsetY || 0
      };
      this.gridSystem.updateOptions(mergedOptions);
      
      // If we have a tokenRenderer and grid size or type changed, update token sizes
      if (this.tokenRenderer && (options.size !== undefined || options.type !== undefined)) {
        this.tokenRenderer.updateAllTokenSizes();
      }
    }
    
    // Ensure TokenRenderer is initialized or updated if gridSystem was just created/updated
    if (!this.tokenRenderer && this.gridSystem && currentViewport) {
        this.tokenRenderer = new TokenRenderer(
            this.obsApp,
            currentViewport,
            this.gridSystem,
            () => this.selectionManager?.updateSelectionOverlay(), // Pass callback to SelectionManager
            this.store,
            this.eventBus,
            this.viewId
        );
        // Set PIXI app reference for renderer access
        this.tokenRenderer.setPixiApp(this.pixiAppManager.app);
        // Wire viewport-level dispatch providers (fog, pins, selection hit-testing)
        this.wireViewportDispatchProviders();
        // Re-order SelectionManager listeners so they fire after TokenRenderer's viewport handlers
        this.selectionManager?.reorderViewportListeners();
        // If tokens were just initialized, re-ensure pins are on top
        if (this.pinRenderer && this.pinRenderer.getPinContainer().parent) {
            currentViewport.removeChild(this.pinRenderer.getPinContainer());
        }
        if (this.pinRenderer) {
            currentViewport.addChild(this.pinRenderer.getPinContainer());
        }
    } else if (this.tokenRenderer && this.gridSystem) {
        // If TokenRenderer exists, ensure it has the latest gridSystem if it was re-created (though not typical)
        // And ensure the callback is correctly wired if SelectionManager was created after TokenRenderer
        // For simplicity, we assume gridSystem isn't re-created, just updated.
        // And TokenRenderer is given the callback at its creation.
    }
    
    // Initialize or update MeasureRenderer if it doesn't exist yet
    if (!this.measureRenderer && this.gridSystem && currentViewport) {
      this.measureRenderer = new MeasureRenderer(currentViewport, this.eventBus, this.store, this.gridSystem);
      this.wireMeasureRendererProvider();
    }
    
    // Initialize TextRenderer if it doesn't exist yet
    const isPlayerView = this.store.getState().isPlayerView || false;
    if (!this.textRenderer && this.gridSystem && currentViewport) {
      this.textRenderer = new TextRenderer(
        currentViewport,
        this.gridSystem,
        () => this.selectionManager?.updateSelectionOverlay(),
        this.store,
        isPlayerView
      );
      // Add text container to viewport
      const textContainer = this.textRenderer.getContainer?.() || currentViewport.children.find(child => child.label === 'textContainer');
      if (textContainer) {
        textContainer.zIndex = MAP_LAYER_Z.text;
      }
    }
    
    // Initialize TextTool if it doesn't exist yet
    if (!this.textTool && this.gridSystem && !isPlayerView && currentViewport) {
      this.textTool = new TextTool(currentViewport, this.store, this.gridSystem, this.eventBus);
    }
    
  }

  public setBackgroundSprite(sprite: Sprite): void {
    const currentViewport = this.viewport;
    if (!currentViewport) return;

    const previous = this.backgroundSprite;
    this.backgroundSprite = sprite;
    // The texture of the sprite it replaces is unloaded by whoever loaded it
    if (previous && previous !== sprite) destroyTree(previous);
    this.lighting?.renderer.refreshBounds();

    // Ensure new background is at the bottom
    if (!sprite.parent) {
        currentViewport.addChildAt(sprite, 0);
    } else if (currentViewport.getChildAt(0) !== sprite) {
        currentViewport.setChildIndex(sprite, 0);
    }

    this.eventBus.emit('background-sprite-updated', {
      x: sprite.x,
      y: sprite.y,
      width: sprite.width,
      height: sprite.height,
    });

    if (this.gridSystem) {
      this.gridSystem.updateBackgroundSprite(sprite);
      // Don't pass empty options - this would reset the grid settings!
      // The updateBackgroundSprite call should trigger recreation with current options
    }
  }

  /**
   * Takes a background sprite off the map and destroys it. When it was the one
   * shown, the map has no background until `setBackgroundSprite` brings the next:
   * the grid and the lighting must not keep reading a destroyed sprite.
   */
  public removeBackgroundSprite(sprite: Sprite): void {
    if (this.backgroundSprite === sprite) {
      this.backgroundSprite = null;
      this.gridSystem?.clearBackgroundSprite();
      if (!this._isDestroyed) this.lighting?.renderer.refreshBounds();
      this.eventBus.emit('background-sprite-updated', undefined);
    }
    destroyTree(sprite);
  }

  /** Takes the map image off the canvas, as when its scene could not be opened. */
  public clearBackgroundSprite(): void {
    if (this.backgroundSprite) this.removeBackgroundSprite(this.backgroundSprite);
  }

  /** The map image in world space; null until it has loaded. */
  private getMapRect(): MapRect | null {
    const sprite = this.backgroundSprite;
    if (!sprite || sprite.destroyed || !(sprite.width > 0)) return null;
    return { x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height };
  }

  public toggleGrid(visible?: boolean): boolean {
    if (!this.gridSystem) return false;
    
    // If visible is undefined, toggle the current state
    const newState = visible !== undefined ? visible : !this.gridSystem.getOptions().enabled;
    this.gridSystem.setEnabled(newState);
    return newState;
  }

  public updateGrid(options: Partial<GridOptions>): void {
    if (!this.gridSystem) return;
    this.gridSystem.updateOptions(options);
  }

  /** Apply final grid alignment: update grid, resize + resnap all tokens. */
  public applyGridAlignment(size: number, offsetX: number, offsetY: number, type?: GridType): void {
    if (!this.gridSystem) return;

    this.gridSystem.updateOptions({ size, offsetX, offsetY, enabled: true, isAligning: false, ...(type ? { type } : {}) });

    if (this.tokenRenderer) {
      this.tokenRenderer.updateAllTokenSizes();
    }
    this.resnapTokensToGrid();
  }

  /** Cancel grid alignment: restore original grid values from the store. */
  public cancelGridAlignment(): void {
    if (!this.gridSystem) return;

    const grid = this.store.getState().grid;
    this.gridSystem.updateOptions({
      type: grid?.type ?? 'square',
      size: grid?.size || 50,
      offsetX: grid?.offsetX || 0,
      offsetY: grid?.offsetY || 0,
      enabled: grid?.visible !== false,
      isAligning: false,
    });
  }

  /** Shows `overlay` above the map in screen space and never in the player view. Returns the function that removes it again. */
  public addDmScreenOverlay(overlay: Container): () => void {
    this.app.stage.addChild(overlay);
    this.dmScreenOverlays.add(overlay);
    return () => {
      this.dmScreenOverlays.delete(overlay);
      overlay.parent?.removeChild(overlay);
    };
  }

  public getGridOptions(): GridOptions | null {
    return this.gridSystem?.getOptions() || null;
  }

  getAppInstance(): Application { return this.pixiAppManager.getApp(); }

  /**
   * Capture player settings without changing the DM's scene or preferences.
   * With `camera`, the frame is rendered from that camera instead of the DM's.
   * `renderFollows`: called right before the stage's own render, which puts the DM's frame back.
   */
  public withPlayerSafeFrame(capture: () => void, settings: AtlasSettings['localPlayerView'], camera?: PlayerCameraState, renderFollows = false): void {
    const app = this.pixiAppManager.getApp();
    if (!app?.renderer) return;
    const layers = this.markerLayers();
    const grid = this.gridSystem?.getGridSprite();
    if (grid) layers.push({ layer: grid, visible: settings.showGrid });
    // The lighting's part is the list session view holds on this canvas (`SessionLighting`).
    const sight = this.lighting?.playerSight();
    layers.push(...(this.tokenRenderer?.getPlayerViewLayers(settings, sight) ?? []));
    if (this.measureRenderer) layers.push(...this.measureRenderer.getPlayerViewLayers(this.playersSeeInFrame(sight)));
    layers.push(...(this.lighting?.playerLayers() ?? []));
    layers.push(...(this.fogRenderer?.getPlayerViewLayers() ?? []));
    layers.push(...(this.selectionManager?.getPlayerViewLayers() ?? []));
    for (const overlay of this.dmScreenOverlays) layers.push({ layer: overlay, visible: false });
    const viewport = this.pixiAppManager.getViewport();
    const playerCamera = camera && viewport ? { target: viewport, camera } : undefined;
    const captureFrame = renderFollows ? captureBeforeRender : captureWithLayerVisibility;
    captureFrame(layers, () => app.renderer.render(app.stage), capture, playerCamera);
  }

  /**
   * The tokens a players' frame of `mapPath` shows now, among `tokenIds` (all without), by
   * the perception `withPlayerSafeFrame` composes: for rolls to name. Nothing once the view
   * holds another scene, or none loaded.
   */
  public playerRollTokens(mapPath: string, tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    const tokens = this.tokenRenderer;
    if (!tokens || this._isDestroyed) return new Map();
    return shownRollTokens(this.store.getState(), mapPath, tokens.getTokenSprites(), () => tokens.playerFramePerception(this.lighting?.playerSight()), tokenIds);
  }

  /** Which tokens a players' frame shows, by the scene's `sight` with committed fog; none while there is no token renderer. */
  private playersSeeInFrame(sight: TokenPerception | undefined): (tokenId: string) => boolean {
    return this.tokenRenderer?.playersSeeInFrame(sight) ?? NOTHING_SEEN;
  }

  /** The GM's markers on the map: neither the players nor a picture of the scene show them. */
  private markerLayers(): LayerVisibility[] {
    const layers: LayerVisibility[] = [];
    if (this.pinRenderer) layers.push({ layer: this.pinRenderer.getPinContainer(), visible: false });
    if (this.hexLinkRenderer) layers.push({ layer: this.hexLinkRenderer.container, visible: false });
    return layers;
  }

  /**
   * Runs `render`, the off-screen render of a thumbnail's `frame`: always the GM's picture
   * (`gmViewLayers`), lit as the GM sees the scene, without the GM's overlays.
   */
  public captureSceneFrame<T>(frame: SceneFrame, render: () => T): T {
    return captureSceneFrame({ gmViewLayers: this.gmViewLayers(), markerLayers: this.markerLayers(), lighting: this.lighting }, frame, render);
  }

  /**
   * Tokens and fog as the GM view shows them, for a picture taken while the canvas is in session
   * view. Session view must hide through these layers' `visible` and `alpha`; what it hides in
   * another way is added here.
   */
  private gmViewLayers(): LayerVisibility[] {
    return [...(this.tokenRenderer?.getGmViewLayers() ?? []), ...(this.fogRenderer?.getGmViewLayers() ?? []), ...(this.measureRenderer?.getGmViewLayers() ?? [])];
  }

  getViewportInstance(): Viewport | null { return this.pixiAppManager.getViewport(); }
  getCanvasElement(): HTMLCanvasElement { return this.pixiAppManager.getCanvasElement(); }
  getGridSystem(): GridSystem | null { return this.gridSystem || null; }
  getBackgroundSprite(): Sprite | null { return this.backgroundSprite; }
  getTokenRenderer(): TokenRenderer | null { return this.tokenRenderer || null; }

  /**
   * Reinitialize viewport plugins after map switch to restore interactions
   * @deprecated Use full renderer recreation instead
   */
  public reinitializeViewportPlugins(): void {
  }

  resize(width: number, height: number): void {
    if (this._isDestroyed) return;
    this.pixiAppManager.resize(width, height);
  }
  
  private setupKeyboardHandlers(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canRunMapHotkeys(e, this.viewId)) return;
      const settings = SettingsService.forApp(this.obsApp);
      // Escape key
      if (matchesMapHotkey(e, 'cancel', settings)) {
        if (this.lighting?.handleEscape()) {
          e.preventDefault();
          return;
        }
        // The toolbar editor ends on this Escape (its own listener); the selection stays.
        if (this.store.getState().isToolbarEditing) return;
        // Clear token selection
        const selectedIds = this.store.getState().selectedIds;
        if (selectedIds.length > 0) {
          this.store.getState().clearSelection();
        }
      }
      
      // Enter closes the light zone being drawn
      if (e.key === 'Enter' && this.lighting?.handleEnter()) {
        e.preventDefault();
        return;
      }

      // Delete selected tokens on Delete or Backspace key
      if (!this.store.getState().isPlayerView && (matchesMapHotkey(e, 'delete', settings) || matchesMapHotkey(e, 'deleteAlt', settings))) {
        if (this.lighting?.handleDelete()) {
          e.preventDefault();
          return;
        }

        const selectedIds = this.store.getState().selectedIds;
        if (selectedIds.length > 0) {
          // Prevent the default behavior (like browser back navigation for Backspace)
          e.preventDefault();
          this.store.getState().deleteSelected();
        }
      }
    };
    
    this.keyboardHandler = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
  }
  

  /** Tells the note preview a pin or linked hex is hovered, so Cmd/Ctrl previews its note. */
  private emitNoteHover(type: 'over' | 'out', pin: NotePin, e?: FederatedPointerEvent): void {
    if (type === 'out') {
      this.eventBus.emit('pin-hide-preview', { pin });
      return;
    }
    // Only a pointer event places a preview; clearing a hover passes none
    if (!e) return;
    this.eventBus.emit('pin-hover-preview', {
      pin,
      screenX: e.clientX ?? e.global.x,
      screenY: e.clientY ?? e.global.y,
      pixiEvent: e,
      sourceLeaf: this.getSourceLeaf(),
    });
  }

  /** Wires viewport-level event dispatch providers between TokenRenderer and other renderers.
   *  Must be called after TokenRenderer is available (either from setupRenderersAndManagers or initGrid). */
  private wireViewportDispatchProviders(): void {
    if (!this.tokenRenderer) return;

    if (this.fogRenderer) {
      this.tokenRenderer.setFogCoverageProvider(() => this.fogRenderer!.getCommittedCoverage());
      this.tokenRenderer.setFogHitTestProvider(
        (x, y) => this.fogRenderer!.hitTestFog(x, y)
      );
      this.tokenRenderer.setFogClickHandler(
        (fogId, e) => this.fogRenderer!.handleViewportFogPointerDown(fogId, e)
      );
    }
    // DrawingInteraction is created after the first wiring pass, so resolve it lazily
    this.tokenRenderer.setDrawingHitTestProvider(
      (x, y) => this.drawingInteraction?.hitTest(x, y) ?? null
    );
    this.tokenRenderer.setDrawingClickHandler(
      (drawingId, e) => this.drawingInteraction?.handleViewportPointerDown(drawingId, e)
    );
    this.tokenRenderer.setDrawingDragStartHandler(
      (e) => this.drawingInteraction?.startDrag(e)
    );
    if (this.pinRenderer) {
      this.tokenRenderer.setPinHitTestProvider(
        (x, y) => this.pinRenderer!.hitTestPins(x, y)
      );
      this.tokenRenderer.setPinClickHandler(
        (pinId, e) => this.pinRenderer!.handleViewportPinPointerDown(pinId, e)
      );
      this.tokenRenderer.setPinHoverHandler((type, pinId, e) => {
        const pin = this.store.getState().objects.pins[pinId];
        if (pin) this.emitNoteHover(type, pin, e);
      });
    }
    if (this.hexLinkInteraction) {
      this.tokenRenderer.setHexLinkHandlers(this.hexLinkInteraction);
    }
    if (this.selectionManager) {
      this.selectionManager.setHitTestTokensProvider(
        (x, y) => this.tokenRenderer!.hitTestTokens(x, y)
      );
    }

    this.lightingFeature?.wire(this.tokenRenderer);

    // Wire audio tool viewport handlers
    if (this.audioRenderer && this.audioTool) {
      this.tokenRenderer.setAudioPointerDownHandler((worldX, worldY, _e) => {
        return this.handleAudioPointerDown(worldX, worldY);
      });
      this.tokenRenderer.setAudioPointerMoveHandler((_worldX, _worldY, _e) => {
        // Future: hover feedback for audio sources
      });
    }
  }

  /** Lets MeasureRenderer read the current map's measurement settings, and follow what the players see of the tokens. */
  private wireMeasureRendererProvider(): void {
    const measure = this.measureRenderer;
    if (!measure) return;
    const assetService = AssetService.getInstance(this.obsApp);
    measure.measurementSettingsProvider = () => mapMeasurementSettings(assetService, this.store.getState());
    const grid = this.gridSystem;
    if (grid) measure.playersView = measurePlayersView({ store: this.store, grid, tokens: () => this.tokenRenderer, lighting: () => this.lighting?.playerSight() });
    this.stopMeasuresFollowingPlayers?.();
    this.stopMeasuresFollowingPlayers = this.tokenRenderer?.onPlayersViewChange(() => measure.refreshVisibility());
  }

  /** Handle audio tool pointer down: click to select existing source or place new one */
  private handleAudioPointerDown(worldX: number, worldY: number): boolean {
    if (!this.audioRenderer || !this.audioTool || !this.soundRegistry) return false;

    // Check if clicking on an existing audio source
    const hitId = this.audioRenderer.hitTestAudioSources(worldX, worldY);
    if (hitId) {
      this.audioRenderer.setSelectedAudio(hitId);
      // Open config panel
      if (this.viewport) {
        const screenPos = this.viewport.toScreen(worldX, worldY);
        const canvasRect = this.pixiAppManager.getCanvasElement()?.getBoundingClientRect();
        const sx = (canvasRect?.left ?? 0) + screenPos.x;
        const sy = (canvasRect?.top ?? 0) + screenPos.y;
        openAudioConfigPanel(
          hitId,
          this.store,
          this.soundRegistry,
          (soundId) => this.previewSound(soundId),
          sx,
          sy,
        );
      }
      return true;
    }

    // Place a new audio source
    const settings = this.audioTool.getSettings();
    const grid = this.store.getState().grid;
    const gridSize = grid?.size ?? 70;
    const unitDist = grid?.unitDistance ?? 5;
    const innerPx = (10 / unitDist) * gridSize;  // Default 10 game units
    const outerPx = (30 / unitDist) * gridSize;  // Default 30 game units

    const newId = this.store.getState().addAudio({
      x: worldX,
      y: worldY,
      innerRadius: innerPx,
      outerRadius: outerPx,
      volume: settings.defaultVolume,
      soundId: settings.defaultSoundId,
      loop: true,
    });

    this.audioRenderer.setSelectedAudio(newId);

    // Open config panel for the new source
    if (this.viewport) {
      const screenPos = this.viewport.toScreen(worldX, worldY);
      const canvasRect = this.pixiAppManager.getCanvasElement()?.getBoundingClientRect();
      const sx = (canvasRect?.left ?? 0) + screenPos.x;
      const sy = (canvasRect?.top ?? 0) + screenPos.y;
      openAudioConfigPanel(
        newId,
        this.store,
        this.soundRegistry,
        (soundId) => this.previewSound(soundId),
        sx,
        sy,
      );
    }

    return true;
  }

  private previewSound(soundId: string): void {
    if (!this.spatialAudioEngine) return;
    runInBackground(
      this.spatialAudioEngine.previewSound(soundId),
      `Previewing sound ${soundId}`,
      t('light.previewFailed'),
    );
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    // The event bus survives map switches; detach before destroying graphics.
    for (const unsubscribe of this.eventBusUnsubscribers) unsubscribe();
    this.eventBusUnsubscribers = [];
    this._unsubscribeFromToolChanges?.();
    delete this._unsubscribeFromToolChanges;
    
    this._unsubscribeFromGridVisibility?.();
    delete this._unsubscribeFromGridVisibility;
    

    if (this.gridInitRetryTimeout) {
      window.clearTimeout(this.gridInitRetryTimeout);
      this.gridInitRetryTimeout = null;
    }
    
    // Remove keyboard handler
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    
    // Remove drawing tool handlers

    this.tokenRenderer?.destroy(); // Destroy TokenRenderer
    this.pinRenderer?.destroy(); // Destroy PinRenderer
    this.hexLinkInteraction?.destroy();
    this.hexLinkRenderer?.destroy();
    this.fogRenderer?.destroy(); // Destroy FogRenderer
    this.stopMeasuresFollowingPlayers?.();
    this.measureRenderer?.destroy(); // Destroy MeasureRenderer
    this.laserPointerRenderer?.destroy(); // Destroy LaserPointerRenderer
    this.drawingRenderer?.destroy(); // Destroy DrawingRenderer
    this.drawingInteraction?.destroy();
    this.textRenderer?.destroy(); // Destroy TextRenderer
    this.textTool?.destroy(); // Destroy TextTool
    this.lightingFeature?.destroy();
    this.audioRenderer?.destroy();
    this.spatialAudioEngine?.dispose();
    this.bufferCache?.dispose();
    this.gridSystem?.destroy(); // Destroy GridSystem
    this.selectionManager?.destroy(); // Destroy SelectionManager
    
    this.clearBackgroundSprite();

    this.pixiAppManager.destroy();

    // Remove viewport position handler
    if (this.getViewportPositionHandler) {
      window.removeEventListener('get-viewport-position', this.getViewportPositionHandler);
      this.getViewportPositionHandler = null;
    }

  }

  private setupEventBusListeners(): void {
    const on = <Args extends unknown[]>(event: string, handler: (...args: Args) => void): void => {
      this.eventBus.on(event, handler);
      this.eventBusUnsubscribers.push(() => this.eventBus.off(event, handler));
    };

    on('wait-for-tokens-loaded', (callback: () => void) => {
      if (this.tokenRenderer) {
        // Force sync tokens before checking if they're loaded
        this.tokenRenderer.forceSyncTokens();


        this.tokenRenderer.onWhenAllTokensLoaded(() => {
          callback();
        });
      } else {
        // No token renderer, just call the callback
        callback();
      }
    });
  }
  
  /**
   * Re-snap all tokens to the grid after grid changes
   */
  private resnapTokensToGrid(): void {
    if (!this.store || !this.gridSystem || !this.tokenRenderer) return;
    
    const state = this.store.getState();
    const snapToGrid = state.grid?.snapToGrid ?? true;
    
    if (!snapToGrid) return;
    
    // Handle position snapping
    const tokens = state.objects?.tokens || {};
    const tokenUpdates: Array<{id: string, x: number, y: number}> = [];
    
    for (const [id, token] of Object.entries(tokens)) {
      // Calculate new snapped position
      const snappedPos = this.gridSystem.snapTokenCenter(token.x, token.y, token.size || 1);
      
      // Only update if position actually changed
      if (snappedPos.x !== token.x || snappedPos.y !== token.y) {
        tokenUpdates.push({ id, x: snappedPos.x, y: snappedPos.y });
      }
    }
    
    // Apply all position updates at once
    if (tokenUpdates.length > 0) {
      this.store.getState().setTokenPositions(tokenUpdates);
    }
  }
  
  
} 
