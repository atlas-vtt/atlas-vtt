import type { Ticker } from 'pixi.js';

/** A window without a display frame for this long is hidden: its animation frames sleep, and so do the tickers they drive. */
export const WINDOW_ASLEEP_AFTER_MS = 250;

/**
 * Runs tickers on the display frames of another window while their own window is hidden.
 *
 * A ticker steps on its window's animation frames, which stop while the window is hidden (a
 * player window in front of the DM's on one screen, in full screen or the DM's minimised). What
 * moves by itself on the DM's map (liquids, flickering lights, tesserae arriving for the players'
 * frame) would stand still in the player window, which renders from the DM's stage. A ticker is
 * run here once it has not stepped for `WINDOW_ASLEEP_AFTER_MS`, and on every frame after, until
 * its own window steps it again. A stopped ticker (a load holding the last frame) is left alone.
 */
export class TickerRelay {
  /** The time each ticker was last stepped at here: while it still is its last, nothing else stepped it. */
  private readonly relayedAt = new WeakMap<Ticker, number>();

  constructor(private readonly tickers: readonly Ticker[]) {}

  /** Run on a display frame of the window that is seen, at `time` on the tickers' clock (ms). */
  frame(time: number): void {
    for (const ticker of this.tickers) {
      if (!ticker.started) continue;
      const asleep = this.relayedAt.get(ticker) === ticker.lastTime || time - ticker.lastTime > WINDOW_ASLEEP_AFTER_MS;
      if (!asleep) continue;
      ticker.update(time);
      this.relayedAt.set(ticker, ticker.lastTime);
    }
  }
}
