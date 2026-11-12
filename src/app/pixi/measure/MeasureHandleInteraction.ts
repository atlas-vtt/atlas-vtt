import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand/vanilla';
import type { GridGeometry } from '../../grid/gridDistance';
import { measureMovedBy } from '../../measure/measureMove';
import type { KeptMeasure } from '../../measure/measureTypes';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { MeasuresSlice } from '../../stores/measuresSlice';
import type { UISlice } from '../../stores/uiSlice';
import type { Point } from '../../types/visionTypes';
import { elementOf, LIGHT_DRAG_THRESHOLD } from '../lighting/LightInteraction';
import type { MeasureHandleRef, MeasurePointerHandlers } from './measureHandle';
import { MeasureHandles } from './MeasureHandles';
import { closeStaleMeasurePopover, keptMeasure, mayEditMeasure, type MeasureEditState } from './measurePopoverGuard';

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
 * opens the measurement's popover, a drag moves the whole measurement (its first point snapping
 * as a new one's start would, freely with Alt), and Delete over a handle deletes its measurement.
 * A drag is one undo step, opened only once it starts, and only the pointer's release commits it:
 * Escape, a cancelled pointer, the window losing focus, the measurement going and the canvas no
 * longer showing the GM's view put it back and leave no step. A press anywhere else closes the
 * popover.
 */
export class MeasureHandleInteraction {
  private readonly handles: MeasureHandles;
  private gesture: Gesture | null = null;
  private hovered: string | null = null;
  /** The document a press outside the popover is heard in, while a popover is open. */
  private pressDocument: Document | null = null;
  private readonly abort = (): void => this.cancel();

  constructor(private readonly deps: MeasureHandleDeps) {
    this.handles = new MeasureHandles(deps.viewport, () => deps.viewport.scale.x);
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
    this.setHovered(handle?.id ?? null);
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
    const id = (this.takesPointer() ? this.hovered : null) ?? state.measurePopover;
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
    this.hearPresses(open ? this.canvas.ownerDocument : null);
  }

  /** The handles show or hide (the canvas shows the players' view): hidden, they hold no drag, no hover and no popover. */
  visibilityChanged(): void {
    if (this.handles.view.visible) return;
    this.gesture?.end(false, true);
    this.setHovered(null);
    const state = this.deps.store.getState();
    if (state.measurePopover) state.closeMeasurePopover();
  }

  destroy(): void {
    this.cancel();
    this.hearPresses(null);
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

  private setHovered(id: string | null): void {
    this.hovered = id;
    this.handles.setHovered(id);
  }

  /** A press on the origin's handle: a click opens the popover, a drag moves the measurement. */
  private press({ id }: MeasureHandleRef, event: Press): void {
    const { viewport, store, snapGrid } = this.deps;
    const { handles } = this;
    const measure = keptMeasure(store.getState(), id);
    if (!measure) return;
    const start = { x: event.global.x, y: event.global.y };
    const grabbed = viewport.toWorld(start.x, start.y);
    const origin = measure.points.map(({ x, y }) => ({ x, y }));
    let placed = origin[0]!;
    let dragging = false;

    const onMove = (move: FederatedPointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.global.x - start.x, move.global.y - start.y) <= LIGHT_DRAG_THRESHOLD) return;
        dragging = true;
        beginHistoryTransaction(store);
        handles.setDragging(id);
      }
      // The handle keeps its distance to the pointer, so the measurement does not jump when grabbed off-centre.
      const at = viewport.toWorld(move.global.x, move.global.y);
      const points = measureMovedBy(measure.shape, origin, { x: at.x - grabbed.x, y: at.y - grabbed.y }, snapGrid(), move.altKey === true);
      const first = points[0]!;
      // Snapped, most moves of the pointer leave it where it is: nothing is written then.
      if (first.x === placed.x && first.y === placed.y) return;
      placed = first;
      store.getState().updateMeasure(id, { points });
    };
    this.track({
      id,
      dragging: () => dragging,
      onMove,
      end: (commit, later) => {
        if (dragging) {
          handles.setDragging(null);
          this.settle(commit, later, () => {
            if (keptMeasure(store.getState(), id)) store.getState().updateMeasure(id, { points: origin });
          });
        } else if (commit) {
          store.getState().openMeasurePopover(id);
        }
      },
    });
  }

  /** Closes a drag's undo step: recorded on a commit; on a cancel `restore` puts the measurement back and no step is left. */
  private settle(commit: boolean, later: boolean, restore: () => void): void {
    const { store } = this.deps;
    if (commit) {
      endHistoryTransaction(store);
      return;
    }
    restore();
    // The history looks at a write once its listeners are done: closed inside one, the step
    // would be left for the write that cancelled the drag, with the drag's state as its past.
    if (later) queueMicrotask(() => abandonHistoryTransaction(store));
    else abandonHistoryTransaction(store);
  }

  /** Follows the pointer on the viewport until it is released, or the gesture is cancelled. */
  private track({ onMove, ...gesture }: Gesture & { onMove: (event: FederatedPointerEvent) => void }): void {
    const { viewport } = this.deps;
    const canvas = this.canvas;
    const win = canvas.ownerDocument.defaultView;
    const onUp = (): void => this.gesture?.end(true, false);
    viewport.on('pointermove', onMove);
    viewport.on('pointerup', onUp);
    viewport.on('pointerupoutside', onUp);
    canvas.addEventListener('pointercancel', this.abort);
    win?.addEventListener('blur', this.abort);
    this.gesture = {
      ...gesture,
      end: (commit, later) => {
        this.gesture = null;
        viewport.off('pointermove', onMove);
        viewport.off('pointerup', onUp);
        viewport.off('pointerupoutside', onUp);
        canvas.removeEventListener('pointercancel', this.abort);
        win?.removeEventListener('blur', this.abort);
        gesture.end(commit, later);
      },
    };
  }

  /** Listens for presses in `doc` while a popover is open there; in none once it has closed. */
  private hearPresses(doc: Document | null): void {
    if (doc === this.pressDocument) return;
    this.pressDocument?.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.pressDocument = doc;
    doc?.addEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  /**
   * A press outside the popover closes it, wherever it lands, except on a handle on the map:
   * that is the popover's own (the dispatch then moves the popover to that measurement, or starts
   * the drag).
   */
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const { store, viewport } = this.deps;
    if (!store.getState().measurePopover) return;
    const target = elementOf(event.target);
    if (target?.closest(POPOVER)) return;
    const canvas = this.canvas;
    if (target === canvas) {
      const rect = canvas.getBoundingClientRect();
      if (this.handleAt(viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top))) return;
    }
    store.getState().closeMeasurePopover();
  };
}
