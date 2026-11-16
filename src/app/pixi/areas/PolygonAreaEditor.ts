import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { Point } from '../../types/visionTypes';
import { hasArea } from '../../vision/polygonArea';
import { areaCornerAt, areaHandleAt, closesDraft, type AreaCorner, type PolygonArea } from './areaGeometry';
import type { PolygonAreaOverlay } from './PolygonAreaOverlay';

/** What a press needs of the pointer event: Alt places a corner freely, without snapping. */
export type AreaKeys = { altKey: boolean };

/** What a tool that draws areas takes of the pointer, from the token renderer's viewport dispatch. */
export interface AreaToolPointer {
  /** A left press at a world point; true when the tool took it. */
  pointerDown(point: Point, keys: AreaKeys): boolean;
  pointerMove(point: Point, keys: AreaKeys): void;
  pointerUp(): void;
  doubleClick(): void;
  cursorAt(point: Point): string;
}

/** How the editor reads and writes one kind of area in the view's store. */
export interface AreaStore<Area extends PolygonArea> {
  /** The areas the view shows, in the order they were drawn. */
  list: (state: ViewAtlasState) => readonly Area[];
  /** The area whose popover is open. */
  selected: (state: ViewAtlasState) => string | null;
  /** Whether a write changed what the overlay draws. */
  changed: (state: ViewAtlasState, previous: ViewAtlasState) => boolean;
  /** Opens the popover of an area, or closes it (null). */
  select: (id: string | null) => void;
  /** Makes the corners placed a new area (one undo step) and opens its popover. */
  create: (polygon: Point[]) => void;
  reshape: (id: string, polygon: Point[]) => void;
  remove: (id: string) => void;
  /** Whether another area may be begun; false where the map holds as many as it may (the GM is told). */
  mayBegin: () => boolean;
  /** The last corner an area may have closes it. */
  maxCorners: number;
  /** Where a corner placed at `point` lands. */
  snap: (point: Point, keys: AreaKeys) => Point;
}

export interface PolygonAreaEditorDeps<Area extends PolygonArea> {
  viewport: Viewport;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, ends a drag that will get no release. */
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  overlay: PolygonAreaOverlay<Area>;
  areas: AreaStore<Area>;
  /** Where an area's handle sits, which a click opens the popover on. */
  handleOf: (area: Area) => Point;
}

/**
 * Draws and reshapes areas the GM puts on the map corner by corner (light zones, stairs). While
 * active, a click places a corner of a new area, and Enter, a click on the first corner or a double
 * click closes it (one undo step); Escape drops it. A corner of an area is dragged to move it (one
 * undo step; Escape, a cancelled pointer, the window losing focus and the next press put it back
 * and leave no step), a click on an area's handle opens its popover, and Delete deletes the area
 * whose popover is open. It takes input only while active and while its layer shows.
 */
export class PolygonAreaEditor<Area extends PolygonArea> implements AreaToolPointer {
  private isActive = false;
  private draft: Point[] = [];
  private cursor: Point | null = null;
  private hovered: AreaCorner | null = null;
  /** The corner being dragged, and the polygon as it was. */
  private drag: { corner: AreaCorner; before: Point[] } | null = null;
  private readonly unsubscribe: () => void;
  private readonly redraw = (): void => this.draw();
  private readonly abort = (): void => {
    if (!this.drag) return;
    this.cancelDrag();
    this.draw();
  };

