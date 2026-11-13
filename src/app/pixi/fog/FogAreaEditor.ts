/**
 * The fog area selected in the fog tool's Areas mode (store `fogAreaSelected`), and what the
 * pointer and the keys do with it: a corner is dragged (snapped, Ctrl or Cmd frees it), a press
 * on an edge adds a corner there and drags it, a double click on a corner removes it, a drag
 * inside the area moves it, Delete deletes it and Escape lets go of it. A drag changes nothing of
 * the scene while it lasts: the fog is the players' picture too, so the editor draws the outline
 * as it will be, and the release writes it, once, as one undo step. A drag that is cancelled, or
 * that ends where the outline would cross itself or enclose nothing, writes nothing. A rectangle
 * stays a rectangle while its corners are dragged; a corner more or less makes it an outline of corners.
 */
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { cornerAt, edgeAt, withCornerAdded, withoutCorner } from '../../fog/fogAreaEdit';
import { areaIsHidden, areaOutline, fogAreaList, MAX_AREA_CORNERS, type FogArea } from '../../fog/fogAreas';
import { areaAtPoint, insideOutline } from '../../fog/fogAreaStroke';
import { makesFogAreas } from '../../fog/fogToolChoices';
import { t } from '../../i18n';
import type { ViewAtlasState } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { showNotice } from '../../ui/notice';
import { DoubleClick } from '../annotations/DoubleClick';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { grabChanges, grabOutline, type FogAreaGrab } from './fogAreaGrab';
import { FogAreaKeys } from './FogAreaKeys';
import { areaCursorAt, drawAreaHandles, FOG_HANDLE } from './fogAreaHandles';
import { drawAreaOutlines } from './fogAreaOutlines';
import { viewedFog } from './FogPicture';
import type { FogSnapping, PlaceKeys } from './FogSnapping';
import { showsGmView } from './fogVisibilityPolicy';

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
  /** A drag shows the outline area `areaId` will have (null: no longer): whoever draws the one it has leaves it out meanwhile. */
  readonly held?: (areaId: string | null) => void;
}

export class FogAreaEditor {
  /** What the GM alone sees of the selected area: its corner handles, and under a drag the outline it will have. */
  readonly view = new Container({ eventMode: 'none', interactiveChildren: false, visible: false });
  private readonly handles = new Graphics();
  /** The outline a drag will leave; empty while none shows one. */
  private readonly preview = new Graphics();
  /** The area whose outline the preview shows. */
  private previewed: string | null = null;
  private grab: FogAreaGrab | null = null;
  /** The corner the pointer is on. */
  private lit: number | null = null;
  private clicks = new DoubleClick();
  private readonly keys: FogAreaKeys;
  /** What the handles, and the outline under them, were last drawn for. */
  private drawn: { outline: readonly Point[]; zoom: number; lit: number | null; accent: number; background: number } | null = null;
  private readonly unsubscribe: () => void;
  private readonly onZoom = (): void => this.draw();
  private readonly onPointerCancel = (): void => this.cancel();

  constructor(private readonly deps: FogAreaEditorDeps) {
    this.view.addChild(this.preview, this.handles);
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
      // The area changed under a drag (an undo, a flip): what the drag would leave is of an outline that is no more.
      if (this.grab && viewedFog(state)[this.grab.id] !== this.grab.before) this.cancel();
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
    // An outline that is refused springs back to the one the area has.
    grab.changes = grabChanges(grab, world, (at) => this.deps.snapping.corner(at, keys, null, grab.id));
    grab.shown = grab.changes && grabOutline(grab, grab.changes);
    this.draw();
    return true;
  }

  /** The pointer was released: what the drag left is written, as one undo step, or nothing where it changed nothing. */
  release(): FogAreaRelease {
    const grab = this.grab;
    if (!grab) return 'none';
    this.letGo();
    if (grab.changes) this.deps.store.getState().updateFogArea(grab.id, grab.changes);
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

  /** The cursor at `world` where a press would be the selected area's own, as it is while that area is held; null elsewhere. */
  cursorAt(world: Point): string | null {
    if (this.grab) return this.grab.what === 'corner' ? 'grabbing' : 'move';
    const area = this.selected();
    return area ? areaCursorAt(areaOutline(area), world, this.zoom()) : null;
  }

  /** Ends a drag under way without a trace: the scene never held anything of it. */
  cancel(): void {
    if (!this.grab) return;
    this.letGo();
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
    if (!this.view.destroyed) destroyTree(this.view);
  }

  private mayEdit(state: ViewAtlasState): boolean {
    return makesFogAreas(state) && !state.isMapLoading && showsGmView(state, this.deps.showsPlayers);
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

  /** Takes the area by a corner or by itself. `added` is set where the press added the corner it holds: a release in place leaves that corner. */
  private hold(area: FogArea, what: FogAreaGrab['what'], index: number, outline: readonly Point[], world: Point, screen: Point, added = false): void {
    this.grab = {
      id: area.id, what, index, before: area, outline, rectangle: area.type === 'rectangle' && !added,
      pressedAt: world, pressedOnScreen: screen, at: world, moved: false,
      changes: added ? { points: outline } : null, shown: added ? outline : null,
    };
    this.deps.canvas().addEventListener('pointercancel', this.onPointerCancel);
    this.draw();
  }

  private letGo(): void {
    this.grab = null;
    this.deps.canvas().removeEventListener('pointercancel', this.onPointerCancel);
    this.deps.snapping.clear();
  }

  /** A press on an edge: a corner is added there, and held. The scene gets it where the pointer is released. */
  private addCorner(area: FogArea, edge: { index: number; point: Point }, world: Point, screen: Point): void {
    const outline = areaOutline(area);
    if (outline.length >= MAX_AREA_CORNERS) {
      showNotice(t('fog.areaCornersFull'));
      return;
    }
    this.hold(area, 'corner', edge.index + 1, withCornerAdded(outline, edge.index, edge.point), world, screen, true);
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

  /**
   * Draws the selected area's handles, on the outline a drag will leave where one is under way,
   * and that outline with them; anew only where the outline, the zoom, the corner lit or the theme changed.
   */
  private draw(): void {
    const area = this.selected();
    const grab = this.grab;
    const shown = area && grab?.id === area.id ? grab.shown : null;
    this.showsPreviewOf(shown && area ? area.id : null);
    const outline = shown ?? (area ? areaOutline(area) : null);
    if (!area || !outline || outline.length < 3) {
      this.view.visible = false;
      return;
    }
    const lit = grab ? (grab.what === 'corner' ? cornerAt(outline, grab.at, Infinity) : null) : this.lit;
    const theme = canvasBadgeTheme();
    const zoom = this.zoom();
    this.view.visible = true;
    const last = this.drawn;
    if (last && last.outline === outline && last.zoom === zoom && last.lit === lit && last.accent === theme.accent && last.background === theme.background) return;
    this.drawn = { outline, zoom, lit, accent: theme.accent, background: theme.background };
    if (shown) drawAreaOutlines(this.preview, [{ outline: shown, dashed: !areaIsHidden(area) }], zoom, theme.accent);
    drawAreaHandles(this.handles, outline, zoom, theme, lit);
  }

  /** The preview shows the outline area `id` will have, or none (null): the one the area has is not drawn beside it. */
  private showsPreviewOf(id: string | null): void {
    if (id === this.previewed) return;
    this.previewed = id;
    if (id === null) this.preview.clear();
    this.deps.held?.(id);
  }
}
