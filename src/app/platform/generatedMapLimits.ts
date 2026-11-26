import type { DeviceBudgets } from './deviceBudgets';
import { deviceProfile } from './deviceProfile';

/** What a device draws of a generated map on one canvas; `Infinity` where the generator's own limits are all there is. */
export interface GeneratedMapLimits {
  maxPixels: number;
  maxSide: number;
}

/** The limits of a device with `budgets`: this one's where left out. */
export function generatedMapLimits(budgets: Pick<DeviceBudgets, 'generatedMapPixels' | 'generatedMapSide'> = deviceProfile().budgets): GeneratedMapLimits {
  return { maxPixels: budgets.generatedMapPixels, maxSide: budgets.generatedMapSide };
}
