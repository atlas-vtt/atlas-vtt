import { Point as PixiPoint, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MadeShape } from '../../annotations/madeDrawing';
import type { Point } from '../../types/visionTypes';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';
import { DRAW_DRAG_THRESHOLD, DrawGesture, sweeps, type DrawGestureResult, type DrawPointer, type GestureMode } from './drawGesture';

/** A press this soon after the click that ended a shape, in the same place, is that click's second (a double click) and draws nothing. */
const DOUBLE_CLICK_MS = 500;

/** A synthetic event may carry no modifier state at all. */
const altHeld = (e: FederatedPointerEvent): boolean => e.altKey === true;
const shiftHeld = (e: FederatedPointerEvent): boolean => e.shiftKey === true;

/** What the Draw tool's input asks of, and tells, whoever owns the drawings. */
export interface DrawInputHost {
  /** The mode a press draws in now; null while the tool is not in hand, or its mode draws nothing by a gesture. */
  mode(): GestureMode | null;
  /** Where a shape's point lies for the pointer at `world`: on the grid where it snaps, unless `free`. */
  point(world: Point, free: boolean): Point;
  /** A gesture of `mode` begins. */
  started(mode: GestureMode): void;
  /** The shape under way changed. */
  changed(shape: MadeShape): void;
  /** The eraser, or the Cells mode, passed along `path` (one point for a dab); `alt` was held. */
  swept(path: readonly Point[], alt: boolean): void;
  /** The gesture is over: `made` is what was drawn, null after a sweep. */
  finished(made: MadeShape | null): void;
  /** The gesture was dropped: nothing of it stays. */
  cancelled(): void;
  /** The pointer is over the map at `world`, a gesture under way or not. */
  hovered(world: Point): void;
}

/** Whose a key is that is pressed while a shape is under way (the measure tool's rules). */
export interface DrawKeys {
  /** Whether the key is typed into a text field: it is that field's, and changes nothing. */
  typed(event: KeyboardEvent): boolean;
  /** Whether the key is the map's to take: one that is not drops the shape and is left alone. */
  areMaps(event: KeyboardEvent): boolean;
}

/**
 * The Draw tool's pointer and keys on a viewport, handed to a `DrawGesture`. It listens to the
 * pointer while the tool is `enabled`, and to the keys of a shape under way only while there is
 * one, in the capture phase, so Space adds a corner before the map's hotkeys open the command
 * palette. The primary button draws; any other is left to the viewport (a right-drag pans).
 *
 * A shape placed click by click waits between its clicks and holds keys meanwhile, so it must not
 * outlast the GM's attention: it is dropped as soon as the map is no longer what the GM works on.
 * The window loses focus, a press lands anywhere but on the canvas, focus goes outside the map's
 * tab, or a key is pressed that is not the map's (`DrawKeys.areMaps`). An eraser's sweep ends
 * there and keeps what it erased. All of it is heard in the canvas's own window and document, so
 * a map in a popout is followed there.
 */
export class DrawInput {
  private readonly gesture = new DrawGesture();
  private enabled = false;
  /** Stops listening for what a gesture under way hears beyond the viewport; null while none is. */
  private letGo: (() => void) | null = null;
  /** Where the pointer was last, and the keys held then: a change of Shift or Alt places the end again. */
  private pointer: { world: Point; screen: Point; free: boolean; constrain: boolean } | null = null;
  /** Where the button went down, in screen pixels, while it is down for a gesture. */
  private pressedAt: Point | null = null;
  /** The click that ended a shape, which a double click's second press follows. */
  private lastClick: { readonly at: Point; readonly time: number } | null = null;
  private readonly scratch = new PixiPoint();

