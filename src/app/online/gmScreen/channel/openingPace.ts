/** The clock and timers Atlas's end of a channel paces its openings with: handed in, never a global. */
export interface ChannelTimers {
  now(): number;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/** How often one opening goes to the device unanswered: once, then again after 1, 2, 4 and 8 seconds. */
export const OPENING_SENDS = 5;
export const RESEND_MS = 1000;

/** Openings a run may send at once; after them the wait starts at a second and doubles up to a minute. */
const FREE_OPENINGS = 2;
const STEP_MS = 1000;
const MOST_MS = 60_000;
/** A run ends once no opening went for this long, so a device that keeps asking stays at a minute's pace. */
const RUN_ENDS_MS = 2 * MOST_MS;

/**
 * When Atlas may send the next opening that nobody but the channel asked for: one sent again while no
 * answer comes, or a new exchange the device's end called for (an ask, or a frame that does not open
 * here). However often a broken or hostile device calls, and however long it stays silent, Atlas sends
 * no more openings than this pace lets through.
 */
export class OpeningPace {
  private run = 0;
  private last = -Infinity;

  /** The earliest time the next opening may go. */
  next(now: number): number {
    const run = now - this.last >= RUN_ENDS_MS ? 0 : this.run;
    if (run < FREE_OPENINGS) return now;
    return Math.max(now, this.last + Math.min(STEP_MS * 2 ** (run - FREE_OPENINGS), MOST_MS));
  }

  /** An opening the channel sent of its own accord went at `now`: one sent again because no answer came, or one the device's frames called for. */
  sent(now: number): void {
    if (now - this.last >= RUN_ENDS_MS) this.run = 0;
    this.run += 1;
    this.last = now;
  }
}
