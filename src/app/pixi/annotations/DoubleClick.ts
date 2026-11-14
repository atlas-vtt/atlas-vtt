import type { Point } from '../../types/visionTypes';

/** A second press this soon after the first, in the same place, is a double click. */
const DOUBLE_CLICK_MS = 500;
/** Screen pixels the second press may land from the first. */
const DOUBLE_CLICK_SLACK = 6;

/**
 * Tells the second press of a double click on one thing. The canvas's own `dblclick` says neither
 * what was pressed nor whether the first press already changed it, so presses are counted here.
 */
export class DoubleClick {
  private last: { readonly on: string; readonly at: Point; readonly time: number } | null = null;

  /** `now` is the clock, in milliseconds. */
  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Whether a press on `on` at the screen point `at` is the second of a double click; remembers it for the next where it is not. */
  pressed(on: string, at: Point): boolean {
    const last = this.last;
    const time = this.now();
    const second = last !== null && last.on === on && time - last.time <= DOUBLE_CLICK_MS && Math.hypot(at.x - last.at.x, at.y - last.at.y) <= DOUBLE_CLICK_SLACK;
    this.last = second ? null : { on, at: { x: at.x, y: at.y }, time };
    return second;
  }
}
