import type { StoreApi } from 'zustand';
import { detectGridFromMapImage, type DetectableMap } from '../pixi/gridDetection/detectGrid';
import { gridAlignedTo, type AlignmentResult } from '../pixi/gridAlignmentMath';
import type { GridState } from '../types/gridTypes';
import type { ViewAtlasState } from '../storeFactory';

/**
 * Aligns the grid of a freshly created scene to its map image, once. New scenes
 * carry `grid.autoDetect`; the GM view consumes the flag on the first load. A map
 * without a detectable grid simply gets its grid hidden. The renderer follows the
 * store's grid, so writing the store is all that is needed, except for the map's stretch
 * (`GridState.mapStretch`), which a load shows itself: the caller draws the map with it.
 * Detection reads the map's pixels from the tile worker: nothing is written once `isCurrent`
 * says the load was overtaken meanwhile.
 */
export async function autoDetectGridOnFirstLoad(
  store: StoreApi<ViewAtlasState>,
  background: DetectableMap | null,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const { grid, background: backgroundPath, isPlayerView, setGrid } = store.getState();
  if (!grid?.autoDetect || isPlayerView) return;

  const settled: GridState = { ...grid };
  delete settled.autoDetect;

  if (!backgroundPath || !background) {
    setGrid(settled);
    return;
  }

  const detected = await detectGrid(background);
  if (!isCurrent()) return;
  if (!detected) {
    setGrid({ ...settled, visible: false });
    return;
  }

  setGrid({ ...gridAlignedTo(settled, detected), visible: true });
}

/** A map whose pixels cannot be read is a map without a grid, not a failed load. */
async function detectGrid(background: DetectableMap): Promise<AlignmentResult | null> {
  try {
    return await detectGridFromMapImage(background);
  } catch (error) {
    console.error('[Atlas] Grid auto-detect failed', error);
    return null;
  }
}
