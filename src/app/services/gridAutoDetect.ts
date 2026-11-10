import type { StoreApi } from 'zustand';
import type { DetectableMap } from '../pixi/spectralEngine/detectGrid';
import { NO_GRID } from '../pixi/spectralEngine/detectionJob';
import type { DetectionEvent, DetectionOutcome } from '../pixi/spectralEngine/detectionJob';
import { detectGridOfMap } from '../pixi/spectralEngine/spectralEngineService';
import { runUntracked } from '../stores/history';
import { gridAlignedTo } from '../pixi/gridAlignmentMath';
import type { GridState } from '../types/gridTypes';
import type { ViewAtlasState } from '../storeFactory';

/** What the first load of a new scene did about its grid: aligned it, found none on the map and hid it, or had nothing to look at. */
export type GridAutoDetection = 'found' | 'none' | 'skipped';

/** How a first detection is shown while it runs; without one it only writes its answer. */
export interface DetectionShow {
  /** Hears what the detection finds on its way. */
  onEvent?: (event: DetectionEvent) => void;
  /** Ends the detection. */
  signal?: AbortSignal;
  /** Shows the answer on the map; the grid is written once this resolves. */
  found?(outcome: DetectionOutcome): Promise<void>;
  /** The map has no grid to find. */
  none?(): void;
}

/**
 * Aligns the grid of a freshly created scene to its map image, once. New scenes
 * carry `grid.autoDetect`; the GM view consumes the flag on the first load. A map
 * without a detectable grid gets its grid hidden and nothing snaps on it; a found grid
 * shows and is snapped to. The renderer follows the store's grid, so writing the store is
 * all that is needed, except for the map's stretch (`GridState.mapStretch`), which a load
 * shows itself: the caller draws the map with it.
 * Detection reads the map's pixels from the tile worker and runs in a worker of its own: nothing is
 * written once `isCurrent` says the load was overtaken meanwhile. It runs once the scene is shown,
 * so what it writes is no step of the GM's to undo.
 */
export async function autoDetectGridOnFirstLoad(
  store: StoreApi<ViewAtlasState>,
  background: DetectableMap | null,
  isCurrent: () => boolean = () => true,
  show: DetectionShow = {},
): Promise<GridAutoDetection> {
  const { grid, background: backgroundPath, isPlayerView, setGrid } = store.getState();
  if (!grid?.autoDetect || isPlayerView) return 'skipped';

  const settled: GridState = { ...grid };
  delete settled.autoDetect;

  if (!backgroundPath || !background) {
    runUntracked(store, () => setGrid(settled));
    return 'skipped';
  }

  const outcome = await detectGrid(background, show);
  if (!isCurrent()) return 'skipped';
  const detected = outcome.result;
  if (!detected) {
    show.none?.();
    runUntracked(store, () => setGrid({ ...settled, visible: false, snapToGrid: false }));
    return 'none';
  }

  await show.found?.(outcome);
  if (!isCurrent()) return 'skipped';
  runUntracked(store, () => setGrid({ ...gridAlignedTo(settled, detected), visible: true, snapToGrid: true }));
  return 'found';
}

/** A map whose pixels cannot be read is a map without a grid, not a failed load. */
async function detectGrid(background: DetectableMap, { onEvent, signal }: DetectionShow): Promise<DetectionOutcome> {
  try {
    return await detectGridOfMap(background, { ...(onEvent ? { onEvent } : {}), ...(signal ? { signal } : {}) });
  } catch (error) {
    if (!signal?.aborted) console.error('[Atlas] Grid auto-detect failed', error);
    return NO_GRID;
  }
}
