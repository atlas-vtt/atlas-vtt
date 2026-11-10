/** The app's one Spectral Engine client: every map and panel asks it, and it is gone with the plugin. */

import { detectionStopped, SpectralEngineClient } from './SpectralEngineClient';
import type { DetectOptions, MapPixels } from './SpectralEngineClient';
import { pictureOf } from './detectGrid';
import type { DetectableMap } from './detectGrid';
import { NO_GRID } from './detectionJob';
import type { DetectionOutcome } from './detectionJob';
import DetectionWorker from './detectionWorker?worker&inline';
import { detectGridInWindows } from './windowedDetection';

let client: SpectralEngineClient | null = null;
/** Set on unload, so work finishing afterwards cannot start a worker for a plugin that is gone. */
let disposed = false;

/**
 * Detects the grid in a map's pixels, or fits `options.candidates` to its lines, off the main thread.
 * Ask with the same `pixels` for the same map: the worker keeps what it read of them.
 */
export function detectGridInGray(pixels: MapPixels, options?: DetectOptions): Promise<DetectionOutcome> {
  if (disposed) return Promise.reject(detectionStopped());
  client ??= new SpectralEngineClient(() => new DetectionWorker({ name: 'Atlas grid detection' }));
  return client.detect(pixels, options);
}

/**
 * Detects the grid of a map image; no grid for a map whose pixels cannot be read. A map too large
 * to see whole is searched in windows at its finest level (`detectGridInWindows`).
 */
export function detectGridOfMap(map: DetectableMap, options: DetectOptions = {}): Promise<DetectionOutcome> {
  if (options.candidates) {
    const picture = pictureOf(map);
    return picture ? detectGridInGray(picture, options) : Promise.resolve(NO_GRID);
  }
  return detectGridInWindows(map, options, (pixels, detectOptions) => detectGridInGray(pixels, detectOptions));
}

/** Stops the worker; called when the plugin unloads. */
export function disposeSpectralEngine(): void {
  disposed = true;
  client?.dispose();
  client = null;
}
