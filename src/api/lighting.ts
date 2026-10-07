import { cellsPerSide, pendingVisibility, visibilityOf } from '../app/pixi/lighting/playerDarkness/playerVisibility';
import type { DisposerSet } from './disposers';
import { acceptsListener } from './listenerCheck';
import type { SightFramesByView } from './sightFramesByView';
import type { TrackedMapView, ViewTracker } from './viewTracker';
import type { Disposer, ViewId } from './types/common';
import type { LightingApi, PlayerVisibility, PlayerVisibilityOptions } from './types/lighting';

/** An extension's callback must never throw into the GM's lighting or the store's subscribers. */
function guarded(listener: () => void): () => void {
  return () => {
    try {
      listener();
    } catch (error) {
      console.error('[Atlas API] A lighting listener failed:', error);
    }
  };
}

/**
 * Watches the view's renderer once it has one: a view may have none yet when `watch` starts. Returns
 * `retry` (try again to subscribe) and `stop`.
 */
function rendererWatch(view: TrackedMapView, listener: () => void): { retry: () => void; stop: () => void } {
  let stop: (() => void) | null = null;
  const retry = (): void => { stop ??= view.renderer?.watchPlayerLighting?.(listener) ?? null; };
  retry();
  return { retry, stop: () => { stop?.(); stop = null; } };
}

/** The store fields whose change may change the answer; the extension follows the rest (tokens, the map) itself. */
const WATCHED = ['lighting', 'exploredMask', 'exploredEdits', 'isMapLoading', 'mapLoaded'] as const;

export function lightingApi(tracker: ViewTracker, frames: SightFramesByView, disposers: DisposerSet): LightingApi {
  /** Renderer watches still waiting for their view's renderer, retried whenever the view is asked about. */
  const waiting = new Map<ViewId, Set<() => void>>();
  const retryWaiting = (viewId: ViewId): void => { for (const retry of waiting.get(viewId) ?? []) retry(); };
  return Object.freeze({
    playerVisibility: (viewId: ViewId, options?: PlayerVisibilityOptions): PlayerVisibility => {
      const view = tracker.view(viewId);
      if (!view) return pendingVisibility();
      retryWaiting(viewId);
      try {
        return visibilityOf(view, frames.of(view), { maxCellsPerSide: cellsPerSide(options?.maxCellsPerSide) });
      } catch (error) {
        // Whatever fails while the view is read, players are shown nothing.
        console.error('[Atlas API] Player visibility could not be worked out:', error);
        return pendingVisibility();
      }
    },
    watch: (viewId: ViewId, listener: () => void): Disposer => {
      if (!acceptsListener('lighting.watch', listener)) return () => undefined;
      const view = tracker.view(viewId);
      if (!view) return disposers.add(() => undefined);
      let active = true;
      const call = guarded(() => { if (active) listener(); });
      const renderer = rendererWatch(view, call);
      const retries = waiting.get(viewId) ?? new Set<() => void>();
      waiting.set(viewId, retries);
      retries.add(renderer.retry);
      const stopDue = frames.onDue(view, call);
      const unsubscribe = view.atlasStore.subscribe((state, previous) => {
        renderer.retry();
        // Committed fog hides the tokens under it from the players' frame (#303).
        if (WATCHED.some((key) => state[key] !== previous[key]) || state.objects.fog !== previous.objects.fog) call();
      });
      let cancelClose: () => void = () => undefined;
      // The view going away ends the watch too, so a closed view is never retained.
      const dispose = disposers.add(() => {
        active = false;
        cancelClose();
        unsubscribe();
        stopDue();
        renderer.stop();
        retries.delete(renderer.retry);
        if (retries.size === 0 && waiting.get(viewId) === retries) waiting.delete(viewId);
      });
      cancelClose = tracker.onClose(viewId, dispose);
      return dispose;
    },
  });
}
