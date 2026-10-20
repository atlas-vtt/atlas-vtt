import type { Graphics } from 'pixi.js';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { DrawingStroke, DrawingType } from '../../types';

interface Point {
  x: number;
  y: number;
}

/** How core draws and picks a drawing type an add-on defines. */
export interface AddonDrawingShape {
  /** Draws the stroke into `graphics`, clearing it first. */
  draw(graphics: Graphics, stroke: DrawingStroke): void;
  /** Whether `point` (world space) touches the drawing within `tolerance`. */
  hitTest(stroke: DrawingStroke, point: Point, tolerance: number): boolean;
}

/** A measurement the measure tool finished while "keep" is on. */
export interface FinishedMeasurement {
  shape: 'line' | 'cone' | 'circle' | 'sphere';
  start: Point;
  end: Point;
}

export interface DrawingAddonHooks {
  /** Drawing types the add-on adds (see `DrawingTypeRegistry`); the eraser removes them whole. */
  drawingShapes?: Partial<Record<DrawingType, AddonDrawingShape>>;
  /**
   * Keeps a finished measurement on the map; true when the add-on took it, so
   * the measure tool does not keep its own copy.
   */
  keepMeasurement?(measurement: FinishedMeasurement, store: StoreApi<ViewAtlasState>): boolean;
}
