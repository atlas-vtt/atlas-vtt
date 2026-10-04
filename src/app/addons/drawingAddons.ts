import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { DrawingType } from '../types';
import type { AddonDrawingShape, FinishedMeasurement } from './hooks/drawingHooks';
import { installedAddons } from './addonRegistry';

/** Drawing calls core makes into add-ons. */

/** The add-on that draws `type`, or undefined for core types. */
export function addonDrawingShape(type: DrawingType): AddonDrawingShape | undefined {
  for (const addon of installedAddons()) {
    const shape = addon.drawingShapes?.[type];
    if (shape) return shape;
  }
  return undefined;
}

/** True when an add-on kept the measurement on the map. */
export function addonKeepMeasurement(measurement: FinishedMeasurement, store: StoreApi<ViewAtlasState>): boolean {
  return installedAddons().some((addon) => addon.keepMeasurement?.(measurement, store) ?? false);
}
