import type { Ticker } from 'pixi.js';

/** What the pump reads and steps of a PIXI ticker. */
export type PumpedTicker = Pick<Ticker, 'started' | 'lastTime' | 'update'>;

/**
 * Steps `tickers` with the frames of `win` while their own loop stands still. PIXI's tickers ask
 * the main window for frames (`requestAnimationFrame` of `globalThis`), and a main window that a
 * popout covers is hidden and gets none: the map in a maximised popout stopped drawing.
 *
 * A ticker is stepped only when nothing else stepped it since the pump's previous frame, so while
 * the main window draws, its loop alone runs them, and a ticker that several popouts pump (the
 * shared one) is stepped once a frame. Times are this window's `performance.now()`, the clock the
 * tickers keep.
 *
 * @returns Stops the pump.
 */
export function pumpTickers(win: Window, tickers: readonly PumpedTicker[]): () => void {
  let previous = performance.now();
  let frame = 0;
  const step = (): void => {
    frame = win.requestAnimationFrame(step);
    previous = stepStalledTickers(tickers, previous, performance.now());
  };
  frame = win.requestAnimationFrame(step);
  return (): void => win.cancelAnimationFrame(frame);
}

/**
 * Steps every started ticker that has not run since `previous`, the time of the pump's last frame,
 * to `now`. Returns `now`, the next frame's `previous`.
 */
export function stepStalledTickers(tickers: readonly PumpedTicker[], previous: number, now: number): number {
  for (const ticker of tickers) {
    if (ticker.started && ticker.lastTime <= previous) ticker.update(now);
  }
  return now;
}
