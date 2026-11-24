import type { EventEmitter } from '../../utils/typedEmitter';
import type { Viewport } from 'pixi-viewport';
import { strokePolygons } from '../../lighting/exploredEdits';
import { roomDoor } from '../../lighting/roomDoor';
import { areaOf, type RoomArea } from '../../lighting/rooms';
import { carvedWalls, filledWalls } from '../../lighting/wallCarving';
import { wallSpaces } from '../../lighting/wallSpaces';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import { ShapeStroke } from '../../tools/shapeStroke';
import type { WallToolSubMode } from '../../tools/WallTool';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { wallList } from '../../vision/wallList';
import { showNotice } from '../../ui/notice';
import { t } from '../../i18n';
import { closesDraft } from '../areas/areaGeometry';
import { BucketPouring } from './bucketPouring';
import { DEFAULT_CELL, type BucketMap } from './roomBucket';
import { RoomBrushPointer } from './RoomBrushPointer';
import { RoomOverlay } from './RoomOverlay';
import { roomSizesOf } from '../../stores/roomsSlice';
import { wallEndReach } from './wallEnds';
import { switchApplies } from '../../types/toolSwitches';

export interface RoomEditorDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  bounds: () => MapBounds | null;
  /** The tool entered or left the rooms mode: whoever owns the layer's visibility shows or hides it. */
  onActiveChange: () => void;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, drops a stroke or door that will get no release. */
  canvas: HTMLCanvasElement;
  /** The map shown, whose art a bucket pours over; null while none is. */
  mapImage: () => BucketMap | null;
}

/** What a press needs of the pointer event: Alt does the opposite of carving or filling, Shift snaps corners to the grid and keeps a brush stroke straight (`RoomBrushPointer`). */
export type RoomKeys = { altKey: boolean; shiftKey?: boolean };

/** How far, in screen pixels, a door must be dragged to be one. */
const DOOR_DRAG = 5;

/**
 * The lighting tool's rooms mode: rooms are carved out of the rock with a rectangle, corner by
 * corner, with a lasso or a brush, and filled back in the same ways. A room is its walls and
 * nothing else: carving writes walls like any others (`carvedWalls`), one write and one undo step, which the
 * walls mode then edits, and a shape carved into a room opens into it. A door is dragged across
 * an opening, its ends reaching the walls beside it.
 */
