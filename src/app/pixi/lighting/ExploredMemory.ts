import type { Renderer, Texture } from 'pixi.js';
import type { StoreApi } from 'zustand/vanilla';
import { editPolygons, type ExploredEdit } from '../../lighting/exploredEdits';
import type { HistorySnapshot } from '../../stores/history';
import { forgetExploredEdits } from '../../stores/exploredEditHistory';
import type { ViewState } from '../../types/viewState';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import { saveExploredMask } from './exploredMaskSaving';
import { ExploredSaveScheduler } from './ExploredSaveScheduler';
import { ExploredSteps } from './ExploredSteps';
import { ExploredTexture } from './ExploredTexture';

const EXPLORED_SAVE_DELAY = 2000;
/** What sight recorded while a mask decodes, kept to draw again over it: a mask that never decodes must not grow this without end. */
const MAX_RECORDED_WHILE_LOADING = 64;

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

/**
 * What the scene's tokens have seen, for one map view: the world-space texture, the mask it
 * was loaded from and the debounced save back into the scene. The texture is saved only while
 * it is the memory: not while a saved mask is on its way in or failed to load, and not between
 * a lost WebGL context and the reload after its restore, so a blank texture never replaces the
 * saved mask.
 *
 * The GM edits it by hand too (`edit`). Each edit is one undo step: the store counts the edits
 * (`exploredEdits`, in its undo history), and `ExploredSteps` keeps what each one changed and
 * puts it back when undo or redo changes the count. The steps last while the scene stays
 * loaded; where they are lost before the history is (the texture is replaced, the view goes),
 * they leave the history too (`forgetExploredEdits`).
 */
