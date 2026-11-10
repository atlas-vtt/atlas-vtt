/** What a notched mouse wheel reports per notch in the legacy `wheelDelta`, whatever pixels it scrolls. */
const NOTCH_WHEEL_DELTA = 120;
/** What a precise device (a trackpad) reports in `wheelDelta`: three times its pixels, never a notch. */
const PRECISE_WHEEL_DELTA_PER_PIXEL = 3;
/** Wheel events further apart than this, in ms, belong to separate scrolls. */
const SCROLL_GAP_MS = 100;
/** How far one continuous scroll (a trackpad glide, a smoothed wheel) goes for each further step. */
const GLIDE_STEP = 100;

type WheelInput = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>;

/**
 * Turns wheel events into whole steps, one per notch of a mouse wheel: Chromium on macOS reports a
 * notch as a few pixels, but as 120 in the legacy `wheelDelta`, and a wheel in lines (Firefox) says
 * so in `deltaMode`. Everything else (a trackpad, a wheel its driver smooths into many small
 * events) steps once when a scroll begins and again for every `GLIDE_STEP` pixels it goes on. A
 * mouse wheel turned with Shift held scrolls sideways on macOS, so the larger axis counts; down and
 * right step forward.
 */
export class WheelSteps {
  private rest = 0;
  private direction = 0;
  private lastAt = -Infinity;

  take(event: WheelInput, now: number = performance.now()): number {
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return 0;
    const direction = Math.sign(delta);
    const scrollGoesOn = now - this.lastAt <= SCROLL_GAP_MS && direction === this.direction;
    this.lastAt = now;
    this.direction = direction;
    if (event.deltaMode !== 0 || isNotch(event, delta) || !scrollGoesOn) {
      this.rest = 0;
      return direction;
    }
    this.rest += Math.abs(delta);
    if (this.rest < GLIDE_STEP) return 0;
    this.rest -= GLIDE_STEP;
    return direction;
  }
}

/**
 * Whether the event is whole notches of a mouse wheel, by the legacy `wheelDelta` Chromium still
 * sends: a multiple of 120 that is not merely three times the pixels a trackpad scrolled.
 */
function isNotch(event: WheelInput, delta: number): boolean {
  const legacy = 'wheelDeltaY' in event && 'wheelDeltaX' in event ? [event.wheelDeltaY, event.wheelDeltaX] : [];
  return legacy.some((value) => typeof value === 'number' && value !== 0 && value % NOTCH_WHEEL_DELTA === 0
    && Math.abs(Math.abs(value) - PRECISE_WHEEL_DELTA_PER_PIXEL * Math.abs(delta)) > 0.5);
}
