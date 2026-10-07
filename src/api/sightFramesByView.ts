import type { ExploredDecoder } from '../app/pixi/lighting/playerDarkness/exploredImage';
import { SightFrames } from '../app/pixi/lighting/playerDarkness/sightFrames';
import type { ViewAtlasStore } from '../app/storeFactory';
import type { ViewId } from './types/common';

interface Entry {
  frames: SightFrames;
  listeners: Set<() => void>;
  unsubscribe: () => void;
}

/**
 * One `SightFrames` per open view, shared by every extension. A view keeps its frames across the
 * maps its tabs load, so they restart whenever the store starts or ends a load or holds another
 * map: no darkness or explored memory worked out for one scene ever stands in for another. An
 * edit of the explored memory drops the decoded mask too: one from before it may show forgotten areas.
 */
export class SightFramesByView {
  private readonly entries = new Map<ViewId, Entry>();

  constructor(private readonly decode?: ExploredDecoder) {}

  of(view: { readonly viewId: ViewId; readonly atlasStore: ViewAtlasStore }): SightFrames {
    return this.entry(view).frames;
  }

  /** Calls `listener` when the view's raster should be asked for again (a deferred one is due, a mask decoded). */
  onDue(view: { readonly viewId: ViewId; readonly atlasStore: ViewAtlasStore }, listener: () => void): () => void {
    const { listeners } = this.entry(view);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  /** The view closed: its frames, timers and decodes go with it. */
  close(viewId: ViewId): void {
    const entry = this.entries.get(viewId);
    if (!entry) return;
    this.entries.delete(viewId);
    entry.unsubscribe();
    entry.frames.dispose();
    entry.listeners.clear();
  }

  dispose(): void {
    for (const viewId of [...this.entries.keys()]) this.close(viewId);
  }

  private entry(view: { readonly viewId: ViewId; readonly atlasStore: ViewAtlasStore }): Entry {
    const known = this.entries.get(view.viewId);
    if (known) return known;
    const listeners = new Set<() => void>();
    const frames = new SightFrames(() => { for (const listener of [...listeners]) listener(); }, this.decode);
    const unsubscribe = view.atlasStore.subscribe((state, previous) => {
      if (state.isMapLoading !== previous.isMapLoading || state.mapPath !== previous.mapPath) frames.restart();
      // An edit by hand, an undo or a redo may take area out of the memory: the mask before it never stands in again.
      else if (state.exploredEdits !== previous.exploredEdits) frames.forgetExplored();
    });
    const entry = { frames, listeners, unsubscribe };
    this.entries.set(view.viewId, entry);
    return entry;
  }
}
