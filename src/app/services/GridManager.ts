import { EventEmitter } from '../utils/typedEmitter';
import { GridController, type GridMapData } from '../grid/GridController';
import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';

export class GridManager {
  private isVisible: boolean = true;
  private eventBus: EventEmitter;
  
  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    
    // Listen for tool controller events
    this.eventBus.on('grid-visibility-changed', (isVisible: boolean) => {
      this.isVisible = isVisible;
      this.updateGridVisibility();
    });
  }
  
  /**
   * Toggle grid visibility
   * @param renderer The renderer instance
   * @param mapData The current map data
   * @returns The new visibility state
   */
  public toggle(renderer: PixiRendererOrchestrator | null, mapData: GridMapData | null): boolean {
    if (!renderer) {
      console.warn('[GridManager] Cannot toggle grid: renderer not initialized');
      return this.isVisible;
    }
    
    this.isVisible = GridController.toggle(renderer, mapData);
    
    // Emit event for other services
    this.eventBus.emit('grid-state-changed', this.isVisible);
    
    return this.isVisible;
  }
  
  /**
   * Update grid visibility based on current state
   */
  private updateGridVisibility(): void {
    // This will be called when tool controller changes visibility
    // Implementation will use the renderer when available
  }
  
  /**
   * Check if the grid is visible
   * @returns True if the grid is visible
   */
  public isGridVisible(): boolean {
    return this.isVisible;
  }
} 