import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { TextMeasure } from '../../annotations/annotationBounds';
import { HANDLE_LOOK, handleAt, isGrip, type HandleRef } from '../../annotations/annotationHandles';
import { annotationsAt } from '../../annotations/annotationHit';
import { takesPress, withGroups } from '../../annotations/annotationPress';
import type { Annotation, AnnotationPlace, TextAnnotation } from '../../annotations/annotationTypes';
import { withPointRemoved } from '../../annotations/linePoints';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { Point } from '../../types/visionTypes';
import { AnnotationGestures, type GripRef } from './AnnotationGestures';
import { AnnotationEdit, type EditLayer } from './AnnotationEdit';
import type { AnnotationHandles } from './AnnotationHandles';
import type { AnnotationPointerHandlers } from './annotationPointer';
import { readSelection, type SelectionRead } from './annotationSelection';
import { DoubleClick } from './DoubleClick';
import type { SelectingStore } from './drawToolState';
import { gripCursor } from './gripCursor';
import { outlineOf, selectionPicture } from './selectionPicture';

/** Screen pixels of slack around ink, so a thin line stays easy to take at any zoom. */
const HIT_TOLERANCE = HANDLE_LOOK.edge;

export interface AnnotationInteractionDeps {
  readonly viewport: Viewport;
  readonly store: SelectingStore;
  readonly layer: EditLayer;
  readonly handles: AnnotationHandles;
  readonly measure: TextMeasure;
  /** Whether the canvas shows the GM's view: nothing of this works in the players' picture. */
  gmView(): boolean;
  touched(): void;
  /** Where a line's point lies for the pointer at `world`. */
  snap(world: Point, free: boolean): Point;
  /** Opens a text for editing. */
  editText(text: TextAnnotation): void;
  /** Whether a text is being typed: its field stands where its frame would. */
  typing(): boolean;
  /** The box of a text's words before its scale, and where its lines break at a width: what a side handle works with. */
  wordsBox(text: TextAnnotation): { readonly width: number; readonly height: number };
  breaksAt(text: TextAnnotation, width: number): number[];
  /** Leaves copies of the annotations `ids`, moved by (dx, dy), and selects them. */
  copyMoved(ids: readonly string[], dx: number, dy: number): void;
  /** Starts the drag of the selected tokens with the press `event`: a press on an annotation drags the tokens selected with it. */
  dragTokens(event: FederatedPointerEvent): void;
  /**
   * Opens the menu of the selected annotations at the screen point `at`, `clicked` being the one
   * under the pointer; false where there is nothing to offer. Unset: a secondary press opens none.
   */
  menu?(selected: readonly Annotation[], clicked: Annotation | null, at: { x: number; y: number }): boolean;
}

/**
 * Selecting and reshaping drawings and texts: the one place that takes the pointer for them. The
 * tool in hand says what a press takes (`pressScope`): every annotation in the Draw tool's Select
 * mode, those above the tokens in the move and select tools, and in the Draw tool's other modes
 * only the handles of what is selected, which is the one just made. A press selects (with its
 * group; Shift adds or takes away) and drags; a press on a handle scales, stretches, turns or moves
 * a line's point; a right press opens the menu; a double click edits a text or removes a line's point.
 */
export class AnnotationInteraction {
  /** What the dispatch calls. */
  readonly pointer: AnnotationPointerHandlers = {
    gripDown: (x, y, event) => this.gripDown({ x, y }, event),
    pointerDown: (x, y, event) => this.pointerDown({ x, y }, event),
    secondaryDown: (x, y, event) => this.secondaryDown({ x, y }, event),
    dragAlong: (event) => this.dragAlong(event),
    cursorAt: (x, y, covered) => this.cursorAt({ x, y }, covered),
    leave: () => this.leave(),
  };

  private readonly gestures: AnnotationGestures;
  private selection: SelectionRead | null = null;
  /** The annotation whose outline shows under the pointer. */
  private hovered: Annotation | null = null;
  /** The handle under the pointer. */
  private hot: HandleRef | null = null;
  private readonly doubleClicks: DoubleClick;

  /** `now` is the clock a double click is told by, milliseconds; unset, the page's. */
  constructor(private readonly deps: AnnotationInteractionDeps, now?: () => number) {
    this.doubleClicks = new DoubleClick(now);
    this.gestures = new AnnotationGestures({
      viewport: deps.viewport,
      layer: deps.layer,
      measure: deps.measure,
      touched: () => deps.touched(),
      snap: (world, free) => deps.snap(world, free),
      wordsBox: (text) => deps.wordsBox(text),
      breaksAt: (text, width) => deps.breaksAt(text, width),
      showHandles: (handles, held) => {
        if (!handles) this.showSelection();
        else deps.handles.show({ handles, outlines: [] });
        deps.handles.setHot(held ?? this.hot);
      },
      write: (places, by) => deps.store.getState().placeAnnotations(places, by),
    });
  }