export class RoomEditor {
  private readonly overlay: RoomOverlay;
  private readonly pouring: BucketPouring;
  private readonly stroke = new ShapeStroke();
  private subMode: WallToolSubMode = 'draw';
  /** Corners of a polygon being placed. */
  private draft: Point[] = [];
  private pointer: Point | null = null;
  private readonly brush: RoomBrushPointer;
  /** Where a door being dragged starts, and whether it is a secret door (Alt). */
  private door: { from: Point; secret: boolean } | null = null;
  /** The stroke under way fills rock back in. */
  private filling = false;
  /** Alt held: the bucket pours nothing, its brush alone does the opposite (fills where it would carve). */
  private altHeld = false;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly deps: RoomEditorDeps) {
    const { viewport, store, eventBus } = deps;
    this.overlay = new RoomOverlay(viewport, store, deps.bounds, deps.canvas.ownerDocument.defaultView);
    this.brush = new RoomBrushPointer(viewport);
    this.pouring = new BucketPouring({
      parent: this.overlay.view,
      mapImage: deps.mapImage,
      canvas: deps.canvas,
      shown: () => this.shown,
      carve: (area, filling) => this.apply(area, filling),
      floor: () => wallSpaces(levelObjects(store.getState()).walls),
      nothingFound: () => showNotice(t('rooms.bucketFoundNothing')),
    });
    const onSubMode = (subMode: WallToolSubMode): void => {
      const was = this.active;
      this.subMode = subMode;
      if (was === this.active) return;
      if (!this.active) this.stop();
      deps.onActiveChange();
      this.draw();
    };
    // The camera moved under a pointer at rest: the brush's rings both go back under it (a stroke under way keeps its points).
    const redraw = (): void => {
      const atRest = this.busy ? null : this.brush.atRest();
      if (atRest) this.pointer = atRest;
      this.draw();
    };
    // Alt pressed or let go with the pointer at rest turns the ring at once, not at the next move.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Alt' || !this.shown) return;
      this.takeAlt(event.type === 'keydown');
      this.draw();
    };
    const win = deps.canvas.ownerDocument.defaultView;
    win?.addEventListener('keydown', onKey, true);
    win?.addEventListener('keyup', onKey, true);
    eventBus.on('wall-submode-changed', onSubMode);
    viewport.on('zoomed', redraw);
    viewport.on('moved', redraw);
    this.cleanups.push(
      () => win?.removeEventListener('keydown', onKey, true),
      () => win?.removeEventListener('keyup', onKey, true),
      () => eventBus.off('wall-submode-changed', onSubMode),
      () => viewport.off('zoomed', redraw),
      () => viewport.off('moved', redraw),
      store.subscribe((state, previous) => {
        // A wall's end dragged in this mode changes the walls at every step: the rock follows once they rest.
        if (levelObjects(state).walls !== levelObjects(previous).walls) this.overlay.shadeSoon();
        if (state.roomTool === previous.roomTool && state.roomSizes === previous.roomSizes) return;
        this.stop();
        this.draw();
      }),
    );
  }

  /** The darkened rock and the shape under way (`GmOverlays`). */
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
    this.altHeld = keys.altKey;
    if (roomTool.shape === 'polygon') {
      if (closesDraft(this.draft, point, this.zoom())) this.closeDraft();
      else this.draft.push(at);
    } else {
      // A bucket is dragged like a brush: it pours from every point of the path on release, and carves the brush's trail too.
      this.stroke.mode = roomTool.shape === 'bucket' ? 'brush' : roomTool.shape;
      this.stroke.brushRadius = roomSizesOf(this.deps.store.getState()).brushSize;
      this.stroke.begin(at);
      this.brush.begin(at);
      if (this.stroke.mode === 'brush') this.pointer = at;
      this.watchPointer(true);
    }
    this.draw();
    return true;
  }

  pointerMove(point: Point, keys: RoomKeys): void {
    if (!this.shown) return;
    this.brush.seen(point);
    // A brush or bucket stroke trails on Stabilization's rope, twice the brush's size, and keeps to a level or upright line while Shift is held.
    const brushing = this.stroke.mode === 'brush' && this.stroke.active;
    const state = this.deps.store.getState();
    const rope = state.roomTool.stabilize ? 2 * roomSizesOf(state).brushSize : 0;
    this.pointer = brushing ? this.brush.follow(point, keys.shiftKey === true, rope) : this.snapped(point, keys);
    this.takeAlt(keys.altKey);
    if (this.stroke.active) this.stroke.extend(this.stroke.mode === 'rectangle' || brushing ? this.pointer : point);
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
    // The stroke ended where the brush trailed to; the rings go back under the pointer.
    this.brush.end();
    this.pointer = this.brush.atRest() ?? this.pointer;
    const { roomTool } = this.deps.store.getState();
    if (this.pours() && shape?.type === 'brush') {
      const options = { radius: roomSizesOf(this.deps.store.getState()).bucketRadius, cell: this.cell(), sensitivity: roomTool.bucketSensitivity };
      void this.pouring.pour(shape, this.filling, options);
    } else if (shape) this.apply(areaOf(strokePolygons(shape)));
    this.draw();
  }

  pointerLeft(): void {
    this.pointer = null;
    this.brush.left();
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
    this.pouring.settle();
    this.watchPointer(false);
    this.door = null;
    this.stroke.cancel();
    this.brush.end();
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
   * A closed door from `a` to `b`, in one write and one undo step (`roomDoor`): its ends reach a wall
   * as close as a wall end snaps, and never a quarter cell away, so an end on a grid crossing a cell
   * from a corner stays where it was drawn.
   */
  private placeDoor(a: Point, b: Point, secret: boolean): void {
    const state = this.deps.store.getState();
    const reach = Math.min(wallEndReach(this.zoom()), (state.grid?.size ?? 70) / 4);
    const { remove, add } = roomDoor(a, b, wallList(levelObjects(state).walls), reach, secret ? 'secret-door' : 'door');
    state.editWalls(remove, add);
  }

  /** Carves `area` or fills it in, as one edit of the level's walls and one undo step. */
  private apply(area: RoomArea, filling = this.filling): void {
    if (area.length === 0) return;
    const state = this.deps.store.getState();
    const walls = levelObjects(state).walls;
    const chain = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { remove, add } = (filling ? filledWalls : carvedWalls)(area, wallList(walls), wallSpaces(walls), chain);
    if (remove.length === 0 && add.length === 0) return;
    state.editWalls(remove, add);
    // What was just carved shows at once.
    this.overlay.drawShade();
  }

  /** With Shift, a corner or a door's end lands on the nearest crossing of a square grid. */
  private snapped(point: Point, { shiftKey }: RoomKeys): Point {
    const state = this.deps.store.getState();
    const { grid, roomTool } = state;
    // The brush and the bucket take Shift for a straight stroke (`AxisLock`), never the grid.
    const freehand = roomTool.action !== 'door' && (roomTool.shape === 'brush' || roomTool.shape === 'bucket');
    if (!switchApplies(state, 'roomSnap', shiftKey) || freehand || !grid || grid.type !== 'square' || !(grid.size > 0)) return point;
    const snap = (v: number, offset: number): number => Math.round((v - offset) / grid.size) * grid.size + offset;
    return { x: snap(point.x, grid.offsetX), y: snap(point.y, grid.offsetY) };
  }

  private cell(): number {
    return this.deps.store.getState().grid?.size ?? DEFAULT_CELL;
  }

  private zoom(): number {
    return this.deps.viewport.scale.x;
  }

  /** Alt held or not while nothing is under way: what the next stroke does. A stroke keeps what its press chose. */
  private takeAlt(altKey: boolean): void {
    if (this.stroke.active || this.draft.length > 0) return;
    this.filling = (this.deps.store.getState().roomTool.action === 'fill') !== altKey;
    this.altHeld = altKey;
  }

  /** The bucket pours unless Alt turned it into its brush alone. */
  private pours(): boolean {
    return this.deps.store.getState().roomTool.shape === 'bucket' && !this.altHeld;
  }

  private draw(): void {
    // The rock is darkened for the walls as they are; nothing is drawn anew where they did not change.
    this.overlay.drawShade();
    const preview = this.shown ? { stroke: this.stroke, draft: this.draft, pointer: this.pointer, door: this.door?.from ?? null, filling: this.filling, pours: this.pours(), lead: this.brush.lead } : null;
    this.overlay.draw(preview);
  }

  destroy(): void {
    this.watchPointer(false);
    for (const cleanup of this.cleanups) cleanup();
    this.pouring.destroy();
    this.overlay.destroy();
  }
}
