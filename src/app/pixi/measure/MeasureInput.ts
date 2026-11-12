import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { isTextEntryTarget } from '../../keyboard/textEntry';
import type { Measurement, MeasureShapeKind } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import { isHandled } from '../utils/handledEvents';
import { MEASURE_DRAG_THRESHOLD, MeasureGesture, type GestureResult } from './measureGesture';

/** A press this soon after the click that ended a measurement, in the same place, is that click's second (a double click) and measures nothing. */
const DOUBLE_CLICK_MS = 500;

/** Alt frees a point from the grid; a synthetic event may carry no modifier state at all. */
const altHeld = (e: FederatedPointerEvent): boolean => e.altKey === true;
const shiftHeld = (e: FederatedPointerEvent): boolean => e.shiftKey === true;

/** What the measure tool's input asks of, and tells, whoever owns the measurements. */
export interface MeasureInputHost {
  /** The shape a press measures with now; null while the tool's mode cannot be measured with. */
  shape(): MeasureShapeKind | null;
  /** Where a measurement's point lies for the pointer at `world`: snapped as the grid says, unless `free`. */
  point(world: Point, free: boolean): Point;
  /** A press at `world` that is no measurement's (the pin of the one fading): true when it was taken. */
  takePress(world: Point): boolean;
  /** A measurement begins: the pointer pressed at `pressed`, and its start is drawn at `start`. */
  started(pressed: Point, start: Point): void;
  /** The measurement being made changed. */
  changed(measurement: Measurement): void;
  /** It was finished; `shift` was held then. */
  finished(measurement: Measurement, shift: boolean): void;
  /** It was dropped. */
  cancelled(): void;
}

/**
 * The measure tool's pointer and keys on a viewport, handed to a `MeasureGesture`. It listens to the
 * pointer while the tool is `enabled`, and to the keys of a measurement under way only while there is
 * one: in the capture phase, as a token drag does, so Space adds a corner before the map's hotkeys
 * open the command palette. The primary button measures; any other is left to the viewport (a
 * right-drag pans).
 */
export class MeasureInput {
  private readonly gesture = new MeasureGesture();
  private enabled = false;
  private keyWindow: Window | null = null;
  /** Where the pointer was last, unsnapped, and whether Alt freed it: a change of Alt places the end again. */
  private pointer: { world: Point; screen: Point; free: boolean } | null = null;
  /** Where the button went down, in screen pixels, while it is down for a measurement. */
  private pressedAt: Point | null = null;
  /** The click that ended a measurement, which a double click's second press follows. */
  private lastClick: { readonly at: Point; readonly time: number } | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly host: MeasureInputHost,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** A measurement is being made: a press belongs to it, wherever it lands. */
  get measuring(): boolean {
    return this.gesture.active;
  }

  /** Listens to the pointer, or stops and drops the measurement under way. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    const change = enabled ? 'on' : 'off';
    this.viewport[change]('pointerdown', this.onPointerDown);
    this.viewport[change]('pointermove', this.onPointerMove);
    this.viewport[change]('pointerup', this.onPointerUp);
    this.viewport[change]('pointerupoutside', this.onPointerUp);
    this.viewport[change]('pointercancel', this.onPointerCancel);
    if (!enabled) this.cancel();
  }

  /** Drops the measurement under way, if there is one. */
  cancel(): void {
    this.apply(this.gesture.cancel(), false);
  }

