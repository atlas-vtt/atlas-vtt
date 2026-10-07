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

/** What the memory reads of its view's state and the two actions it calls; the tracked records let it trim the undo history (`forgetExploredEdits`). */
export type ExploredMemoryState = HistorySnapshot & Pick<ViewState, 'mapPath' | 'isMapLoading' | 'exploredEdits'> & {
  setExploredMask(dataUrl: string | null): void;
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
  private ready = true;
  private contextLost = false;
  private readonly saver: ExploredSaveScheduler;
  private readonly steps: ExploredSteps;
  /** The store's count of edits the texture stands at. */
  private revision: number;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: ExploredMemoryDeps) {
    this.saver = new ExploredSaveScheduler(() => deps.store.getState().mapPath, () => deps.guard(() => this.save()), EXPLORED_SAVE_DELAY);
    this.steps = new ExploredSteps(deps.renderer);
    this.revision = deps.store.getState().exploredEdits;
    // Undo and redo move the count; an edit of this memory's own has moved `revision` along with it.
    this.unsubscribe = deps.store.subscribe((state) => this.follow(state.exploredEdits, state.isMapLoading));
  }

  /** Sizes the memory to the map and loads the scene's saved mask unless the texture holds it. */
  sync(bounds: MapBounds, mask: string | null): void {
    this.ensure(bounds);
    if (mask !== this.loadedMask) void this.load(mask);
  }

  record(shapes: ExploredShapes): void {
    if (!this.texture || !this.bounds) return;
    this.texture.add(shapes);
    this.steps.sightRecorded(shapes, this.bounds);
    this.saver.schedule();
  }

  /**
   * Edits the memory by hand, as one undo step: a stroke that reveals or forgets, on the texture
   * sight records into. False when it changed nothing: outside the map, or while the texture is
   * not the memory (its mask still loading, a lost context).
   */
  edit(edit: ExploredEdit): boolean {
    const texture = this.texture;
    if (!texture || !this.bounds || !this.isMemory()) return false;
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
    this.deps.store.getState().setExploredMask(null);
    this.deps.guard(() => {
      this.texture?.clear();
      this.deps.onChange();
    });
  }

  /** The WebGL context is lost: nothing the texture holds from now on is the memory. */
  holdSaves(): void {
    this.contextLost = true;
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
    this.saver.flush();
    this.texture?.clear();
    this.supersede();
    this.forgetEdits();
  }

  /** Lighting stopped: what is pending is never saved. */
  cancelSaves(): void {
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
  }

  private ensure(bounds: MapBounds): void {
    if (this.texture && this.bounds?.width === bounds.width && this.bounds.height === bounds.height) return;
    const previous = this.texture;
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
        this.ready = true;
        this.deps.onChange();
      });
    }
    if (!drawn) image.destroy(true);
  }

  private save(): void {
    if (!this.texture || !this.ready || this.contextLost) return;
    this.loadedMask = saveExploredMask(this.texture.toCanvas());
    this.deps.store.getState().setExploredMask(this.loadedMask);
  }
}