export class ExploredMemory {
  private texture: ExploredTexture | null = null;
  private bounds: MapBounds | null = null;
  /** The mask the texture holds; undefined after a failed load, so that the next `sync` retries. */
  private loadedMask: string | null | undefined = null;
  /** Bumped whenever the texture's content is superseded, so a load decoded too late is dropped. */
  private loadGeneration = 0;
  /** What sight recorded while a saved mask was on its way in: drawn again over the mask once it is. */
  private recordedWhileLoading: ExploredShapes[] = [];
  private ready = true;
  private contextLost = false;
  private readonly saver: ExploredSaveScheduler;
  private readonly steps: ExploredSteps;
  /** The store's count of edits the texture stands at. */
  private revision: number;
  /** The level whose memory the texture holds (null: a scene without levels); undefined before the first `sync`. */
  private level: string | null | undefined = undefined;
  /** Sight recorded since the last stamp, waiting for its turn (`stampEveryMs`). */
  private waiting: ExploredShapes | null = null;
  private lastStamp = -Infinity;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: ExploredMemoryDeps) {
    this.saver = new ExploredSaveScheduler(() => deps.store.getState().mapPath, () => deps.guard(() => this.save()), EXPLORED_SAVE_DELAY);
    this.steps = new ExploredSteps(deps.renderer);
    this.revision = deps.store.getState().exploredEdits;
    // Undo and redo move the count; an edit of this memory's own has moved `revision` along with it.
    this.unsubscribe = deps.edits === false ? (): void => undefined : deps.store.subscribe((state) => this.follow(state.exploredEdits, state.isMapLoading));
  }

  /**
   * Sizes the memory to the map and loads the saved mask of `level` (the one the view shows)
   * unless the texture holds it. Another level is like another scene: the memory of the level
   * left is saved into it first, and its edits can no longer be undone.
   */
  sync(bounds: MapBounds, mask: string | null, level: string | null = null): void {
    this.ensure(bounds);
    if (level !== this.level) this.switchLevel(level);
    if (mask !== this.loadedMask) void this.load(mask);
  }

  /**
   * Records what sight sees now. With `now` (ms, the clock `stampDue` is asked by; a drag gives it)
   * it waits for its turn (`stampEveryMs`); without, it is stamped at once and what waited goes.
   */
  record(shapes: ExploredShapes, now?: number): void {
    if (!this.texture || !this.bounds) return;
    if (this.beforeTurn(now)) {
      this.waiting = shapes;
      // The save stamps it first, should no turn come before.
      this.saver.schedule();
      return;
    }
    this.stamp(shapes, now);
  }

  /** Stamps the sight that waits for its turn (`stampEveryMs`), once that has come at `now`; unset, whatever the time. True when it stamped. */
  stampDue(now?: number): boolean {
    const shapes = this.waiting;
    if (!shapes || this.beforeTurn(now)) return false;
    this.deps.guard(() => this.stamp(shapes, now));
    return true;
  }

  /** Whether sight recorded at `now` comes before its turn (`stampEveryMs`); without a time it never does. */
  private beforeTurn(now: number | undefined): boolean {
    return now !== undefined && now - this.lastStamp < (this.deps.stampEveryMs ?? 0);
  }

  /** Stamps `shapes` in; one stamped out of turn (no `now`: before a save, a switch, an edit) leaves the turns as they were. */
  private stamp(shapes: ExploredShapes, now?: number): void {
    this.waiting = null;
    if (now !== undefined) this.lastStamp = now;
    if (!this.texture || !this.bounds) return;
    this.texture.add(shapes);
    // The decoded mask replaces the texture: what is seen meanwhile must not go with what it replaces.
    // A mask that never decodes keeps the memory from being saved at all; the oldest go past the cap.
    if (!this.ready) this.recordedWhileLoading = [...this.recordedWhileLoading.slice(1 - MAX_RECORDED_WHILE_LOADING), shapes];
    this.steps.sightRecorded(shapes, this.bounds);
    this.saver.schedule();
  }

  /**
   * Edits the memory by hand, as one undo step: a stroke that reveals or forgets, on the texture
   * sight records into. False when it changed nothing: outside the map, or while the texture is
   * not the memory (its mask still loading, a lost context).
   */
  edit(edit: ExploredEdit): boolean {
    this.stampDue();
    const texture = this.texture;
    if (!texture || !this.bounds || !this.isMemory() || this.deps.edits === false) return false;
    const shapes: ExploredShapes = { polygons: editPolygons(edit, this.bounds), clip: null };
    // The steps can tell only so many edits apart: before that runs out, the older ones can no longer be undone.
    if (this.steps.full) this.forgetEdits();
    let changed = false;
    this.deps.guard(() => {
      changed = this.steps.apply(texture, shapes, edit.mode, this.revision + 1);
      if (changed) this.deps.onChange();
    });
    if (!changed) return false;
    this.revision++;
    this.deps.store.getState().setExploredEdits(this.revision);
    this.saver.schedule();
    return true;
  }

  /**
   * Forgets everything. An undo step like every edit while the texture is the memory; while it
   * is not (its mask still loading or unreadable), the saved mask goes at once and for good.
   */
  reset(): void {
    // Nothing changed although the texture is the memory: there was nothing to forget.
    if (this.edit({ mode: 'forget', area: 'everything' }) || this.isMemory()) return;
    // No undo may bring back what goes for good.
    this.forgetEdits();
    this.supersede();
    this.deps.store.getState().setExploredMask(null, this.level ?? null);
    this.deps.guard(() => {
      this.texture?.clear();
      this.deps.onChange();
    });
  }

  /** The WebGL context is lost: nothing the texture holds from now on is the memory. */
  holdSaves(): void {
    this.contextLost = true;
    this.waiting = null;
    this.saver.cancel();
  }

  /**
   * The context is back and the texture blank, with lighting on or off: reload the saved
   * memory. A save pending from before holds only what the lost texture had.
   */
  reload(mask: string | null): void {
    this.contextLost = false;
    this.saver.cancel();
    this.loadedMask = null;
    void this.load(mask);
  }

  /** Before the map unloads: save the scene's pending memory into it, then start the next scene blank. */
  beforeMapUnload(): void {
    this.stampDue();
    this.saver.flush();
    this.texture?.clear();
    this.supersede();
    this.forgetEdits();
  }

  private switchLevel(level: string | null): void {
    // What the level left saw goes into its memory; the save is heard by the store, whose listeners may have switched already
    this.stampDue();
    if (this.level !== undefined) this.saver.flush();
    if (this.level === level) return;
    const first = this.level === undefined;
    this.level = level;
    if (first) return;
    this.texture?.clear();
    this.supersede();
    this.forgetEdits();
  }

  /** Lighting stopped: what is pending is never saved. */
  cancelSaves(): void {
    this.waiting = null;
    this.saver.cancel();
    this.loadGeneration++;
  }

  destroy(): void {
    this.unsubscribe();
    this.cancelSaves();
    this.forgetEdits();
    if (this.texture) this.deps.onTexture(null);
    this.texture?.destroy();
    this.texture = null;
  }

  /**
   * The store's count of edits changed without an edit here: undo or redo. Each step between is
   * taken back or made again on the texture. A load starts the count over too, which takes no
   * edit back; and where the texture cannot be written (a lost context, an engine that
   * stopped) or the steps are gone (the guard found a restored context, which forgets them),
   * nothing is saved and no one is told.
   */
  private follow(count: number, loading: boolean): void {
    if (count === this.revision) return;
    const from = this.revision;
    this.revision = count;
    const texture = this.texture;
    if (!texture || loading) return;
    let travelled = false;
    this.deps.guard(() => {
      if (!this.steps.leads(from, count)) return;
      this.steps.travel(texture, from, count);
      travelled = true;
      this.deps.onChange();
    });
    if (!travelled) return;
    this.saver.schedule();
    this.deps.onTravel(count < from);
  }

  /**
   * The edits' steps no longer fit the texture, or the scene: they go, here and in the store's
   * history. Also for the owner to call when the texture is drawn anew from the saved mask
   * (a restored WebGL context).
   */
  forgetEdits(): void {
    if (this.steps.size === 0) return;
    this.steps.clear();
    forgetExploredEdits(this.deps.store);
    // This may run inside the notification of an undo (the first lighting work after a restored
    // context), which then writes its own lists over the history: once more when it is done,
    // unless an edit has been made meanwhile, whose step must stay.
    queueMicrotask(() => {
      if (this.steps.size === 0) forgetExploredEdits(this.deps.store);
    });
  }

  /** The texture holds the scene's memory: its mask is in, and no lost context took it. */
  private isMemory(): boolean {
    return !!this.texture && this.ready && !this.contextLost;
  }

  private supersede(): void {
    this.loadedMask = null;
    this.loadGeneration++;
    this.ready = true;
    this.recordedWhileLoading = [];
  }

  private ensure(bounds: MapBounds): void {
    if (this.texture && this.bounds?.width === bounds.width && this.bounds.height === bounds.height) return;
    const previous = this.texture;
    // What waits was seen on the map of the old size.
    this.waiting = null;
    this.texture = new ExploredTexture(this.deps.renderer, bounds);
    this.bounds = bounds;
    this.supersede();
    if (previous) this.forgetEdits();
    this.deps.onTexture(this.texture.texture);
    previous?.destroy();
  }

  /**
   * Each load supersedes the ones before it (a map switch or reset mid-decode must not draw the
   * old scene's memory), and the texture is unsaveable until its mask is in.
   */
  private async load(mask: string | null): Promise<void> {
    const generation = ++this.loadGeneration;
    const texture = this.texture;
    this.loadedMask = mask;
    if (!texture) return;
    if (!mask) {
      texture.clear();
      this.ready = true;
      this.deps.onChange();
      return;
    }
    this.ready = false;
    let image: Texture;
    try {
      image = await texture.decode(mask);
    } catch (error) {
      if (generation === this.loadGeneration) this.loadedMask = undefined;
      console.error('Atlas: could not load the explored areas of this scene', error);
      return;
    }
    let drawn = false;
    if (generation === this.loadGeneration) {
      this.deps.guard(() => {
        texture.draw(image);
        drawn = true;
        for (const shapes of this.recordedWhileLoading) texture.add(shapes);
        this.recordedWhileLoading = [];
        this.ready = true;
        this.deps.onChange();
      });
    }
    if (!drawn) image.destroy(true);
  }

  private save(): void {
    this.stampDue();
    if (!this.texture || !this.ready || this.contextLost) return;
    this.loadedMask = saveExploredMask(this.texture.toCanvas());
    this.deps.store.getState().setExploredMask(this.loadedMask, this.level ?? null);
  }
}
