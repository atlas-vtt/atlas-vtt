import type { DeviceBudgets } from '../../platform/deviceBudgets';
import { deviceProfile } from '../../platform/deviceProfile';
import { UVTT_LIMITS } from './uvttTypes';

/** The limits of `UVTT_LIMITS` that follow what the device holds at once; never more than they say. */
export interface UvttDeviceLimits {
  /** Bytes of one file. */
  fileBytes: number;
  /** Pixels of a file's map image. */
  imagePixels: number;
  /** Bytes of the files of one scene together. */
  floorsBytes: number;
}

/**
 * What an import reads on a device with `budgets`: a file's text, its JSON and its image are held
 * together while it is read, and the image is decoded whole.
 */
export function uvttLimitsFor(budgets: Pick<DeviceBudgets, 'imageSourceBytes' | 'uvttFileBytes' | 'uvttFloorsBytes'>): UvttDeviceLimits {
  return {
    fileBytes: Math.min(UVTT_LIMITS.fileBytes, budgets.uvttFileBytes),
    imagePixels: Math.min(UVTT_LIMITS.imagePixels, Math.floor(budgets.imageSourceBytes / 4)),
    floorsBytes: Math.min(UVTT_LIMITS.floorsBytes, budgets.uvttFloorsBytes),
  };
}

/** This device's limits. */
export function deviceUvttLimits(): UvttDeviceLimits {
  return uvttLimitsFor(deviceProfile().budgets);
}
