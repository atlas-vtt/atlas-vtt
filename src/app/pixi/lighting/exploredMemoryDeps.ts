import type { Renderer, Texture } from 'pixi.js';
import type { StoreApi } from 'zustand/vanilla';
import type { HistorySnapshot } from '../../stores/history';
import type { ViewState } from '../../types/viewState';

/** What the memory reads of its view's state and the two actions it calls; the tracked records let it trim the undo history (`forgetExploredEdits`). */
export type ExploredMemoryState = HistorySnapshot & Pick<ViewState, 'mapPath' | 'isMapLoading' | 'exploredEdits'> & {
  /** Saves the memory of `level` (null: the first level), wherever the view is now. */
  setExploredMask(dataUrl: string | null, level?: string | null): void;
  setExploredEdits(count: number): void;
};

export type ExploredMemoryStore = Pick<StoreApi<ExploredMemoryState>, 'getState' | 'subscribe'>;

export interface ExploredMemoryDeps {
  renderer: Renderer;
  store: ExploredMemoryStore;
  /** Whoever draws the memory takes each new texture before the old one is destroyed; null once there is none. */
  onTexture: (texture: Texture | null) => void;
  /** Undo (`undone`) or redo put an edit by hand back into the memory. */
  onTravel: (undone: boolean) => void;
  /** The texture's pixels changed outside the stage's render. */
  onChange: () => void;
  /**
   * Runs GPU work this starts on its own (a save timer, a decoded mask): the owner skips it
   * while the graphics device cannot take it and keeps its errors from escaping.
   */
  guard: (work: () => void) => void;
  /**
   * False for a memory the GM never edits (a level below the view's, seen through openings):
   * it neither follows undo and redo of edits nor counts any.
   */
  edits?: boolean;
  /**
   * Sight recorded with a time (`record`'s `now`: during a drag) is stamped in at most this often
   * (ms; unset, every time): what is recorded sooner waits, and only the last of it is stamped
   * once its turn comes (`stampDue`), or before anything reads or replaces the memory. A stamp
   * cuts every light's lit area out of the sight on the GPU, too much for every frame of a drag;
   * an area a dragged token saw for less than this may go unremembered.
   */
  stampEveryMs?: number;
}
