import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand/vanilla';
import type { GridGeometry } from '../../grid/gridDistance';
import type { KeptMeasure, MeasureChanges } from '../../measure/measureTypes';
import { beginHistoryTransaction } from '../../stores/history';
import type { MeasuresSlice } from '../../stores/measuresSlice';
import type { UISlice } from '../../stores/uiSlice';
import type { Point } from '../../types/visionTypes';
import { elementOf, LIGHT_DRAG_THRESHOLD } from '../lighting/LightInteraction';
import { settleDragStep } from './dragStep';
import type { MeasureHandlePlacer, MeasureHandleRef, MeasurePointerHandlers } from './measureHandle';
import { handleDrag, sameDragChanges, type AuraDragSetting } from './measureHandleDrag';
import { MeasureHandles } from './MeasureHandles';
import { closeStaleMeasurePopover, keptMeasure, mayEditMeasure, type MeasureEditState } from './measurePopoverGuard';
import { trackPointer } from './pointerTrack';
import { PopoverPressWatch } from './PopoverPressWatch';

/** The popover of a kept measurement, which a press may land in. */
const POPOVER = '.atlas-measure-popover';

type HandleState = MeasureEditState
  & Pick<UISlice, 'measurePopover' | 'openMeasurePopover' | 'closeMeasurePopover'>
  & Pick<MeasuresSlice, 'updateMeasure' | 'deleteMeasure'>;

/** What the handles read of their view's state, and what they write: a measurement moved or deleted, and whose popover is open. */
export type MeasureHandleStore = Pick<StoreApi<HandleState>, 'getState'>;

/** What a press needs of the pointer event; PIXI reuses its event objects, so it is read at once. */
type Press = Pick<FederatedPointerEvent, 'global'>;

export interface MeasureHandleDeps {
  viewport: Viewport;
  store: MeasureHandleStore;
  /** The grid a moved measurement snaps to; null while the grid's Snap is off. */
  snapGrid: () => GridGeometry | null;
  /**
   * Something else has the pointer on the map's points: a measurement being made, which may end
   * where another began, or the lighting tool, whose wall ends and corners lie where handles do.
   */
  yields: () => boolean;
  /** The measurement whose handle the pointer is over is another, or none (null). */
  pointedAt?: (id: string | null) => void;
  /** Where each measurement's handles stand (its badge on the rim of the token it lies on); unset, where its points say. */
  place?: MeasureHandlePlacer;
  /** What the far handle of the aura `measure` is dragged by; null while its token is not on the map shown. */
  aura?: (measure: KeptMeasure) => AuraDragSetting | null;
}

/** A press or drag under way. */
interface Gesture {
  readonly id: string;
  /** The measurement is being moved. */
  dragging: () => boolean;
  /** Ends it: a release commits what it changed as one undo step, a cancel puts it back and leaves none. */
  end: (commit: boolean, later: boolean) => void;
}

/**
 * The handles of kept measurements (`MeasureHandles`) and the pointer and keys on them: a click
 * opens the measurement's popover, a drag of the handle at its origin moves the whole measurement
 * (its first point snapping as a new one's start would, freely with Alt), a drag of the handle at
 * an area's far end resizes and turns it (its size snapping as a new area's would), and Delete over
 * a handle deletes its measurement. An aura stays with its token: its far handle changes how far it
 * reaches, and a drag of its badge does nothing (`handleDrag`). A drag is one undo step, opened only
 * once it starts, and only the pointer's release commits it: Escape, a cancelled pointer, the
 * window losing focus, the measurement going and the canvas no longer showing the GM's view put it
 * back and leave no step (`settleDragStep`). A press anywhere else closes the popover.
 */
export class MeasureHandleInteraction {
  private readonly handles: MeasureHandles;
  private gesture: Gesture | null = null;
  private hovered: MeasureHandleRef | null = null;
  /** Presses outside the popover, heard while one is open. */
  private readonly presses = new PopoverPressWatch((event) => this.pressedInDocument(event));
  /** The press that closed the popover, which the measure tool then starts no measurement with. */
  private closedBy: Event | null = null;
  private readonly abort = (): void => this.cancel();

