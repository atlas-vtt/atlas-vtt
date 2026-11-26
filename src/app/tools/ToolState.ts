import { EventEmitter } from '../utils/typedEmitter';
import { ToolMode } from '../types';

/**
 * Central in‑memory record of current top‑level tool state – active tool,
 * DM/player mode, grid visibility, etc. It publishes every change so
 * rendering and UI layers can react.
 */
export class ToolState {
  private activeTool: ToolMode = 'pan';
  private isPlayerMode = false;
  private isDrawingMode = false;
  private gridVisible = true;

  constructor(private readonly eventBus: EventEmitter) {}

  public setActiveTool(mode: ToolMode): void {
    if (this.activeTool === mode) return;
    this.activeTool = mode;
    this.eventBus.emit('tool-changed', mode);
  }

  public getActiveTool(): ToolMode {
    return this.activeTool;
  }

  public setPlayerMode(on: boolean): void {
    if (this.isPlayerMode === on) return;
    this.isPlayerMode = on;
    this.eventBus.emit('player-mode-changed', on);
  }

  public isInPlayerMode(): boolean {
    return this.isPlayerMode;
  }

  public toggleGrid(isVisible?: boolean): boolean {
    if (typeof isVisible === 'boolean') {
      this.gridVisible = isVisible;
    } else {
      this.gridVisible = !this.gridVisible;
    }
    this.eventBus.emit('grid-visibility-changed', this.gridVisible);
    return this.gridVisible;
  }

  public isGridVisible(): boolean {
    return this.gridVisible;
  }

  public setDrawingMode(on: boolean): void {
    if (this.isDrawingMode === on) return;
    this.isDrawingMode = on;
    this.eventBus.emit('drawing-mode-changed', on);
  }

  public isInDrawingMode(): boolean {
    return this.isDrawingMode;
  }
} 