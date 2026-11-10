import type { EventEmitter } from 'events';
import type { Viewport } from 'pixi-viewport';
import { strokePolygons } from '../../lighting/exploredEdits';
import { areaOf, extended, type RoomArea } from '../../lighting/rooms';
import { carvedWalls, filledWalls } from '../../lighting/wallCarving';
import { wallSpaces } from '../../lighting/wallSpaces';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import { ShapeStroke } from '../../tools/shapeStroke';
import type { WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { wallList } from '../../vision/wallList';
import { closesDraft } from '../areas/areaGeometry';
import { RoomOverlay } from './RoomOverlay';

export interface RoomEditorDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  bounds: () => MapBounds | null;
  /** The tool entered or left the rooms mode: whoever owns the layer's visibility shows or hides it. */
  onActiveChange: () => void;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, drops a stroke or door that will get no release. */
  canvas: HTMLCanvasElement;
}

/** What a press needs of the pointer event: Alt does the opposite of carving or filling, Shift snaps to the grid. */
export type RoomKeys = { altKey: boolean; shiftKey?: boolean };

/** How far, in screen pixels, a door must be dragged to be one. */
const DOOR_DRAG = 5;

/**
 * The lighting tool's rooms mode: rooms are carved out of the rock with a rectangle, corner by
 * corner, with a lasso or a brush, and filled back in the same ways. A room is its walls and
 * nothing else: carving writes walls like any others (`carvedWalls`), one undo step, which the
 * walls mode then edits, and a shape carved into a room opens into it. A door is dragged across
 * an opening, its ends reaching the walls beside it.
 */
