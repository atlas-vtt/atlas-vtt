import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ViewAtlasStore } from '../../storeFactory';
import type { TimerWidget } from '../../types/widgetTypes';
import { isTimerExpired, msUntilNextSecond, timerAt, timerDeadline, timerRun, timerShownSeconds } from '../../utils/timerWidget';
import { useStableCallback } from './useStableCallback';

/**
 * How often a running timer writes the seconds it has left, so an older Atlas
 * that loads the scene (and knows no run) shows a recent time. A write saves the
 * scene file, so it is rare.
 */
export const TIMER_CHECKPOINT_MS = 60_000;

/**
 * The seconds a timer shows, counted from the wall clock: a hidden window delays
 * the ticks but never slows the timer, since each tick only reads the time.
 * When the timer runs out it is stopped at 0 and `onExpire` is called, once for
 * all views of it (the first to notice stops it, the others then see it stopped),
 * and only for a countdown this view saw running: a timer that ran out while no
 * view showed it (Obsidian closed, the scene not open) is stopped quietly.
 */
export function useTimerClock(
  store: ViewAtlasStore,
  widget: TimerWidget,
  elementRef: RefObject<HTMLElement | null>,
  onExpire: () => void,
): number {
  const [now, setNow] = useState(Date.now);
  /** When the countdown this view last saw running ends; checkpoints keep it. */
  const seenDeadline = useRef<number | null>(null);
  const expire = useStableCallback(onExpire);
  const run = timerRun(widget);
  const running = run !== undefined;
  const widgetId = widget.id;

  useEffect(() => {
    if (!running) return undefined;
    let timeout: number | undefined;
    // Each tick reads the run from the store, so checkpoints and edits in other views never stop the clock.
    const tick = (): void => {
      window.clearTimeout(timeout);
      const state = store.getState();
      const current = state.widgetSettings.widgets[widgetId];
      if (current?.type !== 'timer') return;
      const currentRun = timerRun(current);
      if (!currentRun) return;
      const time = Date.now();
      // A load rewrites the widgets in steps; only the loaded scene is written to.
      if (!state.isMapLoading) {
        if (isTimerExpired(current, time)) {
          state.setTimerState(widgetId, timerAt(current, time));
          const seen = seenDeadline.current;
          if (seen !== null && Math.abs(seen - timerDeadline(currentRun)) < 1) expire();
          return;
        }
        seenDeadline.current = timerDeadline(currentRun);
        if (time - currentRun.since >= TIMER_CHECKPOINT_MS) state.setTimerState(widgetId, timerAt(current, time, true));
      }
      setNow(time);
      timeout = window.setTimeout(tick, msUntilNextSecond(current, time));
    };
    const doc = elementRef.current?.doc ?? activeDocument;
    const onVisible = (): void => { if (doc.visibilityState === 'visible') tick(); };
    doc.addEventListener('visibilitychange', onVisible);
    tick();
    return () => {
      window.clearTimeout(timeout);
      doc.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, store, widgetId, elementRef, expire]);

  return timerShownSeconds(widget, run ? Math.max(now, run.since) : now);
}
