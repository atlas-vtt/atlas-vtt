import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { TextMeasure } from '../../annotations/annotationBounds';
import { handlesOf, mapHandles, type HandleRef, type HandleSet } from '../../annotations/annotationHandles';
import { readDrawing, readText } from '../../annotations/annotationList';
import { moveBy, scaleByHandle, turnAbout, turnBetween, type Transform } from '../../annotations/annotationTransform';
import type { Annotation, AnnotationPlace, TextAnnotation } from '../../annotations/annotationTypes';
import { withPointAdded, withPointMoved } from '../../annotations/linePoints';
import { draggedWidth, placeBesideSide } from '../../annotations/textWidth';
import type { Point } from '../../types/visionTypes';
import { trackPointer } from '../measure/pointerTrack';
import { AnnotationEdit, type EditLayer, type PlaceWriter } from './AnnotationEdit';

/** Screen pixels the pointer travels before a press becomes a drag. */
export const ANNOTATION_DRAG_THRESHOLD = 4;
/**
 * World pixels the pointer travels before tokens are dragged (`InteractionController`). A move
 * that goes with tokens begins with theirs, on the same pointer move: their drag copies what is
 * selected before anything has moved.
 */
const TOKEN_DRAG_DISTANCE = 5;

/** A handle that stands on the frame or the line: what a drag of it reshapes. */
export type GripRef = Exclude<HandleRef, { kind: 'body' | 'edge' }>;

export interface GestureDeps {
  readonly viewport: Viewport;
  readonly layer: EditLayer;
  readonly measure: TextMeasure;
  /** A text was scaled or placed on its view alone. */
  readonly touched: () => void;
  /** Where a line's point lies for the pointer at `world`: on the grid where it snaps, unless `free`. */
  readonly snap: (world: Point, free: boolean) => Point;
  /** The box of a text's words before its scale, as it is set. */
  readonly wordsBox: (text: TextAnnotation) => { readonly width: number; readonly height: number };
  /** Where the lines of `text` break at `width`. */
  readonly breaksAt: (text: TextAnnotation, width: number) => number[];
  /** Shows the handles as the gesture leaves them, and the one it holds; null shows them from the store again. */
  readonly showHandles: (handles: HandleSet | null, held: HandleRef | null) => void;
  /** Writes where a gesture left the annotations: one write, one undo step. */
  readonly write: PlaceWriter;
}

/** What a move of annotations does besides showing and writing where they went. */
export interface MoveOptions {
  /** The frame and handles that move with them; null where none show. */
  readonly handles: HandleSet | null;
  /** A release in place does this (a click on a line's edge adds a point there). */
  readonly click?: () => void;
  /**
   * The move goes with tokens that are dragged: every step is written at once, between `begin`
   * (before the first) and `end` (after the last, whatever ended it), which hold one undo step
   * open with the tokens' own. Such a move is never put back: a lost pointer drops the tokens
   * where they are, and what moves with them stays with them.
   */
  readonly withTokens?: { begin(): void; end(): void };
  /** A release after a drag with Alt held leaves copies there, by this, and the originals where they were. */
  readonly copy?: (dx: number, dy: number) => void;
}

interface Running {
  readonly annotations: readonly Annotation[];
  /** Its steps are written as they are shown: the annotations' records are others at every step. */
  readonly live: boolean;
  /** The pointer has travelled: the gesture changes something. */
  dragging: boolean;
  end(commit: boolean): void;
}

/**
 * The gesture under way on selected annotations: a move, a handle's scale, stretch or turn, a
 * line's point dragged, or a text's side, which sets the width its words wrap at. While it lasts the layer shows where it would leave them (`AnnotationEdit`)
 * and the handles follow; the pointer's release writes it in one write, and anything else that
 * ends it (Escape, a lost pointer, the window losing focus, `cancel`) shows everything as it was
 * and leaves no undo step. The viewport's pan is held for as long as a drag lasts.
 */
export class AnnotationGestures {
  private running: Running | null = null;

  constructor(private readonly deps: GestureDeps) {}

  get active(): boolean {
    return this.running !== null;
  }

  /** The pointer has travelled since the press: something is being dragged. */
  get dragging(): boolean {
    return this.running?.dragging ?? false;
  }

  /**
   * Whether the gesture under way can go on with `list` on the map: every annotation it changes is
   * there as it found it, or, where it writes its steps itself, is there at all.
   */
  holds(list: readonly Annotation[]): boolean {
    const running = this.running;
    if (!running) return true;
    if (!running.live) {
      const current = new Set(list);
      return running.annotations.every((annotation) => current.has(annotation));
    }
    const ids = new Set(list.map((annotation) => `${annotation.kind}:${annotation.id}`));
    return running.annotations.every((annotation) => ids.has(`${annotation.kind}:${annotation.id}`));
  }

  /** Ends the gesture under way without a write; one that goes with tokens ends where it is. */
  cancel(): void {
    this.running?.end(false);
  }

  /** Whether Escape puts the gesture under way back: any but a move that goes with tokens, whose drag is theirs to end. */
  get revocable(): boolean {
    return this.running !== null && !this.running.live;
  }

  /** A press that moves `annotations` with the pointer from here on. */
  move(annotations: readonly Annotation[], event: FederatedPointerEvent, options: MoveOptions): void {
    const live = options.withTokens !== undefined;
    const edit = new AnnotationEdit(annotations, this.deps.layer, this.deps.touched, live ? this.deps.write : null);
    let offset = { x: 0, y: 0 };
    let copies = false;
    this.track(annotations, event, live, {
      start: () => options.withTokens?.begin(),
      step: (drag, move) => {
        offset = drag;
        copies = move.altKey === true && options.copy !== undefined;
        const transform = moveBy(drag.x, drag.y);
        edit.show(transform);
        this.deps.showHandles(options.handles ? mapHandles(options.handles, transform) : null, { kind: 'body' });
      },
      end: (commit, dragged) => {
        if (commit && dragged && copies) {
          edit.drop();
          options.copy?.(offset.x, offset.y);
        } else if (dragged && (commit || live)) edit.commit(this.deps.write);
        else edit.drop();
        if (dragged) options.withTokens?.end();
        if (commit && !dragged) options.click?.();
      },
    });
  }

