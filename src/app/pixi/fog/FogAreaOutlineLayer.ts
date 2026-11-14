/**
 * The outlines of the fog Atlas remembers as pieces (areas), as the GM sees them while the fog
 * tool is chosen: a solid line around a hidden piece, a dashed one around a revealed piece. It
 * is the tool's working view and shows where a right-click offers Reveal or Hide; with another
 * tool the map carries no mark of them. While the fog's menu is open, with any tool, what its
 * entry will act on is outlined (`setTarget`). Nothing of it is the players': the layer hides
 * while the canvas shows their view, and their frame and a picture of the scene leave it out.
 */
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { areaIsHidden, areaOutline, fogAreaList, type FogArea } from '../../fog/fogAreas';
import { isFogTool } from '../../fog/fogToolChoices';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { canvasBadgeTheme, type CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { drawAreaOutlines } from './fogAreaOutlines';
import { viewedFog } from './FogPicture';
import { showsGmView } from './fogVisibilityPolicy';

/** Above the fog's picture (999), below the outline, ring and guide of a stroke under way (1001 and up). */
export const FOG_AREAS_Z_INDEX = 1000;

type Outlines = ReadonlyArray<readonly Point[]>;

export interface FogAreaOutlineLayerDeps {
  readonly viewport: Viewport;
  readonly store: Pick<ViewAtlasStore, 'getState' | 'subscribe'>;
  /**
   * Whether the canvas shows the players' view though the store's view switches say the GM's (a
   * peek); null where nobody can say yet.
   */
  readonly showsPlayers?: () => boolean | null;
  readonly readTheme?: () => CanvasBadgeTheme;
}

export class FogAreaOutlineLayer {
  readonly view = new Container({ label: 'fog-areas', zIndex: FOG_AREAS_Z_INDEX, eventMode: 'none', interactiveChildren: false, visible: false });
  private readonly pieces = new Graphics({ label: 'fog-area-outlines' });
  private readonly target = new Graphics({ label: 'fog-menu-target' });
  private readonly readTheme: () => CanvasBadgeTheme;
  private accent: number;
  private readonly themeObserver: MutationObserver;
  private readonly unsubscribe: () => void;
  /** What the menu's entry will act on; null while no menu is open. */
  private targeted: Outlines | null = null;
  /** What was last drawn, and for which zoom and accent: nothing is drawn again while it is the same. */
  private drawn: { areas: readonly FogArea[] | null; targeted: Outlines | null; zoom: number; accent: number } | null = null;
  private pending = false;

  private readonly onZoom = (): void => {
    if (!this.view.visible || this.pending) return;
    // Once in the frame's tick, however many zoom events it brought; at once where the viewport has no ticker.
    const ticker = this.deps.viewport.options.ticker;
    if (!ticker) {
      this.draw();
      return;
    }
    this.pending = true;
    ticker.addOnce(this.flush);
  };

  private readonly flush = (): void => {
    this.pending = false;
    if (this.view.visible) this.draw();
  };

  constructor(private readonly deps: FogAreaOutlineLayerDeps) {
    this.readTheme = deps.readTheme ?? canvasBadgeTheme;
    this.accent = this.readTheme().accent;
    this.view.addChild(this.pieces, this.target);
    deps.viewport.on('zoomed', this.onZoom);
    deps.viewport.on('zoomed-end', this.onZoom);
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      const fogChanged = viewedFog(state) !== viewedFog(previous);
      // What a menu was opened on is another thing once the fog is.
      if (fogChanged) this.targeted = null;
      if (
        fogChanged
        || state.activeTool !== previous.activeTool
        || state.isMapLoading !== previous.isMapLoading
        || state.isGMView !== previous.isGMView
        || state.isPlayerView !== previous.isPlayerView
      ) this.sync();
    });
    // The outlines take the theme's accent, like the pins.
    this.themeObserver = new MutationObserver(() => {
      const { accent } = this.readTheme();
      if (accent === this.accent) return;
      this.accent = accent;
      this.sync();
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.sync();
  }

  /** The canvas shows another view (the GM's, or the players'): the layer shows or hides. */
  refreshVisibility(): void {
    this.sync();
  }

  /** The fog's menu is open on `outlines` (what its entry will act on), or closed (null). */
  setTarget(outlines: Outlines | null): void {
    if (outlines === this.targeted) return;
    this.targeted = outlines;
    this.sync();
  }

  destroy(): void {
    this.unsubscribe();
    this.themeObserver.disconnect();
    this.deps.viewport.off('zoomed', this.onZoom);
    this.deps.viewport.off('zoomed-end', this.onZoom);
    this.deps.viewport.options.ticker?.remove(this.flush);
    if (!this.view.destroyed) destroyTree(this.view);
  }

  /** Whether the canvas shows the GM's view of a loaded scene: only then is anything outlined. */
  private shown(state: ViewAtlasState): boolean {
    return !state.isMapLoading && showsGmView(state, this.deps.showsPlayers);
  }

  private sync(): void {
    const state = this.deps.store.getState();
    if (!this.shown(state)) {
      // A menu's mark does not outlast the view it was opened in.
      this.targeted = null;
      this.view.visible = false;
      return;
    }
    const areas = isFogTool(state.activeTool) ? fogAreaList(viewedFog(state)) : null;
    this.view.visible = (areas !== null && areas.length > 0) || this.targeted !== null;
    // Hidden with something drawn, the layer keeps it: shown again for the same, it draws nothing.
    if (this.view.visible) this.draw(areas);
  }

  /** Draws the pieces' outlines (none with another tool than the fog tool) and the menu's target, each only where it changed. */
  private draw(areas: readonly FogArea[] | null = this.drawn?.areas ?? null): void {
    const zoom = this.zoom();
    const { accent, targeted } = this;
    const last = this.drawn;
    const same = last !== null && last.zoom === zoom && last.accent === accent;
    this.drawn = { areas, targeted, zoom, accent };
    if (!same || last.areas !== areas) {
      drawAreaOutlines(this.pieces, (areas ?? []).map((area) => ({ outline: areaOutline(area), dashed: !areaIsHidden(area) })), zoom, accent);
    }
    if (!same || last.targeted !== targeted) {
      drawAreaOutlines(this.target, (targeted ?? []).map((outline) => ({ outline, dashed: false })), zoom, accent);
    }
  }

  private zoom(): number {
    const zoom = this.deps.viewport.scale.x;
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }
}
