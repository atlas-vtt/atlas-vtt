import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
import type { MapProcessing } from '../pixi/mosaicCanvas/mapProcessing';
import { readMapStretch, sameStretch } from '../grid/mapStretch';
import type { MapStretch } from '../grid/mapStretch';
import { fitMapRect } from '../pixi/fitMapRect';
import type { ViewAtlasStore } from '../storeFactory';
import { offerGridAlignment } from './gridAlignmentNotice';
import { autoDetectGridOnFirstLoad } from './gridAutoDetect';
import { createGridScan } from './gridScan';

export interface FirstGridDetection {
  store: ViewAtlasStore;
  renderer: PixiRendererOrchestrator;
  /** Which map images are still being cut into tesserae: the search waits for the scene's. */
  processing: MapProcessing;
  /** False once another scene is being loaded: nothing of this detection may show or be written then. */
  isCurrent: () => boolean;
  /** The camera was fitted to the map, so it is fitted again to a map the grid draws another way. */
  refitCamera: boolean;
}

/**
 * Finds the grid of a new scene once its map is shown, and shows the search on the map: the GM
 * sees the map at once and watches its grid being found, where the loading screen once covered
 * both. Returns what ends the detection, for a scene that is left while it runs.
 */
export function detectGridOfNewScene({ store, renderer, processing, isCurrent, refitCamera }: FirstGridDetection): () => void {
  const asked = new AbortController();
  let endScan: (() => void) | null = null;
  // A window of a map whose tesserae are still being cut waits for the build to reach its rows, the finest
  // level's last: the search would stand still for minutes. It begins once the tesserae are there.
  const { background } = store.getState();
  const tilesReady = background ? processing.whenDone(background, asked.signal) : Promise.resolve();
  void tilesReady.then(() => {
    if (!isCurrent() || asked.signal.aborted) return;
    endScan = searchForGrid({ store, renderer, isCurrent, refitCamera }, asked.signal);
  }, () => undefined);
  return () => {
    asked.abort();
    endScan?.();
  };
}

function searchForGrid({ store, renderer, isCurrent, refitCamera }: Omit<FirstGridDetection, 'processing'>, signal: AbortSignal): () => void {
  const mapImage = renderer.getMapImage();
  const viewport = renderer.getViewportInstance();
  // The players' own view gets the answer alone, as reduced motion does.
  const scan = store.getState().isPlayerView ? null : createGridScan(() => store.getState(), renderer);

  /** Draws the map as the grid found wants it, before the answer shows on it. */
  const drawAs = (stretch: MapStretch): void => {
    if (!mapImage || sameStretch(stretch, mapImage.mapStretch)) return;
    mapImage.setStretch(stretch);
    const rect = mapImage.worldRect;
    if (refitCamera && viewport && rect) fitMapRect(viewport, rect);
  };

  if (scan) {
    // The grid a new scene starts with says nothing about its map: it would only be in the way.
    renderer.getGridSystem()?.updateOptions({ enabled: false });
    scan.whenStill(() => scan.destroy());
    scan.start();
  }

  void autoDetectGridOnFirstLoad(store, mapImage, () => isCurrent() && !signal.aborted, {
    signal,
    ...(scan ? { onEvent: (event) => scan.show(event) } : {}),
    found: ({ result, hits }) => new Promise((resolve) => {
      drawAs(readMapStretch(result?.mapStretch));
      if (scan && result) scan.lock(result, hits, resolve);
      else resolve();
    }),
    none: () => scan?.miss(),
  }).then((detection) => {
    if (detection === 'none') offerGridAlignment(store);
    // A detection that showed nothing in the end (a scene without a map) leaves no scan behind.
    if (scan && !scan.active) scan.destroy();
  });

  return () => scan?.destroy();
}