  /** A press on the handle `grip` of `handles`, which frame `annotations`: a drag scales, stretches or turns them, or moves the line's point. */
  grip(annotations: readonly Annotation[], handles: HandleSet, grip: GripRef, event: FederatedPointerEvent): void {
    this.cancel();
    const edit = new AnnotationEdit(annotations, this.deps.layer, this.deps.touched);
    const grabbed = this.world(event);
    const line = handles.line;
    const point = grip.kind === 'point' ? handles.points[grip.index] : undefined;
    this.deps.showHandles(handles, grip);
    this.track(annotations, event, false, {
      step: (drag, move) => {
        if (grip.kind === 'point') {
          if (!line || !point) return;
          const place = withPointMoved(line, grip.index, this.deps.snap({ x: point.x + drag.x, y: point.y + drag.y }, move.altKey === true));
          if (!place) return;
          edit.showPlaces({ [line.id]: place });
          const shown = readDrawing(line.id, { ...line.record, ...place });
          this.deps.showHandles(shown ? handlesOf([shown], this.deps.measure) : handles, grip);
          return;
        }
        if (grip.kind === 'side' && handles.wrap && grip.x !== 0) {
          const text = handles.wrap;
          const place = this.widthPlace(text, grip.x, drag);
          edit.showPlaces({ [text.id]: place });
          const shown = readText(text.id, { ...text.record, ...place });
          this.deps.showHandles(shown ? handlesOf([shown], this.deps.measure) : handles, grip);
          return;
        }
        const transform = this.transformOf(handles, grip, grabbed, drag, move.shiftKey === true);
        edit.show(transform);
        this.deps.showHandles(mapHandles(handles, transform), grip);
      },
      end: (commit, dragged) => {
        if (commit && dragged) edit.commit(this.deps.write);
        else edit.drop();
      },
    });
  }

  /** Adds a point to `line` (the one line `handles` shows) at `at`, after its point `after`: one write. */
  addPoint(handles: HandleSet, after: number, at: Point): void {
    const line = handles.line;
    const place = line ? withPointAdded(line, after, at) : null;
    if (line && place) this.deps.write({ [line.id]: place });
  }

  /** Where a drag of the `side` handle of `text` by `drag` leaves it: its width, the breaks of its lines there, and its place, the other side and its top staying. */
  private widthPlace(text: TextAnnotation, side: -1 | 1, drag: Point): AnnotationPlace {
    const before = this.deps.wordsBox(text);
    const width = draggedWidth(text, before.width, side, drag, text.fontSize);
    const breaks = this.deps.breaksAt(text, width);
    const wrapped = readText(text.id, { ...text.record, width, breaks });
    const at = placeBesideSide(text, text, before, wrapped ? this.deps.wordsBox(wrapped) : before, side);
    return { x: at.x, y: at.y, width, breaks };
  }

  private transformOf(handles: HandleSet, grip: Exclude<GripRef, { kind: 'point' }>, grabbed: Point, drag: Point, shift: boolean): Transform {
    const { frame } = handles;
    if (grip.kind === 'turn') return turnAbout(frame.centre, turnBetween(frame.centre, grabbed, { x: grabbed.x + drag.x, y: grabbed.y + drag.y }, shift));
    return scaleByHandle(frame, grip, drag, handles.proportional || (shift && grip.kind === 'corner'));
  }

  private world(event: FederatedPointerEvent): Point {
    const { x, y } = this.deps.viewport.toWorld(event.global);
    return { x, y };
  }

  /**
   * Follows the pointer from the press `event`: `step` is told how far it has moved in the world
   * once it has travelled the threshold, `end` whether the release commits and whether it was dragged.
   */
  private track(annotations: readonly Annotation[], event: FederatedPointerEvent, live: boolean, gesture: {
    start?: () => void;
    step(drag: Point, move: FederatedPointerEvent): void;
    end(commit: boolean, dragged: boolean): void;
  }): void {
    this.cancel();
    const { viewport } = this.deps;
    const pressed = { x: event.global.x, y: event.global.y };
    const grabbed = this.world(event);
    const running: Running = {
      annotations,
      live,
      dragging: false,
      end: (commit) => {
        if (this.running !== running) return;
        this.running = null;
        stop();
        if (running.dragging) viewport.plugins.resume('drag');
        gesture.end(commit, running.dragging);
        this.deps.showHandles(null, null);
      },
    };
    const onMove = (move: FederatedPointerEvent): void => {
      const at = this.world(move);
      const drag = { x: at.x - grabbed.x, y: at.y - grabbed.y };
      if (!running.dragging) {
        const far = live ? Math.hypot(drag.x, drag.y) > TOKEN_DRAG_DISTANCE : Math.hypot(move.global.x - pressed.x, move.global.y - pressed.y) > ANNOTATION_DRAG_THRESHOLD;
        if (!far) return;
        running.dragging = true;
        viewport.plugins.pause('drag');
        gesture.start?.();
      }
      gesture.step(drag, move);
    };
    const stop = trackPointer(viewport, viewport.options.events.domElement, { onMove, onUp: () => running.end(true), onAbort: () => running.end(false) });
    this.running = running;
  }
}
