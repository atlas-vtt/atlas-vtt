import { gmPictureDiffers } from '../lighting/sceneLightingOptions';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';

export interface SceneThumbnailPorts {
  /** Renders the scene the view shows now; null when there is nothing to frame. */
  render: () => ArrayBuffer | null;
  save: (mapPath: string, bytes: ArrayBuffer) => Promise<void>;
  hasThumbnail: (mapPath: string) => Promise<boolean>;
}

/** Edits come in bursts (a token drag, a fog sweep); the thumbnail follows once they settle. */
const AFTER_EDIT_MS = 3000;
/** A scene without a thumbnail gets one shortly after it opens, once the opening has settled. */
const AFTER_OPEN_MS = 1000;

/** Walls, lights and tokens with vision or a light are `objects`; the scene's own lighting counts where the GM's picture shows it. */
function contentChanged(state: ViewAtlasState, previous: ViewAtlasState): boolean {
  return state.background !== previous.background || state.grid !== previous.grid || state.objects !== previous.objects
    || gmPictureDiffers(state.lighting, previous.lighting);
}

/**
 * Keeps the thumbnail of the scene a map view shows in step with it. A scene
 * gets one when it opens without one (a new scene, or one from before
 * thumbnails or from outside Atlas), a new one after edits settle and after
 * it is loaded again in the same view (a restored snapshot). Work
 * still pending when the view switches scene or closes is done at once
 * (`flush`), while the view still shows that scene.
 */
export class SceneThumbnailUpdater {
  private stalePath: string | null = null;
  /** The scene the view showed after its last load; loading it again is a reload. */
  private shownPath: string | null = null;
  private timer: number | null = null;
  private destroyed = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly store: ViewAtlasStore, private readonly ports: SceneThumbnailPorts) {
    this.unsubscribe = store.subscribe((state, previous) => this.onStoreChange(state, previous));
  }

  /** Writes a pending thumbnail now; call before the view shows another scene or closes. */
  flush(): void {
    if (!this.stalePath) return;
    this.clearTimer();
    this.write(false);
  }

  destroy(): void {
    this.unsubscribe();
    this.flush();
    this.destroyed = true;
  }

  private onStoreChange(state: ViewAtlasState, previous: ViewAtlasState): void {
    if (state.isPlayerView || !state.persistenceEnabled || state.isMapLoading || !state.mapPath) return;
    if (previous.isMapLoading) {
      // A reload (a restored snapshot, a rewrite after a transfer) may show different content
      const reloaded = this.shownPath === state.mapPath;
      this.shownPath = state.mapPath;
      if (reloaded) this.markStale(state.mapPath, AFTER_OPEN_MS);
      else this.ensureThumbnail(state.mapPath);
    } else if (state.mapLoaded && state.mapPath === previous.mapPath && contentChanged(state, previous)) {
      this.markStale(state.mapPath, AFTER_EDIT_MS);
    }
  }

  /** Gives a scene that just opened a thumbnail if it has none. */
  private ensureThumbnail(mapPath: string): void {
    this.ports.hasThumbnail(mapPath).then((exists) => {
      if (!exists && !this.destroyed && this.store.getState().mapPath === mapPath && this.stalePath === null) this.markStale(mapPath, AFTER_OPEN_MS);
    }).catch((error: unknown) => {
      console.error('[SceneThumbnailUpdater] Could not check the scene thumbnail:', error);
    });
  }

  private markStale(mapPath: string, delay: number): void {
    this.stalePath = mapPath;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.write(true);
    }, delay);
  }

  /**
   * Renders the stale scene if the view still shows it; another scene's pixels must never become
   * its thumbnail. Nor does a store that is out of use (`mapLoaded` false: the scene's file is
   * being rewritten, or its load failed) show the scene: the thumbnail it has stays. While the
   * grid is being aligned the canvas shows the alignment's preview and its marks, and the thumbnail
   * waits for the scene itself where it `canWait`; a view that moves on or closes meanwhile leaves
   * the thumbnail the scene has.
   */
  private write(canWait: boolean): void {
    const mapPath = this.stalePath;
    this.stalePath = null;
    const state = this.store.getState();
    if (!mapPath || state.mapPath !== mapPath || state.isMapLoading || !state.mapLoaded) return;
    if (state.isGridAlignmentOpen) {
      if (canWait) this.markStale(mapPath, AFTER_EDIT_MS);
      return;
    }
    let bytes: ArrayBuffer | null;
    try {
      bytes = this.ports.render();
    } catch (error) {
      console.error('[SceneThumbnailUpdater] Could not render the scene thumbnail:', error);
      return;
    }
    if (!bytes) return;
    this.ports.save(mapPath, bytes).catch((error: unknown) => {
      console.error('[SceneThumbnailUpdater] Could not save the scene thumbnail:', error);
    });
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
  }
}