  constructor(private readonly deps: MeasureHandleDeps) {
    this.handles = new MeasureHandles(deps.viewport, () => deps.viewport.scale.x, deps.place);
  }

  /** The handles' layer, for what shows and hides it. */
  get layer(): Container {
    return this.handles.view;
  }

  /** The kept measurements of the level shown: each has a handle. */
  setKept(list: readonly KeptMeasure[]): void {
    this.handles.setKept(list);
  }

  /** The zoom or the theme changed. */
  redraw(): void {
    this.handles.redraw();
  }

  /** The tokens of the level shown moved, came or went: the handles that stand on one stand elsewhere. */
  placesChanged(): void {
    this.handles.moved();
  }

  /** What the token renderer's dispatch calls. */
  readonly pointer: MeasurePointerHandlers = {
    pointerDown: (x, y, event) => this.pointerDown({ x, y }, event),
    cursorAt: (x, y) => this.cursorAt({ x, y }),
    leave: () => this.setHovered(null),
  };

  /** A measurement is being moved. */
  get dragging(): boolean {
    return !!this.gesture?.dragging();
  }

  /** A left press at a world point. True when a handle took it. */
  pointerDown(point: Point, event: Press): boolean {
    this.cancel();
    const handle = this.handleAt(point);
    if (!handle) return false;
    this.press(handle, event);
    return true;
  }

  /** The cursor over a handle, which it marks as hovered; null over none. */
  cursorAt(point: Point): string | null {
    if (this.dragging) return 'grabbing';
    const handle = this.handleAt(point);
    this.setHovered(handle);
    return handle ? 'pointer' : null;
  }

  /** Cancels a press or drag under way: what a drag changed is put back, and it leaves no undo step. */
  cancel(): void {
    this.gesture?.end(false, false);
  }

  /** Escape cancels a measurement being moved and closes the popover. */
  handleEscape(): boolean {
    const state = this.deps.store.getState();
    if (!this.dragging && !state.measurePopover) return false;
    this.cancel();
    state.closeMeasurePopover();
    return true;
  }

  /** Delete removes the measurement whose handle the pointer is over, else the one whose popover is open, in one undo step. */
  handleDelete(): boolean {
    const state = this.deps.store.getState();
    const id = (this.takesPointer() ? this.hovered?.id : null) ?? state.measurePopover;
    if (!id || !mayEditMeasure(state, id)) return false;
    this.cancel();
    this.setHovered(null);
    state.deleteMeasure(id);
    return true;
  }

  /**
   * The view's state changed: a popover whose measurement can no longer be edited closes, and a
   * measurement that is being moved and can no longer be is let go.
   */
  follow(state: HandleState): void {
    closeStaleMeasurePopover(state);
    if (this.gesture && !mayEditMeasure(state, this.gesture.id)) this.gesture.end(false, true);
    // Both may have written to the store: what is open is read as it is now.
    const open = this.deps.store.getState().measurePopover ?? null;
    this.handles.setSelected(open);
    this.presses.hear(open ? this.canvas.ownerDocument : null);
  }

  /** The handles show or hide (the canvas shows the players' view): hidden, they hold no drag, no hover and no popover. */
  visibilityChanged(): void {
    if (this.handles.view.visible) return;
    this.gesture?.end(false, true);
    this.setHovered(null);
    const state = this.deps.store.getState();
    if (state.measurePopover) state.closeMeasurePopover();
  }

  /** Another tab came to the front, or the scene unloads: a drag is put back, and the popover closes without the press that would close it. */
  leave(): void {
    this.cancel();
    this.setHovered(null);
    const state = this.deps.store.getState();
    if (state.measurePopover) state.closeMeasurePopover();
  }

  destroy(): void {
    this.cancel();
    this.presses.hear(null);
    this.handles.destroy();
  }

  /** The canvas the viewport takes its pointer from. */
  private get canvas(): HTMLElement {
    return this.deps.viewport.options.events.domElement;
  }

  private takesPointer(): boolean {
    return this.handles.view.visible && !this.deps.yields();
  }

