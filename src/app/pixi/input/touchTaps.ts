import type { GestureClock, GestureEffects } from './gestureTypes';

/** The longest a tap of several fingers lasts, from the first finger down to the last one up. */
export const MULTI_TAP_MS = 300;
/** How soon and how close a second tap follows the first to be a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 40;

/**
 * The taps that are gestures of their own: a double tap on the empty map zooms in, a tap of two
 * fingers takes the last step back, twice in a row it zooms out, and a tap of three fingers
 * takes the step forward again. A two-finger tap waits for its second before it is an undo.
 */
export class TouchTaps {
  private lastTapAt = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;
  private undoTimer: number | null = null;

  constructor(private readonly clock: GestureClock, private readonly effects: Pick<GestureEffects, 'zoomStep' | 'undo' | 'redo'>) {}

  /** One finger tapped the empty map at a point. */
  emptyMapTap(x: number, y: number): void {
    const now = this.clock.now();
    const second = now - this.lastTapAt <= DOUBLE_TAP_MS && Math.hypot(x - this.lastTapX, y - this.lastTapY) <= DOUBLE_TAP_PX;
    if (second) {
      this.lastTapAt = -Infinity;
      this.effects.zoomStep(x, y, 1);
      return;
    }
    this.lastTapAt = now;
    this.lastTapX = x;
    this.lastTapY = y;
  }

  /** A finger did something that is no tap: the next tap is a first one. */
  forgetTap(): void {
    this.lastTapAt = -Infinity;
  }

  /** `fingers` came down and lifted together without moving, about a point. */
  multiTap(fingers: number, x: number, y: number): void {
    if (fingers === 3) {
      this.cancelUndo();
      this.effects.redo();
    } else if (fingers === 2) {
      if (this.cancelUndo()) this.effects.zoomStep(x, y, -1);
      else this.undoTimer = this.clock.setTimeout(() => {
        this.undoTimer = null;
        this.effects.undo();
      }, DOUBLE_TAP_MS);
    }
  }

  /** Drops what waits; returns whether an undo did. */
  private cancelUndo(): boolean {
    if (this.undoTimer === null) return false;
    this.clock.clearTimeout(this.undoTimer);
    this.undoTimer = null;
    return true;
  }

  destroy(): void {
    this.cancelUndo();
  }
}