  /** Something is being dragged. */
  get dragging(): boolean {
    return this.gestures.dragging;
  }

  /** The view's state changed: the handles show what is selected now, and a gesture on something that is another now is dropped. */
  follow(): void {
    const before = this.selection;
    const now = this.read();
    if (this.gestures.active && (now.scope === 'none' || !this.deps.gmView() || !this.gestures.holds(now.list))) this.gestures.cancel();
    if (now === before) return;
    if (this.hovered && (now.list !== before?.list || now.scope !== before.scope)) this.hover(null);
    if (!this.gestures.active) this.showSelection();
  }

  /** The zoom or the theme may be another, or the canvas shows another view. */
  redraw(): void {
    if (!this.deps.gmView()) this.leaveGesture();
    if (!this.gestures.active) this.showSelection();
    this.deps.handles.redraw();
  }

  /** Texts are sized another way now (a face has loaded): what was read of the selection is read anew. */
  remeasure(): void {
    this.selection = null;
    this.redraw();
  }

  /** The map is no longer what the GM works on: a gesture under way is dropped. */
  leaveGesture(): void {
    this.gestures.cancel();
    this.leave();
  }

  /** Escape drops a gesture under way; whether there was one. */
  handleEscape(): boolean {
    if (!this.gestures.revocable) return false;
    this.gestures.cancel();
    return true;
  }

  /** Delete on a line's point under the pointer removes the point; whether the key was taken. */
  handleDelete(): boolean {
    const hot = this.hot;
    if (!this.works() || hot?.kind !== 'point') return false;
    this.removePoint(hot.index);
    return true;
  }

  /**
   * The annotations among `ids` as a gesture that turns them with a group of tokens: it shows the
   * turn and, put down, writes it. Null where none of them turns.
   */
  turnAlong(ids: readonly string[]): AnnotationEdit | null {
    if (!this.works()) return null;
    const wanted = new Set(ids);
    const annotations = this.read().list.filter((annotation) => wanted.has(annotation.id) && !annotation.locked);
    // A group of tokens turns in the store at every step, inside its own undo step: so do these.
    return annotations.length > 0 ? new AnnotationEdit(annotations, this.deps.layer, () => this.deps.touched(), (places) => this.deps.store.getState().placeAnnotations(places)) : null;
  }

  /** The ids of the annotations the handles frame now: the selection's highlights leave them out. */
  get framedIds(): ReadonlySet<string> {
    return this.read().framedIds;
  }

  destroy(): void {
    this.gestures.cancel();
  }

  private get zoom(): number {
    return Math.abs(this.deps.viewport.scale.x) || 1;
  }

  /** Whether annotations take the pointer at all: on the GM's view of the canvas, in a view that is no players' own, while no text is typed. */
  works(): boolean {
    return this.deps.store.getState().isPlayerView !== true && this.deps.gmView() && !this.deps.typing();
  }

  private read(): SelectionRead {
    this.selection = readSelection(this.deps.store.getState(), this.deps.measure, this.selection);
    return this.selection;
  }

  /** Shows the frame, handles and outlines of what is selected, as the store has it; nothing while the canvas shows the players' picture, or a text is typed. */
  private showSelection(): void {
    this.deps.handles.show(this.deps.gmView() && !this.deps.typing() ? selectionPicture(this.read(), this.zoom, this.deps.measure) : null);
  }

  /** The topmost annotation at `point` that the tool in hand takes. */
  private taken(point: Point, read: SelectionRead): Annotation | null {
    if (read.scope !== 'all' && read.scope !== 'above') return null;
    return annotationsAt(point, HIT_TOLERANCE / this.zoom, read.list, this.deps.measure).find((annotation) => takesPress(read.scope, annotation)) ?? null;
  }

  private gripAt(point: Point, read: SelectionRead): GripRef | null {
    const handle = read.handles ? handleAt(read.handles, point, this.zoom) : null;
    return isGrip(handle) ? handle : null;
  }

  private gripDown(point: Point, event: FederatedPointerEvent): boolean {
    if (!this.works()) return false;
    const read = this.read();
    const grip = this.gripAt(point, read);
    if (!grip || !read.handles) return false;
    if (grip.kind === 'point' && this.doubleClicks.pressed(`point:${grip.index}`, event.global)) {
      this.removePoint(grip.index);
      return true;
    }
    this.hover(null);
    this.gestures.grip(read.free, read.handles, grip, event);
    return true;
  }

