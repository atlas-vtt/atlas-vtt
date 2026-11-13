/**
 * The fog area selected in the fog tool's Areas mode (store `fogAreaSelected`), and what the
 * pointer and the keys do with it: a corner is dragged (snapped, Ctrl or Cmd frees it), a press
 * on an edge adds a corner there and drags it, a double click on a corner removes it, a drag
 * inside the area moves it, Delete deletes it and Escape lets go of it. Every gesture is one
 * undo step; one that is cancelled, or that ends where the outline would cross itself or enclose
 * nothing, puts the area back and leaves none. A rectangle stays a rectangle while its corners
 * are dragged; a corner more or less makes it an outline of corners.
 */
import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { cornerAt, edgeAt, withCornerAdded, withoutCorner } from '../../fog/fogAreaEdit';
import { areaOutline, fogAreaList, MAX_AREA_CORNERS, type FogArea } from '../../fog/fogAreas';
import { areaAtPoint, insideOutline } from '../../fog/fogAreaStroke';
import { makesFogAreas } from '../../fog/fogToolChoices';
import { t } from '../../i18n';
import type { ViewAtlasState } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { FogAreaChanges } from '../../stores/fogSlice';
import type { Point } from '../../types/visionTypes';
import { showNotice } from '../../ui/notice';
import { DoubleClick } from '../annotations/DoubleClick';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import { grabChanges, type FogAreaGrab } from './fogAreaGrab';
import { FogAreaKeys } from './FogAreaKeys';
import { drawAreaHandles, FOG_HANDLE } from './fogAreaHandles';
import { viewedFog } from './FogPicture';
import type { FogSnapping, PlaceKeys } from './FogSnapping';

/** Screen pixels the pointer may move from where it was pressed before the press is a drag. */
export const CLICK_SLOP = 4;

/** How a press on the selected area ended: nothing was held, a drag or an edit ended, or the area itself was clicked in place. */
export type FogAreaRelease = 'none' | 'done' | 'click';

export interface FogAreaEditorDeps {
  readonly viewport: Viewport;
  /** The map's canvas: its window hears the selection's keys, and a pointer cancelled on it ends a drag. */
  readonly canvas: () => HTMLCanvasElement;
  readonly store: StoreApi<ViewAtlasState>;
  readonly snapping: FogSnapping;
  /** Whether the canvas shows the players' view though the store's view switches say the GM's (a peek). */
  readonly showsPlayers?: () => boolean | null;
  /** Whether a key pressed now is this map's to take; unset, every key outside a text field is. */
  readonly keysBelongToMap?: (event: KeyboardEvent) => boolean;
  /** A stroke is under way: the keys are its own. */
  readonly busy: () => boolean;
}

export class FogAreaEditor {
  /** The selected area's corner handles. */
  readonly view = new Graphics();
  private grab: FogAreaGrab | null = null;
  /** The corner the pointer is on. */
  private lit: number | null = null;
  private clicks = new DoubleClick();
  private readonly keys: FogAreaKeys;
  /** What the handles were last drawn for. */
  private drawn: { outline: readonly Point[]; zoom: number; lit: number | null; accent: number; background: number } | null = null;
  private readonly unsubscribe: () => void;
  private readonly onZoom = (): void => this.draw();
  private readonly onPointerCancel = (): void => this.cancel();