  constructor(
    private readonly viewport: Viewport,
    private readonly host: DrawInputHost,
    private readonly keys: DrawKeys,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** A gesture is under way: a press belongs to it, wherever it lands. */
  get drawing(): boolean {
    return this.gesture.active;
  }

  /** Listens to the pointer, or stops and ends the gesture under way. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    const change = enabled ? 'on' : 'off';
    this.viewport[change]('pointerdown', this.onPointerDown);
    this.viewport[change]('pointermove', this.onPointerMove);
    this.viewport[change]('pointerup', this.onPointerUp);
    this.viewport[change]('pointerupoutside', this.onPointerUp);
    this.viewport[change]('pointercancel', this.onPointerCancel);
    if (!enabled) this.stop();
  }

  /** The dispatch that claims presses listens now: this input hears them after it. */
  hearPressesLast(): void {
    if (this.enabled) hearPressesLast(this.viewport, this.onPointerDown);
  }

  /** Ends the gesture under way: a shape is dropped, an eraser's sweep ends where it is. */
  stop(): void {
    this.apply(this.gesture.stop(), false);
  }

  destroy(): void {
    this.setEnabled(false);
    this.release();
  }

  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    // Any other button is the viewport's, and a pin, door badge, light marker or handle may have taken the press.
    if (!isPrimaryPress(e) || isHandled(e)) return;
    const at = this.read(e);
    if (this.gesture.active) {
      e.stopPropagation();
      this.pressedAt = at.screen;
      this.apply(this.gesture.press(at), altHeld(e));
      return;
    }
    const mode = this.host.mode();
    if (!mode) return;
    e.stopPropagation();
    if (this.followsLastClick(at.screen)) return;
    this.host.started(mode);
    this.pressedAt = at.screen;
    this.apply(this.gesture.begin(mode, at), altHeld(e));
  };

  private readonly onPointerMove = (e: FederatedPointerEvent): void => {
    if (this.enabled) this.host.hovered(this.viewport.toWorld(e.global));
    if (!this.gesture.active) return;
    e.stopPropagation();
    const mode = this.gesture.mode;
    // The pen and a sweep follow every place the pointer passed, also those between two frames.
    const between = mode === 'pen' || sweeps(mode) ? this.coalesced(e) : [];
    if (between.length === 0) {
      this.apply(this.gesture.move(this.read(e)), altHeld(e));
      return;
    }
    const last = this.read(e);
    const sweep: Point[] = [];
    let live = false;
    for (const raw of between) {
      const result = this.gesture.move({ ...last, raw, placed: raw });
      live ||= result.kind === 'live';
      if (result.kind === 'sweep') sweep.push(...(sweep.length === 0 ? [result.from, result.to] : [result.to]));
    }
    if (sweep.length > 0) this.host.swept(sweep, altHeld(e));
    else if (live) this.apply({ kind: 'live' }, false);
  };

  /** Never asked which button: a browser tells of a release only with the last button, whichever it is. */
  private readonly onPointerUp = (e: FederatedPointerEvent): void => {
    if (!this.gesture.active) return;
    const at = this.read(e);
    // A sweep's last step, and the pen's, to where the button came up.
    this.apply(this.gesture.move(at), altHeld(e));
    const mode = this.gesture.mode;
    const result = this.gesture.release(at);
    if (result.kind === 'none') return;
    e.stopPropagation();
    const pressed = this.pressedAt;
    this.pressedAt = null;
    // A shape ended by a click may be followed by the second click of a double click. A pen's dot and an eraser's dab are no such click: the next one counts.
    const placed = mode === 'line' || mode === 'rectangle' || mode === 'ellipse';
    const clicked = placed && result.kind !== 'live' && pressed !== null && Math.hypot(e.global.x - pressed.x, e.global.y - pressed.y) <= DRAW_DRAG_THRESHOLD;
    this.lastClick = clicked ? { at: pressed, time: this.now() } : null;
    this.apply(result, altHeld(e));
  };

  /** The browser took the pointer away (a touch that became a system gesture). */
  private readonly onPointerCancel = (): void => this.stop();

  /** The window lost focus, or the GM turned to something else. */
  private readonly drop = (): void => this.stop();

  /** A press anywhere but on the canvas (a toolbar, a panel, another tab) is not the shape's. */
  private readonly onPressInDocument = (event: PointerEvent): void => {
    if (event.target !== this.canvas) this.stop();
  };

  /** Focus went to something outside the map's tab: a dialog opened over it, by a key or by itself. */
  private readonly onFocusIn = (event: FocusEvent): void => {
    const tab = this.canvas.closest('.workspace-leaf');
    const target = event.target as Node | null;
    if (tab && target && !tab.contains(target)) this.stop();
  };

