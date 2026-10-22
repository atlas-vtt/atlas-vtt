import { App } from 'obsidian';
import { PixiRendererOrchestrator } from '../PixiRendererOrchestrator'; // New import
import { PixiAppManager } from '../pixi/PixiAppManager'; // Import PixiAppManager
import type { Viewport } from 'pixi-viewport';
import type { Application } from 'pixi.js';
import type { GridSystem } from '../grid/GridSystem';
import { EventEmitter } from 'events';
import type { ViewAtlasStore } from '../storeFactory';
import type { SettingsService } from './SettingsService';
import { bindViewportNavigation } from '../pixi/viewportNavigation';
import { bindMapLoadingFrameHold } from '../pixi/mapLoadingFrameHold';

export class RendererService {
  // private renderer: PixiRenderer | null = null; // Old type
  private renderer: PixiRendererOrchestrator | null = null; // New type
  private eventBus: EventEmitter;
  private pixiAppManager: PixiAppManager | null = null; // Add PixiAppManager instance variable
  private store: ViewAtlasStore; // Add store
  private viewId: string;
  private settingsService: SettingsService;
  private unbindNavigation: (() => void) | null = null;
  private unbindFrameHold: (() => void) | null = null;

  constructor(
    private app: App,
    eventBus: EventEmitter,
    store: ViewAtlasStore,
    viewId: string,
    settingsService: SettingsService
  ) {
    this.eventBus = eventBus;
    this.store = store;
    this.viewId = viewId;
    this.settingsService = settingsService;
  }
  
  /**
   * Initialize the Pixi renderer
   * @param containerEl The HTML element to attach the renderer to
   * @returns The PixiJS application instance
   */
  public async init(containerEl: HTMLElement): Promise<Application | null> {
    if (!this.renderer) {
      // Create PixiAppManager instance with container dimensions for split-view support
      if (!this.pixiAppManager) {
        // Use container dimensions so the canvas fits its pane in split-view
        const width = containerEl.clientWidth || window.innerWidth;
        const height = containerEl.clientHeight || window.innerHeight;
        this.pixiAppManager = new PixiAppManager(width, height);
      }
      
      // Pass the PixiAppManager instance to the orchestrator
      this.renderer = new PixiRendererOrchestrator(this.app, this.pixiAppManager, this.eventBus, this.store, this.viewId);
      
      try {
        // The orchestrator's init will call pixiAppManager.init
        await this.renderer.init(containerEl);
        const viewport = this.renderer.getViewportInstance();
        if (viewport) {
          this.unbindNavigation = bindViewportNavigation(viewport, this.settingsService);
        }
        this.unbindFrameHold = bindMapLoadingFrameHold(this.store, this.renderer.getAppInstance());
        this.eventBus.emit('renderer-ready', this.renderer);
        
        return this.getApp(); // This should call getAppInstance on orchestrator
      } catch (error) {
        console.error("[RendererService] Error initializing PixiRendererOrchestrator:", error);
        throw error;
      }
    } else {
      // Don't resize - canvas should maintain fixed size
      return this.getApp(); // This should call getAppInstance on orchestrator
    }
  }
  
  /**
   * Resize the renderer
   * @param width The new width
   * @param height The new height
   */
  public resize(width: number, height: number): void {
    if (this.pixiAppManager) {
      this.pixiAppManager.resize(width, height);
    }
  }


  
  /**
   * Get the Pixi application
   * @returns The Pixi application or null if not initialized
   */
  public getApp(): Application | null {
    return this.renderer ? this.renderer.getAppInstance() : null;
  }
  
  /**
   * Get the actual PixiRenderer instance
   * @returns The PixiRenderer instance or null if not initialized
   */
  public getRenderer(): PixiRendererOrchestrator | null { // Update return type
    return this.renderer;
  }
  
  /**
   * Get the Pixi viewport
   * @returns The Pixi viewport or null if not initialized
   */
  public getViewport(): Viewport | null {
    return this.renderer ? this.renderer.getViewportInstance() : null;
  }
  
  /**
   * Get the grid system
   * @returns The grid system or null if not initialized
   */
  public getGridSystem(): GridSystem | null {
    return this.renderer ? this.renderer.getGridSystem() : null;
  }
  
  /**
   * Destroy the renderer
   * Cleans up all resources to prevent WebGL context leaks
   */
  public destroy(): void {
    this.unbindNavigation?.();
    this.unbindNavigation = null;
    this.unbindFrameHold?.();
    this.unbindFrameHold = null;
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    if (this.pixiAppManager) {
      this.pixiAppManager = null;
    }
  }
  
  /**
   * Check if the renderer is initialized
   * @returns True if the renderer is initialized
   */
  public isInitialized(): boolean {
    return this.renderer !== null;
  }
} 