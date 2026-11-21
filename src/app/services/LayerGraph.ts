import { Container } from 'pixi.js';
import { LayerManager } from '../layerManager';
import { EventEmitter } from '../utils/typedEmitter';
import { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';

/**
 * Standard layer names and z-index values
 */
export enum LayerName {
  BACKGROUND = 'background',
  GRID = 'grid',
  FOG_UNDERLAY = 'fog-underlay',
  TOKEN = 'token',
  MEASURE = 'measure',
  FOG_OVERLAY = 'fog-overlay',
  UI = 'ui'
}

export const LayerZIndex = {
  [LayerName.BACKGROUND]: 100,
  [LayerName.GRID]: 200,
  [LayerName.FOG_UNDERLAY]: 300,
  [LayerName.TOKEN]: 400,
  [LayerName.MEASURE]: 500,
  [LayerName.FOG_OVERLAY]: 600,
  [LayerName.UI]: 700
};

/**
 * Enhanced layer management with predefined layers and events
 */
export class LayerGraph {
  private layerManager: LayerManager | null = null;
  private eventBus: EventEmitter;
  
  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    
    // Listen for renderer initialization to create layers
    this.eventBus.on('renderer-ready', (renderer: PixiRendererOrchestrator) => {
      const viewport = renderer.getViewportInstance();
      if (viewport) {
        this.initialize(viewport);
      } else {
        console.error("[LayerGraph] Could not initialize layers: Viewport not available from renderer.");
      }
    });
  }
  
  /**
   * Initialize the layer manager with a viewport container
   * @param viewport The Pixi viewport container
   */
  public initialize(viewport: Container): void {
    if (viewport) {
      this.layerManager = new LayerManager(viewport);
      
      // Pre-create standard layers in the correct order
      Object.values(LayerName).forEach(name => {
        this.getLayer(name);
      });
      
      this.eventBus.emit('layers-ready', this);
    } else {
      console.error('[LayerGraph] Unable to initialize - viewport not provided');
    }
  }
  
  /**
   * Get a layer by name, creating it if it doesn't exist
   * @param name The layer name
   * @param customZ Optional custom z-index (uses standard if not provided)
   * @returns The Pixi container for the layer
   */
  public getLayer(name: string, customZ?: number): Container {
    if (!this.layerManager) {
      throw new Error('[LayerGraph] Layer manager not initialized');
    }
    
    const z = customZ !== undefined ? customZ : 
      name in LayerZIndex ? LayerZIndex[name as LayerName] : 1000;
    
    return this.layerManager.get(name, z);
  }
  
  /**
   * Check if the layer manager is initialized
   * @returns True if initialized
   */
  public isInitialized(): boolean {
    return this.layerManager !== null;
  }
  
  /**
   * Get all layer containers
   * @returns Array of all layer containers
   */
  public getAllLayers(): Container[] {
    if (!this.layerManager) {
      return [];
    }
    
    return this.layerManager.all();
  }
  
  /**
   * Destroy the layer manager and all layers
   */
  public destroy(): void {
    if (this.layerManager) {
      this.layerManager.destroy();
      this.layerManager = null;
    }
  }
} 