  private pointerDown(point: Point, event: FederatedPointerEvent): boolean {
    if (!this.works()) return false;
    const read = this.read();
    const state = this.deps.store.getState();
    if (read.scope === 'made') {
      // The press is on no handle: what was just made is let go of, and the press draws the next.
      if (read.selected.length > 0) state.setSelection(this.without(read.selected.map(({ id }) => id)));
      return false;
    }
    const at = this.taken(point, read);
    const handle = read.handles ? handleAt(read.handles, point, this.zoom) : null;
    if (!at) {
      // Inside the frame, on none of what it holds: the selection is moved.
      if (handle?.kind !== 'body' || event.shiftKey) return false;
      this.startMove(this.read(), null, event);
      return true;
    }
    if (at.kind === 'text' && this.doubleClicks.pressed(at.id, event.global)) {
      this.deps.editText(at);
      return true;
    }
    const group = withGroups([at.id], read.list, read.scope);
    const selected = state.selectedIds.includes(at.id);
    if (event.shiftKey) {
      state.setSelection(selected ? this.without(group) : [...this.without(group), ...group]);
      if (selected) return true;
    } else if (!selected) {
      state.setSelection(group);
    }
    this.hover(null);
    // A click on the edge of the one line that shows its points adds a point there; a drag moves the line.
    const edge = selected && handle?.kind === 'edge' && read.handles?.line === at ? handle : null;
    this.startMove(this.read(), edge, event);
    return true;
  }

  /** Moves the selected annotations that may be moved with the pointer, and the tokens selected with them. */
  private startMove(read: SelectionRead, edge: Extract<HandleRef, { kind: 'edge' }> | null, event: FederatedPointerEvent): void {
    const { movable, handles, withTokens } = read;
    const { store } = this.deps;
    // Before this move listens: the tokens' drag copies what is selected before anything has moved.
    if (withTokens) this.deps.dragTokens(event);
    if (movable.length === 0) return;
    this.gestures.move(movable, event, {
      handles,
      ...(edge && handles && { click: () => this.gestures.addPoint(handles, edge.after, edge.at) }),
      // Tokens dragged with them write as they go: both are one undo step, and the tokens' drag copies for both.
      ...(withTokens
        ? { withTokens: { begin: () => beginHistoryTransaction(store), end: () => endHistoryTransaction(store) } }
        : { copy: (dx: number, dy: number) => this.deps.copyMoved(movable.map(({ id }) => id), dx, dy) }),
    });
  }

  private dragAlong(event: FederatedPointerEvent): void {
    if (!this.works()) return;
    const { movable } = this.read();
    const { store } = this.deps;
    if (movable.length === 0) return;
    this.gestures.move(movable, event, { handles: null, withTokens: { begin: () => beginHistoryTransaction(store), end: () => endHistoryTransaction(store) } });
  }

  private secondaryDown(point: Point, event: FederatedPointerEvent): boolean {
    if (!this.works()) return false;
    let read = this.read();
    const at = this.taken(point, read);
    const inFrame = read.handles !== null && read.scope !== 'made' && handleAt(read.handles, point, this.zoom) !== null;
    if (!at && !inFrame) return false;
    const state = this.deps.store.getState();
    if (at && !state.selectedIds.includes(at.id)) {
      state.setSelection(withGroups([at.id], read.list, read.scope));
      read = this.read();
    }
    this.gestures.cancel();
    this.deps.menu?.(read.selected, at, { x: event.clientX, y: event.clientY });
    return true;
  }

  private cursorAt(point: Point, covered: () => boolean): string | null {
    if (this.gestures.dragging) return 'grabbing';
    if (!this.works()) {
      this.leave();
      return null;
    }
    const read = this.read();
    const handle = read.handles ? handleAt(read.handles, point, this.zoom) : null;
    if (isGrip(handle) && read.handles) {
      this.setHot(handle);
      this.hover(null);
      return gripCursor(handle, read.handles.frame.rotation);
    }
    this.setHot(null);
    const at = this.taken(point, read);
    // The frame's inside moves the selection, but not in a mode that draws: there a press in it draws.
    const inside = handle?.kind === 'body' && read.scope !== 'made';
    // A token is asked for only where something of this lies: the move and select tools give it the press.
    if ((!at && !inside) || (read.scope === 'above' && covered())) {
      this.hover(null);
      return null;
    }
    // What is framed already needs no outline of its own.
    this.hover(at && !read.framed.includes(at) ? at : null);
    return at?.locked ? 'default' : 'move';
  }

  private leave(): void {
    this.setHot(null);
    this.hover(null);
  }

  private setHot(ref: HandleRef | null): void {
    this.hot = ref;
    if (!this.gestures.active) this.deps.handles.setHot(ref);
  }

  private hover(annotation: Annotation | null): void {
    if (annotation === this.hovered) return;
    this.hovered = annotation;
    this.deps.handles.hover(annotation ? outlineOf(annotation, this.zoom, this.deps.measure) : null);
  }

  /** Removes the point `index` of the one line whose points show, where it has one to spare. */
  private removePoint(index: number): void {
    const line = this.read().handles?.line;
    const place: AnnotationPlace | null = line ? withPointRemoved(line, index) : null;
    this.setHot(null);
    if (line && place) this.deps.store.getState().placeAnnotations({ [line.id]: place });
  }

  /** The selection without `ids`. */
  private without(ids: readonly string[]): string[] {
    const gone = new Set(ids);
    return this.deps.store.getState().selectedIds.filter((id) => !gone.has(id));
  }
}