  private handleAt(point: Point): MeasureHandleRef | null {
    return this.takesPointer() ? this.handles.hitTest(point) : null;
  }

  private setHovered(handle: MeasureHandleRef | null): void {
    const before = this.hovered?.id ?? null;
    this.hovered = handle;
    this.handles.setHovered(handle);
    const id = handle?.id ?? null;
    if (id !== before) this.deps.pointedAt?.(id);
  }

  /**
   * A press on a handle: a click opens the popover; a drag does what `handleDrag` says of the
   * handle, and nothing where that is nothing.
   */
  private press(handle: MeasureHandleRef, event: Press): void {
    const { id, part } = handle;
    const { viewport, store, snapGrid } = this.deps;
    const { handles } = this;
    const measure = keptMeasure(store.getState(), id);
    if (!measure) return;
    const start = { x: event.global.x, y: event.global.y };
    const grabbed = viewport.toWorld(start.x, start.y);
    const drag = handleDrag(measure, part, snapGrid, this.deps.aura?.(measure) ?? null);
    let placed: MeasureChanges | null = drag?.restore ?? null;
    let moved = false;
    let dragging = false;

    const onMove = (move: FederatedPointerEvent): void => {
      if (!moved) {
        if (Math.hypot(move.global.x - start.x, move.global.y - start.y) <= LIGHT_DRAG_THRESHOLD) return;
        moved = true;
        if (!drag) return;
        dragging = true;
        beginHistoryTransaction(store);
        handles.setDragging(handle);
      }
      if (!drag || !placed) return;
      // The handle keeps its distance to the pointer, so the measurement does not jump when grabbed off-centre.
      const at = viewport.toWorld(move.global.x, move.global.y);
      const changes = drag.changes({ x: at.x - grabbed.x, y: at.y - grabbed.y }, move.altKey === true);
      // Snapped, most moves of the pointer leave it where it is: nothing is written then.
      if (sameDragChanges(changes, placed)) return;
      placed = changes;
      store.getState().updateMeasure(id, changes);
    };
    this.track({
      id,
      dragging: () => dragging,
      onMove,
      end: (commit, later) => {
        if (dragging && drag) {
          handles.setDragging(null);
          settleDragStep(store, commit, later, () => {
            if (keptMeasure(store.getState(), id)) store.getState().updateMeasure(id, drag.restore);
          });
        } else if (commit && !moved) {
          store.getState().openMeasurePopover(id);
        }
      },
    });
  }

  /** Follows the pointer on the viewport until it is released, or the gesture is cancelled. */
  private track({ onMove, ...gesture }: Gesture & { onMove: (event: FederatedPointerEvent) => void }): void {
    const stop = trackPointer(this.deps.viewport, this.canvas, { onMove, onUp: () => this.gesture?.end(true, false), onAbort: this.abort });
    this.gesture = {
      ...gesture,
      end: (commit, later) => {
        this.gesture = null;
        stop();
        gesture.end(commit, later);
      },
    };
  }

  /**
   * A press outside the popover closes it, wherever it lands, except on a handle on the map:
   * that is the popover's own (the dispatch then moves the popover to that measurement, or starts
   * the drag). The press is remembered: it closed something, and measures nothing (`closedPopover`).
   */
  private pressedInDocument(event: PointerEvent): void {
    const { store, viewport } = this.deps;
    if (!store.getState().measurePopover) return;
    const target = elementOf(event.target);
    if (target?.closest(POPOVER)) return;
    const canvas = this.canvas;
    if (target === canvas) {
      const rect = canvas.getBoundingClientRect();
      if (this.handleAt(viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top))) return;
    }
    this.closedBy = event;
    store.getState().closeMeasurePopover();
  }

  /** Whether `press` is the one that closed the popover: such a press only did that. */
  closedPopover(press: object): boolean {
    const closing = this.closedBy;
    if (closing === null) return false;
    // PIXI hands on the browser's event itself, or for a finger its touch, made at the same moment.
    return press === closing || ('timeStamp' in press && press.timeStamp === closing.timeStamp);
  }
}
