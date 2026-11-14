import type { Container, EventSystem } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { DrawMode } from '../../annotations/annotationTypes';
import { cellGrid, type CellGrid } from '../../annotations/cellGrid';
import { drawCell } from '../../annotations/drawSizes';
import { liveDrawing } from '../../annotations/madeDrawing';
import { placingMark, type PlacingMark } from '../../annotations/placingPreview';
import type { MapRect } from '../../grid/cellNumbering';
import type { GridGeometry } from '../../grid/gridDistance';
import type { ViewAtlasState } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import type { StampTextures } from '../drawingLayer';
import type { AnnotationPointerHandlers } from './annotationPointer';
import type { DrawInputHost } from './DrawInput';
import { sweeps, type GestureMode } from './drawGesture';
import { activeDrawMode } from './drawToolState';
import { PlacingPreview } from './PlacingPreview';

export interface DrawPlacingDeps {
  readonly viewport: Viewport;
  readonly store: StoreApi<ViewAtlasState>;
  /** Where the preview goes: the tool's own marks, which only the GM's view of the canvas shows. */
  readonly chrome: Container;
  readonly stamps: StampTextures;
  /** What takes the pointer before the tool places anything: the handles of the selection, and what a press would select. */
  readonly taken: AnnotationPointerHandlers;
  /** The grid points snap to; null without a grid or while its Snap is off. */
  snapGrid(): GridGeometry | null;
  /** The grid whose cells the Cells mode fills; null where the map has none, or it is switched off. */
  cellGrid(): GridGeometry | null;
  /** The map, at whose edge a filled cell ends; null without one. */
  mapRect(): MapRect | null;
  /** Whether the canvas shows the GM's view: the tool works there alone. */
  gmView(): boolean;
  /** Whether a text is being typed: its field has the pointer's attention. */
  typing(): boolean;
  requestRender(): void;
}

const NOT_COVERED = (): boolean => false;

/**
 * What the pointer shows over the map while the Draw tool is in hand: the thing a press will place
 * (`PlacingPreview`, drawn as `placingMark` says) in the place of the system cursor, which is
 * hidden while a mark shows. Nothing is shown, and the cursor is the system's again, where the
 * press would do something else: on a handle or on what a press selects (`taken`, asked first),
 * while a right-drag pans, while a text is typed, once the pointer left the canvas, and while a
 * shape under way is its own picture (the cursor stays hidden until it is done).
 *
 * The pointer's place is told by the viewport's dispatch through `pointer`; what changes with the
 * pointer at rest (the tool's choices, what lies on the map, the camera, Alt, a gesture ending) is
 * shown at once at the place it was told last.
 */
export class DrawPlacing {
  /** What the viewport's dispatch asks about drawings and texts, with the preview and its cursor. */
  readonly pointer: AnnotationPointerHandlers;

  private readonly preview: PlacingPreview;
  /** Where the pointer was last told to be over the map, on screen, and whether Alt was held; null once it left. */
  private last: { screen: Point; free: boolean } | null = null;
  /** The cursor last told for the pointer; null for the system's own. */
  private cursor: string | null = null;
  /** The mode of the Draw tool's gesture under way, and whether its shape shows by now. */
  private gesture: GestureMode | null = null;
  private pictured = false;
  private panning = false;
  private listening = false;
  /** The cells of the grid last asked for. */
  private cells: { of: string; grid: CellGrid | null } | null = null;

  constructor(private readonly deps: DrawPlacingDeps) {
    this.preview = new PlacingPreview({ stamps: deps.stamps, zoom: () => this.zoom, changed: () => deps.requestRender() });
    deps.chrome.addChild(this.preview.view);
    this.pointer = {
      ...deps.taken,
      cursorAt: (x, y, covered, free) => {
        const cursor = this.at({ x, y }, covered, free === true);
        // With another tool in hand the cursor is that tool's: nothing of it is kept, or put back, here.
        const working = this.mode() !== null;
        const screen = working ? deps.viewport.toScreen(x, y) : null;
        this.last = screen && { screen: { x: screen.x, y: screen.y }, free: free === true };
        this.cursor = working ? cursor : null;
        return cursor;
      },
      leave: () => {
        deps.taken.leave();
        this.last = null;
        this.cursor = null;
        this.show(null);
      },
    };
  }

  /** `host` as the Draw tool's input is to be told of it: the preview makes way for a gesture's own picture, and comes back when it ends. */
  around(host: DrawInputHost): DrawInputHost {
    return {
      ...host,
      started: (mode) => {
        host.started(mode);
        this.gesture = mode;
        this.pictured = false;
        this.refresh();
      },
      changed: (shape) => {
        host.changed(shape);
        const { drawTool, grid } = this.deps.store.getState();
        const pictured = liveDrawing(shape, drawTool, drawCell(grid)) !== null;
        if (pictured === this.pictured) return;
        this.pictured = pictured;
        this.refresh();
      },
      finished: (made) => {
        this.gesture = null;
        host.finished(made);
        this.refresh();
      },
      cancelled: () => {
        this.gesture = null;
        host.cancelled();
        this.refresh();
      },
    };
  }

  /** The view's state changed: with the tool in hand, or just out of it, the pointer may show something else. */
  follow(): void {
    if (this.listening || this.mode() !== null) this.refresh();
  }

