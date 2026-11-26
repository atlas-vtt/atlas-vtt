import type { PacerClock } from '../../../../src/app/online/marks/index.ts';

/** A clock and its timers for a feed under test: time moves only by `advance`, which runs the timers that fall due in order. */
export interface FeedClock extends PacerClock {
  advance(ms: number): void;
}

export function feedClock(): FeedClock {
  let now = 0;
  let ids = 0;
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  return {
    now: () => now,
    setTimer: (run, ms) => {
      ids += 1;
      timers.set(ids, { at: now + ms, run });
      return ids;
    },
    clearTimer: (timer) => void timers.delete(timer),
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
      }
      now = end;
    },
  };
}