export class RoomEditor {
  private readonly overlay: RoomOverlay;
  private readonly stroke = new ShapeStroke();
  private subMode: WallToolSubMode = 'draw';
  /** Corners of a polygon being placed. */
  private draft: Point[] = [];
  private pointer: Point | null = null;
  /** Where a door being dragged starts, and whether it is a secret door (Alt). */
  private door: { from: Point; secret: boolean } | null = null;
  /** The stroke under way fills rock back in. */
  private filling = false;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly deps: RoomEditorDeps) {
    const { viewport, store, eventBus } = deps;
    this.overlay = new RoomOverlay(viewport, store);
    const onSubMode = (subMode: WallToolSubMode): void => {
      const was = this.active;
      this.subMode = subMode;
      if (was === this.active) return;
      if (!this.active) this.stop();
      deps.onActiveChange();
      this.draw();
    };
    const redraw = (): void => this.draw();
    eventBus.on('wall-submode-changed', onSubMode);
    viewport.on('zoomed', redraw);
    this.cleanups.push(
      () => eventBus.off('wall-submode-changed', onSubMode),
      () => viewport.off('zoomed', redraw),
      store.subscribe((state, previous) => {
        if (state.roomTool === previous.roomTool) return;
        this.stop();
        this.draw();
      }),
    );
  }

  /** The rock and the rooms' outlines (`GmOverlays`). */
  get view(): RoomOverlay['view'] {
    return this.overlay.view;
  }

  /** The lighting tool is in its rooms mode: its presses are no one else's. */
  get active(): boolean {
    return this.subMode === 'rooms';
  }

  /** A shape, a polygon's corners or a door is under way: the presses until it ends are the mode's own. */
  get busy(): boolean {
    return this.stroke.active || this.draft.length > 0 || this.door !== null;
  }

  private get shown(): boolean {
    return this.active && this.view.visible;
  }

  afterVisibilityChange(): void {
    if (this.view.visible) this.draw();
    else this.stop();
  }

  pointerDown(point: Point, keys: RoomKeys): boolean {
    if (!this.shown) return false;
    const { roomTool } = this.deps.store.getState();
    const at = this.snapped(point, keys);
    if (roomTool.action === 'door') {
      this.door = { from: at, secret: keys.altKey };
      this.pointer = at;
      this.watchPointer(true);
      this.draw();
      return true;
    }
    this.filling = (roomTool.action === 'fill') !== keys.altKey;
    if (roomTool.shape === 'polygon') {
      if (closesDraft(this.draft, point, this.zoom())) this.closeDraft();
      else this.draft.push(at);
    } else {
      this.stroke.mode = roomTool.shape;
      this.stroke.brushRadius = roomTool.brushSize;
      this.stroke.begin(at);
      this.watchPointer(true);
    }
    this.draw();
    return true;
  }

  pointerMove(point: Point, keys: RoomKeys): void {
    if (!this.shown) return;
    this.pointer = this.stroke.mode === 'brush' && this.stroke.active ? point : this.snapped(point, keys);
    if (!this.stroke.active && this.draft.length === 0) this.filling = (this.deps.store.getState().roomTool.action === 'fill') !== keys.altKey;
    if (this.stroke.active) this.stroke.extend(this.stroke.mode === 'rectangle' ? this.pointer : point);
    this.draw();
  }

  pointerUp(): void {
    this.watchPointer(false);
    if (this.door) {
      const { from, secret } = this.door;
      this.door = null;
      if (this.pointer && Math.hypot(this.pointer.x - from.x, this.pointer.y - from.y) * this.zoom() > DOOR_DRAG) this.placeDoor(from, this.pointer, secret);
      this.draw();
      return;
    }
    if (!this.stroke.active) return;
    const shape = this.stroke.finish();
    if (shape) this.apply(areaOf(strokePolygons(shape)));
    this.draw();
  }

  pointerLeft(): void {
    this.pointer = null;
    this.draw();
  }

  doubleClick(): void {
    if (this.shown) this.closeDraft();
  }

  handleEnter(): boolean {
    if (!this.shown || this.draft.length === 0) return false;
    this.closeDraft();
    return true;
  }

  /** Escape drops the shape under way. */
  handleEscape(): boolean {
    if (!this.shown || !this.busy) return false;
    this.stop();
    return true;
  }

  stop(): void {
    this.watchPointer(false);
    this.door = null;
    this.stroke.cancel();
    this.draft = [];
    this.draw();
  }

  /** A pointer that is lost drops the stroke or door under way, whose release will never come; corners placed stay. */
  private readonly abort = (): void => {
    this.watchPointer(false);
    this.door = null;
    this.stroke.cancel();
    this.draw();
  };

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

  private closeDraft(): void {
    // The second click of a double click lands on the corner the first one placed.
    const corners = this.draft.filter((p, i) => i === 0 || p.x !== this.draft[i - 1]!.x || p.y !== this.draft[i - 1]!.y);
    this.draft = [];
    if (corners.length >= 3) this.apply(areaOf([corners]));
    this.draw();
  }

  /**
   * A closed door from `a` to `b`, its ends pushed out to the walls beside it when they are within
   * a grid cell, so no light slips past a door drawn a little short.
   */
  private placeDoor(a: Point, b: Point, secret: boolean): void {
    const state = this.deps.store.getState();
    const reach = state.grid?.size ?? 70;
    const walls = wallList(levelObjects(state).walls);
    state.addWall({ type: secret ? 'secret-door' : 'door', p1: extended(a, b, walls, reach), p2: extended(b, a, walls, reach), closed: true });
  }

  /** Carves `area` or fills it in, as one edit of the level's walls and one undo step. */
  private apply(area: RoomArea): void {
    if (area.length === 0) return;
    const { store } = this.deps;
    const state = store.getState();
    const walls = levelObjects(state).walls;
    const chain = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { remove, add } = (this.filling ? filledWalls : carvedWalls)(area, wallList(walls), wallSpaces(walls), chain);
    if (remove.length === 0 && add.length === 0) return;
    runHistoryTransaction(store, () => {
      if (remove.length > 0) state.deleteWalls(remove);
      for (const wall of add) state.addWall(wall);
    });
  }

  /** With Shift, a corner lands on the nearest crossing of a square grid. */
  private snapped(point: Point, { shiftKey }: RoomKeys): Point {
    const grid = this.deps.store.getState().grid;
    if (!shiftKey || !grid || grid.type !== 'square' || !(grid.size > 0)) return point;
    const snap = (v: number, offset: number): number => Math.round((v - offset) / grid.size) * grid.size + offset;
    return { x: snap(point.x, grid.offsetX), y: snap(point.y, grid.offsetY) };
  }

  private zoom(): number {
    return this.deps.viewport.scale.x;
  }

  private draw(): void {
    const preview = this.shown ? { stroke: this.stroke, draft: this.draft, pointer: this.pointer, door: this.door?.from ?? null, filling: this.filling } : null;
    this.overlay.draw(preview);
  }

  destroy(): void {
    this.watchPointer(false);
    for (const cleanup of this.cleanups) cleanup();
    this.overlay.destroy();
  }
}
