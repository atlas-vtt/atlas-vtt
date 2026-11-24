import type { Application } from 'pixi.js';
import type { ViewAtlasStore } from '../storeFactory';
import { captureSceneTransition, type SceneTransition } from './sceneTransition';
import { MAP_LOADING_OVERLAY_FADE_MS } from './sceneLoadMotion';
import { holdRenders } from './RenderScheduler';

/**
 * How long a map load may take before the loading overlay fades in. Shorter loads
 * (most scene switches) never show a spinner.
 */
export const MAP_LOADING_REVEAL_DELAY_MS = 250;

/**
 * Keeps the last rendered frame on screen while a map loads, so a scene switch
 * never shows the new map being rebuilt (cleared tokens, default grid, background
 * without fog). When the load finishes, the old frame crossfades into the new map.
 * Loads slower than the reveal delay hand over to the loading overlay instead: once
 * it covers the canvas, rendering resumes and the frozen frame is dropped.
 *
 * @returns Unbinds the hold and resumes rendering.
 */
export function bindMapLoadingFrameHold(store: ViewAtlasStore, app: Application): () => void {
  let isHolding = false;
  let overlayTimer: number | null = null;
  /** Frame captured for the load in progress. */
  let pending: SceneTransition | null = null;
  /** Frame still fading out after the previous load. */
  let fading: SceneTransition | null = null;

  const resumeRendering = (): void => {
    if (overlayTimer !== null) {
      window.clearTimeout(overlayTimer);
      overlayTimer = null;
    }
    if (!isHolding) return;
    isHolding = false;
    app.start();
  };

  const handOverToOverlay = (): void => {
    pending?.cancel();
    pending = null;
    resumeRendering();
  };

  const hold = (): void => {
    if (isHolding || !app.ticker?.started) return;
    pending = captureSceneTransition(app, fading);
    fading = null;
    isHolding = true;
    app.stop();
    overlayTimer = window.setTimeout(handOverToOverlay, MAP_LOADING_REVEAL_DELAY_MS + MAP_LOADING_OVERLAY_FADE_MS);
  };

  const finish = (): void => {
    resumeRendering();
    pending?.play();
    fading = pending;
    pending = null;
  };

  // Nothing of a scene being built is rendered: the held frame or the loading screen covers it,
  // and each render of it was work the first render after the load does again.
  holdRenders(app, store.getState().isMapLoading);
  const unsubscribe = store.subscribe((state, prevState) => {
    if (state.isMapLoading === prevState.isMapLoading) return;
    if (state.isMapLoading) hold();
    holdRenders(app, state.isMapLoading);
    if (!state.isMapLoading) finish();
  });

  return (): void => {
    unsubscribe();
    holdRenders(app, false);
    handOverToOverlay();
    fading?.cancel();
    fading = null;
  };
}
