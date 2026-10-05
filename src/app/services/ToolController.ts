import { EventEmitter } from 'events';
import { StoreApi } from 'zustand';
import { ToolMode } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import { ToolState } from '../tools/ToolState';
import { MeasureTool, MeasureSettings } from '../tools/MeasureTool';
import { FogTool, FogSettings } from '../tools/FogTool';
import { NotePinTool } from '../tools/NotePinTool';
import { DiceTool } from '../tools/DiceTool';
import { AudioTool } from '../tools/AudioTool';
import { offlineDiceInputs } from './offlineDiceInputs';
import { mapDiceRules } from './mapDiceRules';
import type { App } from 'obsidian';

export class ToolController {
  /** Delegates all fine‑grained logic to dedicated tool classes. */
  private readonly toolState: ToolState;
  private readonly measureTool: MeasureTool;
  private readonly fogTool: FogTool;
  private readonly notePinTool: NotePinTool;
  private readonly diceTool: DiceTool;
  private readonly audioTool: AudioTool;
  private eventBus: EventEmitter;
  private store: StoreApi<ViewAtlasState>;
  
  constructor(eventBus: EventEmitter, app: App, store: StoreApi<ViewAtlasState>) {
    this.eventBus = eventBus;
    this.store = store;

    // Instantiate dedicated segments
    this.toolState = new ToolState(eventBus);
    this.measureTool = new MeasureTool(eventBus);
    this.fogTool = new FogTool(eventBus);
    this.notePinTool = new NotePinTool(eventBus, app, store);
    this.diceTool = new DiceTool(eventBus, () => mapDiceRules(app, store.getState().mapPath), offlineDiceInputs());
    this.audioTool = new AudioTool(eventBus);
  }
  
  /**
   * Set the active tool
   * @param mode The tool mode to set
   */


  public setToolMode(mode: ToolMode): void {
    this.toolState.setActiveTool(mode);

    // Legacy event for React UI
    window.dispatchEvent(
      new CustomEvent('atlas-toolbar-update', {
        detail: { activeTool: mode },
      }),
    );
  }
  
  /**
   * Toggle player/DM mode
   * @param isPlayerMode True to set to player mode, false for DM mode
   */
  public setPlayerMode(isPlayerMode: boolean): void {
    this.toolState.setPlayerMode(isPlayerMode);

    // Legacy event for React UI
    window.dispatchEvent(
      new CustomEvent('atlas-toolbar-update', {
        detail: { isPlayerMode },
      }),
    );
  }

  /**
   * Toggle drawing/normal mode
   * @param isDrawingMode True to set to drawing mode, false for normal mode
   */
  public setDrawingMode(isDrawingMode: boolean): void {
    this.toolState.setDrawingMode(isDrawingMode);

    // Legacy event for React UI
    window.dispatchEvent(
      new CustomEvent('atlas-toolbar-update', {
        detail: { isDrawingMode },
      }),
    );
  }
  
  /**
   * Toggle grid visibility
   * @param isVisible Optional boolean to explicitly set visibility
   * @returns The new grid visibility state
   */
  public toggleGrid(isVisible?: boolean): boolean {
    const visible = this.toolState.toggleGrid(isVisible);

    // Legacy event for React UI
    window.dispatchEvent(
      new CustomEvent('atlas-toolbar-update', {
        detail: { isGridOn: visible },
      }),
    );

    return visible;
  }
  
  /**
   * Set fog brush size
   * @param size The brush size in pixels
   */
  public setFogBrushSize(size: number): void {
    this.fogTool.setBrushSize(size);
  }
  
  /**
   * Clear all fog
   */
  public clearAllFog(): void {
    this.fogTool.clearAll();
  }
  
  /**
   * Set measurement shape
   * @param shape The measurement shape
   */
  public setMeasureShape(shape: 'line' | 'cone' | 'circle'): void {
    this.measureTool.setShape(shape);
  }
  
  /**
   * Set measurement persistence
   * @param persist Whether measurements should persist
   */
  public setMeasurePersistence(persist: boolean): void {
    this.measureTool.setPersistence(persist);
  }
  
  /**
   * Open a note linked from a note pin
   * @param notePath The path to the note
   */
  public openLinkedNote(notePath: string): void {
    this.eventBus.emit('open-linked-note', notePath);
  }
  
  /**
   * Get the active tool
   * @returns The active tool
   */
  public getActiveTool(): ToolMode {
    return this.toolState.getActiveTool();
  }
  
  /**
   * Check if in player mode
   * @returns True if in player mode
   */
  public isInPlayerMode(): boolean {
    return this.toolState.isInPlayerMode();
  }
  
  /**
   * Get the measurement settings
   * @returns The measurement settings
   */
  public getMeasureSettings(): MeasureSettings {
    return this.measureTool.getSettings();
  }
  
  /**
   * Get the fog settings
   * @returns The fog settings
   */
  public getFogSettings(): FogSettings {
    return this.fogTool.getSettings();
  }
  
  /**
   * Get the note pin tool instance
   * @returns The note pin tool
   */
  public getNotePinTool(): NotePinTool {
    return this.notePinTool;
  }
  
  /**
   * Get the dice tool instance
   * @returns The dice tool
   */
  public getDiceTool(): DiceTool {
    return this.diceTool;
  }
  
  /**
   * Get the audio tool instance
   * @returns The audio tool
   */
  public getAudioTool(): AudioTool {
    return this.audioTool;
  }

  /**
   * Cleanup resources for tool instances that attach global listeners.
   */
  public destroy(): void {
    this.notePinTool.destroy();
  }
}
