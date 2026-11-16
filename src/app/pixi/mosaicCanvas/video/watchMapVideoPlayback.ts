import type { Renderer } from 'pixi.js';
import { contextLost } from '../../lighting/engine/gpu';
import { animateMapsOn, mapVideoMode, type MapVideoMode } from './mapVideoPlayback';

/** What decides whether a view's animated map plays, besides its canvas being on screen. */
export interface MapVideoPlaybackDeps {
  map: { setVideoMode(mode: MapVideoMode): void };
  /** The view's canvas: on screen or not, its document's visibility, its graphics context. */
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  /** The view's scene: loading or none. */
  scene: {
    getState(): { isMapLoading: boolean; mapLoaded: boolean };
    subscribe(listener: () => void): () => void;
  };
  /** Whether the player window shows this view's scene live, which it renders from this view. */
  players: { shown(): boolean; subscribe(listener: () => void): () => void };
  /** The device's Animate maps setting; null where there are no settings (tests, a view without the plugin). */
  animate: { get(): boolean | null; onChange(listener: () => void): () => void } | null;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Plays a view's animated map while someone sees it (`mapVideoMode`) and pauses it otherwise:
 * a pane another tab covers, a hidden window, a load, a lost graphics context. Returns the
 * function that stops watching.
 */
export function watchMapVideoPlayback({ map, canvas, renderer, scene, players, animate }: MapVideoPlaybackDeps): () => void {
  const doc = canvas.ownerDocument;
  const view = doc.defaultView;
  const motion = view?.matchMedia(REDUCED_MOTION) ?? null;
  // Shown until an observer says otherwise, where none can be made.
  let onScreen = !view?.IntersectionObserver;
  let lost = contextLost(renderer);

  const update = (): void => {
    const state = scene.getState();
    map.setVideoMode(mapVideoMode({
      animate: animateMapsOn(animate?.get() ?? null, motion?.matches ?? false),
      loading: state.isMapLoading || !state.mapLoaded,
      contextLost: lost,
      viewShown: onScreen && doc.visibilityState === 'visible',
      shownToPlayers: players.shown(),
    }));
  };

  const observer = view?.IntersectionObserver ? new view.IntersectionObserver((entries) => {
    for (const entry of entries) onScreen = entry.isIntersecting;
    update();
  }) : null;
  observer?.observe(canvas);
  const onContextLost = (): void => {
    lost = true;
    update();
  };
  const onContextRestored = (): void => {
    lost = false;
    update();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  doc.addEventListener('visibilitychange', update);
  motion?.addEventListener('change', update);
  const stops = [scene.subscribe(update), players.subscribe(update), animate?.onChange(update)];
  update();

  return (): void => {
    observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    doc.removeEventListener('visibilitychange', update);
    motion?.removeEventListener('change', update);
    for (const stop of stops) stop?.();
  };
}
