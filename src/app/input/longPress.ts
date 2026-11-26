import { FINGER_SLOP_PX } from '../pixi/utils/pointerReach';

/**
 * The long press of a finger: the secondary click of a device without a right button. One timing
 * and one tolerance for the map and for everything else Atlas draws.
 */

/** How long a finger rests before its press is a long press, between the defaults of iPadOS and Android. */
export const LONG_PRESS_MS = 400;
/** How far a finger may wander and still rest (px); past it the press is a drag: the threshold every drag on the map has for a finger. */
export const TOUCH_SLOP_PX = FINGER_SLOP_PX;

/** How long a long press is felt, where the device can (Android; iOS has no vibration for the web). */
const HAPTIC_MS = 10;

/** Marks the moment a long press does what it is for, in the hand. */
export function feelLongPress(win: Window): void {
  if ('vibrate' in win.navigator) win.navigator.vibrate(HAPTIC_MS);
}

export interface PressPoint {
  x: number;
  y: number;
}

/** The timers a long press runs on; a test hands in its own. */
export interface PressClock {
  setTimeout(run: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export function movedPast(from: PressPoint, to: PressPoint, slop: number = TOUCH_SLOP_PX): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= slop;
}

/**
 * Watches one press: `fire` runs once the finger has rested `ms` (`LONG_PRESS_MS`) within `TOUCH_SLOP_PX`
 * of where it came down. A move past that, a release, a second finger or anything else that ends
 * the press (`cancel`) leaves it a tap or a drag, and `fire` never runs.
 *
 * A timer says how long the thread has been free to run it, not how long the finger was down: after
 * a frame that held the thread up, the time may be over while the release of a tap still waits to
 * be heard. So the press is asked once more, one turn of the event loop after its time: a release
 * that waited is heard in between, and ends it.
 */
export class LongPress {
  private timer: number | null = null;
  private origin: PressPoint | null = null;

  constructor(private readonly clock: PressClock, private readonly fire: (at: PressPoint) => void, private readonly ms: number = LONG_PRESS_MS) {}

  /** The press is still one that may become a long press. */
  get pending(): boolean {
    return this.timer !== null;
  }

  begin(at: PressPoint): void {
    this.cancel();
    const origin = { x: at.x, y: at.y };
    this.origin = origin;
    this.timer = this.clock.setTimeout(() => {
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        this.origin = null;
        this.fire(origin);
      }, 0);
    }, this.ms);
  }

  /** The finger is at `at`; returns whether the press still rests. */
  move(at: PressPoint): boolean {
    if (!this.origin) return false;
    if (movedPast(this.origin, at)) this.cancel();
    return this.pending;
  }

  cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.origin = null;
  }
}