  /**
   * Shows what the pointer shows now, at the place it was last told to be: the tool, its choices,
   * the map or the view may be another. With the tool out of hand nothing shows, and a cursor this
   * left behind is the system's again.
   */
  refresh(): void {
    const working = this.mode() !== null;
    // Out of hand, the tool leaves the cursor as the system's: the next tool sets its own with the next move.
    const left = this.listening && !working;
    this.listen(working);
    const last = this.last;
    if (!working || !last) {
      this.show(null);
      if (left) this.apply(null);
      return;
    }
    const { x, y } = this.deps.viewport.toWorld(last.screen);
    this.apply(this.at({ x, y }, NOT_COVERED, last.free));
  }

  destroy(): void {
    this.listen(false);
    this.preview.destroy();
  }

  /** The mode the tool works in now; null while another tool is in hand, the canvas shows the players' picture, or a text is typed. */
  private mode(): DrawMode | null {
    return this.deps.gmView() && !this.deps.typing() ? activeDrawMode(this.deps.store.getState()) : null;
  }

  private get zoom(): number {
    return Math.abs(this.deps.viewport.scale.x) || 1;
  }

  /** The cursor for the pointer at `world`, after showing what a press there will place. */
  private at(world: Point, covered: () => boolean, free: boolean): string | null {
    const taken = this.deps.taken.cursorAt(world.x, world.y, covered, free);
    const mode = this.mode();
    const placing = taken === null && mode !== null && !this.panning;
    const mark = placing ? this.mark(mode, world, free) : null;
    this.show(mark);
    if (taken !== null) return taken;
    // A shape under way is the picture: no arrow lies over it. The eraser keeps the arrow beside its ring.
    if (mark !== null || (placing && this.gesture !== null && this.gesture !== 'eraser')) return 'none';
    return mode === 'text' ? 'text' : null;
  }

  private mark(mode: DrawMode, pointer: Point, free: boolean): PlacingMark | null {
    if (this.gesture !== null && (this.pictured || sweeps(this.gesture))) return null;
    const { drawTool, grid } = this.deps.store.getState();
    const map = mode === 'cells' ? this.deps.mapRect() : null;
    return placingMark({
      mode,
      tool: drawTool,
      cell: drawCell(grid),
      snapGrid: this.deps.snapGrid(),
      cells: mode === 'cells' ? this.cellsOf(this.deps.cellGrid()) : null,
      bounds: map && { minX: map.x, minY: map.y, maxX: map.x + map.width, maxY: map.y + map.height },
      zoom: this.zoom,
      pointer,
      free,
    });
  }

  /** The cells of `geometry`, kept while the grid is the same: a cell is worked out once. */
  private cellsOf(geometry: GridGeometry | null): CellGrid | null {
    if (!geometry) return null;
    const of = `${geometry.type}|${geometry.size}|${geometry.offsetX ?? 0}|${geometry.offsetY ?? 0}`;
    if (this.cells?.of !== of) this.cells = { of, grid: cellGrid(geometry) };
    return this.cells.grid;
  }

  private show(mark: PlacingMark | null): void {
    if (this.preview.show(mark)) this.deps.requestRender();
  }

  /**
   * Sets the cursor where no pointer event does. PIXI sets the canvas's cursor again after every
   * press and release, to what its last pointer move left, so that is told too.
   */
  private apply(cursor: string | null): void {
    this.cursor = cursor;
    const { viewport } = this.deps;
    const shown = cursor ?? 'default';
    viewport.cursor = shown;
    // A view without PIXI's own events (a test) has no canvas whose cursor could be set.
    const events: Partial<EventSystem> | undefined = viewport.options.events;
    if (!events?.rootBoundary || typeof events.setCursor !== 'function') return;
    events.rootBoundary.cursor = shown;
    events.setCursor(shown);
  }

  /** Follows, while the tool works, what moves the mark with the pointer at rest: the camera, a pan, Alt. */
  private listen(on: boolean): void {
    if (on === this.listening) return;
    this.listening = on;
    const { viewport } = this.deps;
    const change = on ? 'on' : 'off';
    viewport[change]('moved', this.onCamera);
    viewport[change]('zoomed', this.onCamera);
    viewport[change]('drag-start', this.onPanStart);
    viewport[change]('drag-end', this.onPanEnd);
    // A pan that something paused ends without a word: the release ends it here.
    viewport[change]('pointerup', this.onPanEnd);
    viewport[change]('pointerupoutside', this.onPanEnd);
    const win = viewport.options.events?.domElement?.ownerDocument?.defaultView;
    for (const type of ['keydown', 'keyup'] as const) {
      if (on) win?.addEventListener(type, this.onAlt);
      else win?.removeEventListener(type, this.onAlt);
    }
    if (!on) this.panning = false;
  }

  /** A scroll pan, a pinch or a zoom moves the map under a pointer that stands still. */
  private readonly onCamera = (): void => this.refresh();

  private readonly onPanStart = (): void => {
    this.panning = true;
    this.refresh();
  };

  private readonly onPanEnd = (): void => {
    if (!this.panning) return;
    this.panning = false;
    this.refresh();
  };

  /** Alt went down or up with the pointer at rest: the mark snaps, or no longer. */
  private readonly onAlt = (event: KeyboardEvent): void => {
    const last = this.last;
    const free = event.type === 'keydown';
    if (event.key !== 'Alt' || !last || last.free === free) return;
    last.free = free;
    this.refresh();
  };
}
