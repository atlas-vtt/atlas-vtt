import type { MeasureShape } from '../pixi/utils/measureDrawing';

export interface MeasureSettings {
  shape: MeasureShape;
  persist: boolean;
  coneAngle?: number; // Angle in degrees for cone shape (default 90)
}

import { EventEmitter } from 'events';

/**
 * Encapsulates all logic related to the measure tool.
 * Keeps state local and emits events so other services can react.
 */
export class MeasureTool {
  private settings: MeasureSettings;
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    // default settings
    this.settings = {
      shape: 'line',
      persist: false,
    };
  }

  /**
   * Update the measurement shape.
   */
  public setShape(shape: MeasureShape): void {
    if (this.settings.shape === shape) return;
    this.settings.shape = shape;
    this.eventBus.emit('measure-shape-changed', shape);
  }

  /**
   * Update whether drawn measurements should stay on screen.
   */
  public setPersistence(persist: boolean): void {
    if (this.settings.persist === persist) return;
    this.settings.persist = persist;
    this.eventBus.emit('measure-persistence-changed', persist);
  }

  /**
   * Current configuration of the measure tool.
   */
  public getSettings(): MeasureSettings {
    return { ...this.settings };
  }
} 