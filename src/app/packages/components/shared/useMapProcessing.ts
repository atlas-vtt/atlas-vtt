import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { processingPercent, type MapProcessing } from '../../../pixi/mosaicCanvas/mapProcessing';
import { sceneImagePathsOf } from '../../../services/sceneImagePaths';

const NONE: readonly string[] = [];
const noSubscription = (): (() => void) => () => {};

function useSubscription(processing: MapProcessing | null): (listener: () => void) => () => void {
  return useCallback((listener: () => void) => processing?.subscribe(listener) ?? noSubscription(), [processing]);
}

/**
 * The map images a scene file shows, read only while some map image is being processed, so no
 * scene file is read while nothing is.
 */
export function useSceneImagePaths(app: App | null, processing: MapProcessing | null, scenePath: string | null): readonly string[] {
  const busy = useSyncExternalStore(useSubscription(processing), () => processing?.busy() ?? false);
  const [paths, setPaths] = useState<readonly string[]>(NONE);
  useEffect(() => {
    if (!app || !scenePath || !busy) return undefined;
    let current = true;
    void sceneImagePathsOf(app, scenePath).then((read) => { if (current) setPaths(read); });
    return (): void => { current = false; };
  }, [app, scenePath, busy]);
  return paths;
}

/**
 * Whole percent of how far the first of `paths` being processed has come, or null while none is.
 * Renders again only when that number changes, however many progress events arrive.
 */
export function useProcessingPercent(processing: MapProcessing | null, paths: readonly string[]): number | null {
  return useSyncExternalStore(useSubscription(processing), () => {
    if (!processing) return null;
    for (const path of paths) {
      const state = processing.stateOf(path);
      if (state) return processingPercent(state);
    }
    return null;
  });
}
