import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
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
export function detectGridOfNewScene({ store, renderer, isCurrent, refitCamera }: FirstGridDetection): () => void {
  const mapImage = renderer.getMapImage();
  const viewport = renderer.getViewportInstance();
  const asked = new AbortController();
  // The players' own view gets the answer alone, as reduced motion and a renderer without WebGL do.
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

  void autoDetectGridOnFirstLoad(store, mapImage, () => isCurrent() && !asked.signal.aborted, {
    signal: asked.signal,
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

  return () => {
    asked.abort();
    scan?.destroy();
  };
}