  /** The keys of a gesture under way, taken before the map's hotkeys see them. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.gesture.active || this.keys.typed(event)) return;
    // Not the map's key: the shape is dropped, and the key left to whoever it belongs to.
    if (!this.keys.areMaps(event)) {
      this.stop();
      return;
    }
    if (event.key === 'Alt' || event.key === 'Shift') {
      this.replace(event.key, true);
      return;
    }
    const act = this.keyAction(event.key);
    if (!act) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) this.apply(act(), false);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if ((event.key === 'Alt' || event.key === 'Shift') && this.gesture.active) this.replace(event.key, false);
  };

  private keyAction(key: string): (() => DrawGestureResult) | null {
    switch (key) {
      case ' ': return () => this.gesture.corner();
      case 'Backspace': return () => this.gesture.back();
      case 'Enter': return () => this.gesture.finish();
      case 'Escape': return () => this.gesture.cancel();
      default: return null;
    }
  }

  /** Alt or Shift went down or up while the pointer rested: the end is placed again. */
  private replace(key: 'Alt' | 'Shift', held: boolean): void {
    const pointer = this.pointer;
    if (!pointer) return;
    if (key === 'Alt') pointer.free = held;
    else pointer.constrain = held;
    const { world, screen, free, constrain } = pointer;
    this.apply(this.gesture.move({ raw: world, placed: this.host.point(world, free), screen, zoom: this.zoom, constrain }), free);
  }

  private get zoom(): number {
    return Math.abs(this.viewport.scale.x) || 1;
  }

  /** The pointer of `e` as the gesture is told of it, remembered for a key that places it again. */
  private read(e: FederatedPointerEvent): DrawPointer {
    const { x, y } = this.viewport.toWorld(e.global);
    const world = { x, y };
    const screen = { x: e.global.x, y: e.global.y };
    const free = altHeld(e);
    const constrain = shiftHeld(e);
    this.pointer = { world, screen, free, constrain };
    return { raw: world, placed: this.host.point(world, free), screen, zoom: this.zoom, constrain };
  }

  /** The places the pointer passed since the event before `e`, in world pixels; none where the browser tells of none. */
  private coalesced(e: FederatedPointerEvent): Point[] {
    const native = e.nativeEvent as Partial<PointerEvent> | undefined;
    const events = typeof native?.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    if (events.length < 2) return [];
    return events.map((event) => {
      this.viewport.options.events.mapPositionToPoint(this.scratch, event.clientX, event.clientY);
      const { x, y } = this.viewport.toWorld(this.scratch);
      return { x, y };
    });
  }

  private followsLastClick(screen: Point): boolean {
    const last = this.lastClick;
    this.lastClick = null;
    return last !== null && this.now() - last.time <= DOUBLE_CLICK_MS && Math.hypot(screen.x - last.at.x, screen.y - last.at.y) <= DRAW_DRAG_THRESHOLD;
  }

  private apply(result: DrawGestureResult, alt: boolean): void {
    if (result.kind === 'none') return;
    if (this.gesture.active) this.hold();
    else this.release();
    switch (result.kind) {
      case 'live': {
        const shape = this.gesture.shape;
        if (shape) this.host.changed(shape);
        return;
      }
      case 'sweep':
        this.host.swept(same(result.from, result.to) ? [result.to] : [result.from, result.to], alt);
        return;
      case 'finish':
        this.pointer = null;
        this.pressedAt = null;
        this.host.finished(result.made);
        return;
      case 'cancel':
        this.pointer = null;
        this.pressedAt = null;
        this.host.cancelled();
    }
  }

  /** The canvas the viewport takes its pointer from. */
  private get canvas(): HTMLElement {
    return this.viewport.options.events.domElement;
  }

  /** Listens, for as long as a gesture is under way, to its keys and to what ends it. */
  private hold(): void {
    if (this.letGo) return;
    const doc = this.canvas.ownerDocument;
    const win = doc.defaultView;
    win?.addEventListener('keydown', this.onKeyDown, true);
    win?.addEventListener('keyup', this.onKeyUp, true);
    win?.addEventListener('blur', this.drop);
    doc.addEventListener('pointerdown', this.onPressInDocument, true);
    doc.addEventListener('focusin', this.onFocusIn);
    this.letGo = (): void => {
      win?.removeEventListener('keydown', this.onKeyDown, true);
      win?.removeEventListener('keyup', this.onKeyUp, true);
      win?.removeEventListener('blur', this.drop);
      doc.removeEventListener('pointerdown', this.onPressInDocument, true);
      doc.removeEventListener('focusin', this.onFocusIn);
    };
  }

  private release(): void {
    this.letGo?.();
    this.letGo = null;
  }
}

function same(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