  constructor(protected readonly deps: PolygonAreaEditorDeps<Area>) {
    const { viewport, store, areas } = deps;
    viewport.on('zoomed', this.redraw);
    viewport.on('zoomed-end', this.redraw);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (areas.changed(state, previous) || areas.selected(state) !== areas.selected(previous)) this.draw();
    });
  }

  /** The layer with the areas' outlines and handles. */
  get view(): Container {
    return this.deps.overlay.view;
  }

  /** The tool is in the mode that edits these areas. */
  get active(): boolean {
    return this.isActive;
  }

  /** An area is being drawn. */
  get drawing(): boolean {
    return this.draft.length > 0;
  }

  protected get shown(): boolean {
    return this.isActive && this.view.visible;
  }

  /** The tool entered or left the mode that edits these areas; leaving it ends what is under way. Returns whether that changed. */
  protected setActive(active: boolean): boolean {
    if (active === this.isActive) return false;
    this.isActive = active;
    if (active) this.draw();
    else this.stop();
    return true;
  }

  /** The layer was shown or hidden: it draws only while shown, and nothing is drawn or dragged where no one sees it. */
  afterVisibilityChange(): void {
    if (this.view.visible) this.draw();
    else this.stop();
  }

  pointerDown(point: Point, keys: AreaKeys): boolean {
    if (!this.shown) return false;
    // A drag whose release never came (a button released outside the window) ends here.
    if (this.drag) this.cancelDrag();
    const zoom = this.zoom();
    if (this.drawing) {
      if (closesDraft(this.draft, point, zoom)) this.close();
      else this.place(point, keys);
      return true;
    }
    const list = this.list();
    const corner = areaCornerAt(list, point, zoom);
    const area = corner && list.find((candidate) => candidate.id === corner.areaId);
    if (corner && area) {
      this.drag = { corner, before: [...area.polygon] };
      beginHistoryTransaction(this.deps.store);
      this.watchPointer(true);
    } else {
      const handle = areaHandleAt(list, point, zoom, this.deps.handleOf);
      if (handle) this.deps.areas.select(handle);
      else this.place(point, keys);
    }
    this.draw();
    return true;
  }

  pointerMove(point: Point, keys: AreaKeys): void {
    if (!this.shown) return;
    if (this.drag) {
      const { areaId, index } = this.drag.corner;
      const area = this.list().find((candidate) => candidate.id === areaId);
      if (area) this.deps.areas.reshape(areaId, area.polygon.map((corner, i) => (i === index ? this.deps.areas.snap(point, keys) : corner)));
      return;
    }
    // The overlay follows the pointer only where it shows it: the line to the next corner, or the corner under it.
    const hovered = this.drawing ? null : areaCornerAt(this.list(), point, this.zoom());
    const same = !this.drawing && this.cursor === null && hovered?.areaId === this.hovered?.areaId && hovered?.index === this.hovered?.index;
    this.cursor = this.drawing ? point : null;
    this.hovered = hovered;
    if (!same) this.draw(false);
  }

  pointerUp(): void {
    if (!this.drag) return;
    this.drag = null;
    this.watchPointer(false);
    endHistoryTransaction(this.deps.store);
    this.draw();
  }

  /** A double click closes the area being drawn. */
  doubleClick(): void {
    if (this.shown && this.drawing) this.close();
  }

  cursorAt(point: Point): string {
    if (this.drawing) return 'crosshair';
    const list = this.list();
    if (areaCornerAt(list, point, this.zoom())) return 'grab';
    return areaHandleAt(list, point, this.zoom(), this.deps.handleOf) ? 'pointer' : 'crosshair';
  }

  /** Enter closes the area being drawn; with fewer than three corners it goes on. */
  handleEnter(): boolean {
    if (!this.shown || !this.drawing) return false;
    this.close();
    return true;
  }

  /** Escape puts a dragged corner back, drops the area being drawn or closes the popover. */
  handleEscape(): boolean {
    if (!this.shown) return false;
    const { areas, store } = this.deps;
    if (this.drag) this.cancelDrag();
    else if (this.drawing) this.draft = [];
    else if (areas.selected(store.getState())) areas.select(null);
    else return false;
    this.cursor = null;
    this.draw();
    return true;
  }

  /** Delete deletes the area whose popover is open. */
  handleDelete(): boolean {
    const selected = this.deps.areas.selected(this.deps.store.getState());
    if (!this.shown || !selected) return false;
    this.deps.areas.remove(selected);
    return true;
  }

  /** Ends whatever is under way: a dragged corner goes back, an area half drawn is dropped, the popover closes. */
  stop(): void {
    if (this.drag) this.cancelDrag();
    this.deps.areas.select(null);
    this.draft = [];
    this.cursor = null;
    this.hovered = null;
    this.draw();
  }

  private list(): readonly Area[] {
    return this.deps.areas.list(this.deps.store.getState());
  }

  private zoom(): number {
    return this.deps.viewport.scale.x;
  }

  private place(point: Point, keys: AreaKeys): void {
    const { areas } = this.deps;
    areas.select(null);
    if (!this.drawing && !areas.mayBegin()) return;
    this.draft = [...this.draft, areas.snap(point, keys)];
    this.cursor = point;
    if (this.draft.length >= areas.maxCorners) this.close();
    this.draw();
  }

  /**
   * Makes the corners placed an area, when they are one. Corners on one line are none yet (such an
   * area could not be opened or deleted: it shows nowhere), so drawing goes on.
   */
  private close(): void {
    // The second click of a double click lands on the corner the first one placed.
    const polygon = this.draft.filter((point, i) => i === 0 || point.x !== this.draft[i - 1]!.x || point.y !== this.draft[i - 1]!.y);
    if (polygon.length < 3 || !hasArea(polygon)) return;
    this.draft = [];
    this.cursor = null;
    this.deps.areas.create(polygon);
    this.draw();
  }

  private cancelDrag(): void {
    const { store, areas } = this.deps;
    const { corner, before } = this.drag!;
    this.drag = null;
    this.watchPointer(false);
    if (this.list().some((area) => area.id === corner.areaId)) areas.reshape(corner.areaId, before);
    abandonHistoryTransaction(store);
  }

  /** While a corner is held, a pointer that is lost cancels the drag: no release would end it. */
  private watchPointer(on: boolean): void {
    const { canvas } = this.deps;
    const win = canvas.ownerDocument.defaultView;
    if (on) {
      canvas.addEventListener('pointercancel', this.abort);
      win?.addEventListener('blur', this.abort);
    } else {
      canvas.removeEventListener('pointercancel', this.abort);
      win?.removeEventListener('blur', this.abort);
    }
  }

  /** Draws the overlay; `retheme` false while it only follows the pointer, which never changes the theme. */
  protected draw(retheme = true): void {
    const { overlay, areas, store } = this.deps;
    if (retheme) overlay.retheme();
    overlay.draw(this.overlayAreas(), {
      editing: this.shown,
      selected: areas.selected(store.getState()),
      draft: this.draft,
      cursor: this.cursor,
      corner: this.drag?.corner ?? this.hovered,
    });
  }

  /** The areas the overlay draws: those the view shows while they are edited, none otherwise. */
  protected overlayAreas(): readonly Area[] {
    return this.shown ? this.list() : [];
  }

  destroy(): void {
    if (this.drag) this.cancelDrag();
    this.unsubscribe();
    this.deps.viewport.off('zoomed', this.redraw);
    this.deps.viewport.off('zoomed-end', this.redraw);
    this.deps.overlay.destroy();
  }
}