  destroy(): void {
    this.setEnabled(false);
    this.releaseKeys();
  }

  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    // Any other button is the viewport's, and a kept measurement's handle, a pin, door badge or light marker may have taken the press.
    if (e.button !== 0 || isHandled(e)) return;
    const world = this.viewport.toWorld(e.global);
    const screen = { x: e.global.x, y: e.global.y };
    if (this.gesture.active) {
      e.stopPropagation();
      this.pressedAt = screen;
      this.remember(world, screen, altHeld(e));
      this.apply(this.gesture.press(this.host.point(world, altHeld(e)), screen), shiftHeld(e));
      return;
    }
    if (this.followsLastClick(screen) || this.host.takePress(world)) {
      e.stopPropagation();
      return;
    }
    const shape = this.host.shape();
    if (!shape) return;
    e.stopPropagation();
    const start = this.host.point(world, altHeld(e));
    this.host.started({ x: world.x, y: world.y }, start);
    this.pressedAt = screen;
    this.remember(world, screen, altHeld(e));
    this.apply(this.gesture.begin(shape, start, screen), shiftHeld(e));
  };

  private readonly onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.gesture.active) return;
    e.stopPropagation();
    const world = this.viewport.toWorld(e.global);
    const screen = { x: e.global.x, y: e.global.y };
    this.remember(world, screen, altHeld(e));
    this.apply(this.gesture.move(this.host.point(world, altHeld(e)), screen), shiftHeld(e));
  };

  /** Never asked which button: a browser tells of a release only with the last button, whichever it is. */
  private readonly onPointerUp = (e: FederatedPointerEvent): void => {
    if (!this.gesture.active) return;
    const result = this.gesture.release(this.host.point(this.viewport.toWorld(e.global), altHeld(e)));
    if (result.kind === 'none') return;
    e.stopPropagation();
    const pressed = this.pressedAt;
    this.pressedAt = null;
    // A measurement ended by a click may be followed by the second click of a double click.
    const clicked = result.kind !== 'live' && pressed !== null && Math.hypot(e.global.x - pressed.x, e.global.y - pressed.y) <= MEASURE_DRAG_THRESHOLD;
    this.lastClick = clicked ? { at: pressed, time: this.now() } : null;
    this.apply(result, shiftHeld(e));
  };

  /** The browser took the pointer away (a touch that became a system gesture): its measurement is dropped. */
  private readonly onPointerCancel = (): void => this.cancel();

  /** The keys of a measurement under way, taken before the map's hotkeys see them. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.gesture.active || isTextEntryTarget(event.target)) return;
    if (event.key === 'Alt') {
      this.replace(true);
      return;
    }
    const act = this.keyAction(event.key);
    if (!act) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) this.apply(act(), event.shiftKey);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Alt' && this.gesture.active) this.replace(false);
  };

  private keyAction(key: string): (() => GestureResult) | null {
    switch (key) {
      case ' ': return () => this.gesture.corner();
      case 'Backspace': return () => this.gesture.back();
      case 'Enter': return () => this.gesture.finish();
      case 'Escape': return () => this.gesture.cancel();
      default: return null;
    }
  }

  /** Alt went down or up while the pointer rested: the end is placed again, freely or snapped. */
  private replace(free: boolean): void {
    const pointer = this.pointer;
    if (!pointer || pointer.free === free) return;
    pointer.free = free;
    this.apply(this.gesture.move(this.host.point(pointer.world, free), pointer.screen), false);
  }

  private remember(world: Point, screen: Point, free: boolean): void {
    this.pointer = { world: { x: world.x, y: world.y }, screen, free };
  }

  private followsLastClick(screen: Point): boolean {
    const last = this.lastClick;
    this.lastClick = null;
    return last !== null && this.now() - last.time <= DOUBLE_CLICK_MS && Math.hypot(screen.x - last.at.x, screen.y - last.at.y) <= MEASURE_DRAG_THRESHOLD;
  }

  private apply(result: GestureResult, shift: boolean): void {
    if (result.kind === 'none') return;
    if (this.gesture.active) this.holdKeys();
    else this.releaseKeys();
    const live = this.gesture.measurement;
    if (result.kind === 'live') {
      if (live) this.host.changed(live);
    } else {
      this.pointer = null;
      this.pressedAt = null;
      if (result.kind === 'finish') this.host.finished(result.measurement, shift);
      else this.host.cancelled();
    }
  }

  private holdKeys(): void {
    if (this.keyWindow) return;
    this.keyWindow = activeWindow;
    this.keyWindow.addEventListener('keydown', this.onKeyDown, true);
    this.keyWindow.addEventListener('keyup', this.onKeyUp, true);
  }

  private releaseKeys(): void {
    this.keyWindow?.removeEventListener('keydown', this.onKeyDown, true);
    this.keyWindow?.removeEventListener('keyup', this.onKeyUp, true);
    this.keyWindow = null;
  }
}