  constructor(private readonly deps: FogAreaEditorDeps) {
    this.view.eventMode = 'none';
    this.view.visible = false;
    this.keys = new FogAreaKeys(deps.canvas, {
      mayTake: (event) => !deps.busy() && this.selected() !== null && (deps.keysBelongToMap?.(event) ?? true),
      deleted: () => this.remove(),
      escaped: () => (this.grab ? this.cancel() : this.select(null)),
      blurred: () => this.cancel(),
    });
    deps.viewport.on('zoomed', this.onZoom);
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      const id = state.fogAreaSelected;
      const changed = id !== previous.fogAreaSelected;
      if (changed) this.lit = null;
      // An area that went (deleted, undone, another level), another tool or mode, the players' view, a load: nothing is selected any more.
      if (id && this.areaOf(state, id) === null) {
        this.cancel();
        state.selectFogArea(null);
        return;
      }
      if (id) this.keys.hold();
      else this.keys.release();
      if (changed || viewedFog(state) !== viewedFog(previous)) this.draw();
    });
  }

  /** The selected area is held by the pointer. */
  get dragging(): boolean {
    return this.grab !== null;
  }

  /** Whether areas can be selected now: the fog tool is in Areas mode, on the GM's view of a loaded scene. */
  get editable(): boolean {
    return this.mayEdit(this.deps.store.getState());
  }

  /** The area the world point lies in, or null. */
  areaAt(world: Point): string | null {
    return areaAtPoint(fogAreaList(viewedFog(this.deps.store.getState())), world)?.id ?? null;
  }

  /** Selects an area, or none (null). */
  select(id: string | null): void {
    const state = this.deps.store.getState();
    if (state.fogAreaSelected === id || (id !== null && this.areaOf(state, id) === null)) return;
    state.selectFogArea(id);
  }

  /**
   * A press at `world` (`screen` on the canvas). True where the selected area took it: one of its
   * corners or edges, or, without Alt, the area itself.
   */
  press(world: Point, screen: Point, alt: boolean): boolean {
    // A drag whose release never came (a button released outside the window) ends here.
    this.cancel();
    const area = this.selected();
    if (!area) return false;
    const outline = areaOutline(area);
    const zoom = this.zoom();
    const corner = cornerAt(outline, world, FOG_HANDLE.cornerReach / zoom);
    if (corner !== null) {
      if (this.clicks.pressed(`corner:${area.id}:${corner}`, screen)) this.removeCorner(area, corner);
      else this.hold(area, 'corner', corner, outline, world, screen);
      return true;
    }
    const edge = edgeAt(outline, world, FOG_HANDLE.edgeReach / zoom);
    if (edge) {
      this.addCorner(area, edge, world, screen);
      return true;
    }
    if (alt || !insideOutline(world, outline)) return false;
    this.hold(area, 'move', 0, outline, world, screen);
    return true;
  }

  /** The pointer moved to `world`. True while the selected area is held: the move is its drag's. */
  move(world: Point, screen: Point, keys: PlaceKeys): boolean {
    const grab = this.grab;
    if (!grab) return false;
    grab.at = world;
    if (!grab.moved) {
      if (Math.hypot(screen.x - grab.pressedOnScreen.x, screen.y - grab.pressedOnScreen.y) < CLICK_SLOP) return true;
      grab.moved = true;
      // A drag is no first click of two: a press on the corner right after it removes nothing.
      this.clicks = new DoubleClick();
    }
    this.write(grab, grabChanges(grab, world, (at) => this.deps.snapping.corner(at, keys, null, grab.id)));
    return true;
  }

  /** The pointer was released: a drag ends as one undo step, or as none where it changed nothing. */
  release(): FogAreaRelease {
    const grab = this.grab;
    if (!grab) return 'none';
    this.letGo();
    if (grab.open) {
      if (viewedFog(this.deps.store.getState())[grab.id] !== grab.before) endHistoryTransaction(this.deps.store);
      else abandonHistoryTransaction(this.deps.store);
    }
    this.draw();
    return grab.what === 'move' && !grab.moved ? 'click' : 'done';
  }

  /** Lights the corner of the selected area under the pointer. True where a press there is the area's own: on a corner or an edge. */
  hover(world: Point): boolean {
    const area = this.selected();
    if (!area) return false;
    const outline = areaOutline(area);
    const zoom = this.zoom();
    const corner = cornerAt(outline, world, FOG_HANDLE.cornerReach / zoom);
    if (corner !== this.lit) {
      this.lit = corner;
      this.draw();
    }
    return corner !== null || edgeAt(outline, world, FOG_HANDLE.edgeReach / zoom) !== null;
  }

  /** Ends a drag under way without a trace: the area is as it was, and no undo step is left. */
  cancel(): void {
    const grab = this.grab;
    if (!grab) return;
    this.letGo();
    if (grab.open) {
      this.deps.store.getState().restoreFogArea(grab.before);
      abandonHistoryTransaction(this.deps.store);
    }
    this.draw();
  }

  /** The canvas shows another view (the GM's, or the players'): a selection ends with the GM's. */
  refresh(): void {
    if (this.deps.store.getState().fogAreaSelected && !this.editable) {
      this.cancel();
      this.select(null);
    }
    this.draw();
  }

  destroy(): void {
    this.cancel();
    this.unsubscribe();
    this.keys.release();
    this.deps.viewport.off('zoomed', this.onZoom);
    if (!this.view.destroyed) this.view.destroy();
  }

  private mayEdit(state: ViewAtlasState): boolean {
    return makesFogAreas(state) && state.isGMView && state.isPlayerView !== true && !state.isMapLoading && this.deps.showsPlayers?.() !== true;
  }

  /** The area `id` names on the level shown, where it can be edited now. */
  private areaOf(state: ViewAtlasState, id: string): FogArea | null {
    if (!this.mayEdit(state)) return null;
    return fogAreaList(viewedFog(state)).find((area) => area.id === id) ?? null;
  }

  private selected(): FogArea | null {
    const state = this.deps.store.getState();
    return state.fogAreaSelected ? this.areaOf(state, state.fogAreaSelected) : null;
  }

  private zoom(): number {
    const zoom = this.deps.viewport.scale.x;
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  private hold(area: FogArea, what: FogAreaGrab['what'], index: number, outline: readonly Point[], world: Point, screen: Point, open = false): void {
    this.grab = {
      id: area.id, what, index, before: area, outline, rectangle: area.type === 'rectangle' && !open,
      pressedAt: world, pressedOnScreen: screen, at: world, moved: false, open,
    };
    this.deps.canvas().addEventListener('pointercancel', this.onPointerCancel);
    this.draw();
  }

  private letGo(): void {
    this.grab = null;
    this.deps.canvas().removeEventListener('pointercancel', this.onPointerCancel);
    this.deps.snapping.clear();
  }

  /** A press on an edge: a corner is added there, and held. The gesture's undo step begins with it. */
  private addCorner(area: FogArea, edge: { index: number; point: Point }, world: Point, screen: Point): void {
    const { store } = this.deps;
    const outline = areaOutline(area);
    if (outline.length >= MAX_AREA_CORNERS) {
      showNotice(t('fog.areaCornersFull'));
      return;
    }
    const points = withCornerAdded(outline, edge.index, edge.point);
    beginHistoryTransaction(store);
    if (store.getState().updateFogArea(area.id, { points })) this.hold(area, 'corner', edge.index + 1, points, world, screen, true);
    else abandonHistoryTransaction(store);
  }

  /** A double click on a corner: it goes, where three corners that make an area are left. */
  private removeCorner(area: FogArea, index: number): void {
    const points = withoutCorner(areaOutline(area), index);
    if (points) this.deps.store.getState().updateFogArea(area.id, { points });
  }

  private remove(): void {
    const area = this.selected();
    if (!area) return;
    this.cancel();
    this.deps.store.getState().deleteFogAreas([area.id]);
  }

  /** Gives the held area its outline for where the pointer is; one that is refused (null) springs back to what it was. */
  private write(grab: FogAreaGrab, changes: FogAreaChanges | null): void {
    const { store } = this.deps;
    if (!grab.open) {
      beginHistoryTransaction(store);
      grab.open = true;
    }
    if (changes) store.getState().updateFogArea(grab.id, changes);
    else store.getState().restoreFogArea(grab.before);
  }

  /** Draws the selected area's handles, where the outline, the zoom, the corner lit or the theme changed. */
  private draw(): void {
    const area = this.selected();
    const outline = area ? areaOutline(area) : null;
    if (!outline || outline.length < 3) {
      this.view.visible = false;
      return;
    }
    const grab = this.grab;
    const lit = grab ? (grab.what === 'corner' ? cornerAt(outline, grab.at, Infinity) : null) : this.lit;
    const theme = canvasBadgeTheme();
    const zoom = this.zoom();
    this.view.visible = true;
    const last = this.drawn;
    if (last && last.outline === outline && last.zoom === zoom && last.lit === lit && last.accent === theme.accent && last.background === theme.background) return;
    this.drawn = { outline, zoom, lit, accent: theme.accent, background: theme.background };
    drawAreaHandles(this.view, outline, zoom, theme, lit);
  }
}
