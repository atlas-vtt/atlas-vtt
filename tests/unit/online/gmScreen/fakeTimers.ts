import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';

/** The companion's timers under the test's hand. */
export function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let ids = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  return {
    now: () => now,
    setTimer: (run, ms) => (timers.push({ at: now + ms, run, id: (ids += 1) }), ids),
    clearTimer: (id) => void (timers = timers.filter((timer) => timer.id !== id)),
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (next === undefined) break;
        now = next.at;
        timers = timers.filter((timer) => timer !== next);
        next.run();
      }
      now = end;
    },
  };
}
