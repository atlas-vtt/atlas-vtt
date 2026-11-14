/**
 * What the fog's menu acts on, outlined in the theme's accent for as long as the menu is open:
 * the body of fog under the pointer, or the revealed fog that can be hidden again. It is the
 * only mark fog carries, and the GM's alone: it goes when the fog changes or the canvas shows
 * the players' view, and their frame and a picture of the scene leave it out.
 */
import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import { drawFogOutlines } from './fogOutlines';
import { viewedFog } from './FogPicture';
import { showsGmView } from './fogVisibilityPolicy';

/** Above the fog's picture (999), below the outline, ring and guide of a stroke under way (1001 and up). */
const FOG_MENU_TARGET_Z_INDEX = 1000;

type Outlines = ReadonlyArray<readonly Point[]>;

export interface FogMenuTargetDeps {
  readonly viewport: Viewport;
  readonly store: Pick<ViewAtlasStore, 'getState' | 'subscribe'>;
  /** Whether the canvas shows the players' view though the store's view switches say the GM's (a peek); null where nobody can say yet. */
  readonly showsPlayers?: () => boolean | null;
}

export class FogMenuTarget {
  readonly view = new Graphics({ label: 'fog-menu-target', zIndex: FOG_MENU_TARGET_Z_INDEX, eventMode: 'none', visible: false });
  private readonly unsubscribe: () => void;
  /** What the open menu acts on; null while none is open. */
  private outlines: Outlines | null = null;

  private readonly onZoom = (): void => this.draw();

  constructor(private readonly deps: FogMenuTargetDeps) {
    deps.viewport.on('zoomed', this.onZoom);
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      // What a menu was opened on is another thing once the fog is, and no mark outlasts the GM's view.
      if (this.outlines && (viewedFog(state) !== viewedFog(previous) || !this.shown(state))) this.show(null);
    });
  }

  /** The fog's menu is open on `outlines`, or closed (null). */
  show(outlines: Outlines | null): void {
    const next = outlines && this.shown(this.deps.store.getState()) ? outlines : null;
    if (next === this.outlines) return;
    this.outlines = next;
    this.view.visible = next !== null;
    if (next) this.draw();
    else this.view.clear();
  }

  /** The canvas shows another view (the GM's, or the players'): the mark goes with the GM's view. */
  refreshVisibility(): void {
    if (this.outlines && !this.shown(this.deps.store.getState())) this.show(null);
  }

  destroy(): void {
    this.unsubscribe();
    this.deps.viewport.off('zoomed', this.onZoom);
    if (!this.view.destroyed) this.view.destroy();
  }

  private shown(state: ViewAtlasState): boolean {
    return !state.isMapLoading && showsGmView(state, this.deps.showsPlayers);
  }

  /** Draws the outlines as wide on screen as at any zoom. */
  private draw(): void {
    if (!this.outlines) return;
    const zoom = this.deps.viewport.scale.x;
    drawFogOutlines(this.view, this.outlines, zoom, canvasBadgeTheme().accent);
  }
}
