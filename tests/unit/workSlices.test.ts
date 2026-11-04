// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workSlices, WORK_SLICE_MS } from '../../src/app/utils/workSlices';

/** A clock that moves only when the test says so. */
function fakeClock(): { advance: (ms: number) => void } {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return { advance: (ms) => { now += ms; } };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('workSlices', () => {
  it('lets the job run on while its slice has time left', () => {
    const clock = fakeClock();
    const pause = workSlices();
    clock.advance(WORK_SLICE_MS - 1);
    expect(pause()).toBeUndefined();
  });

  it('gives the browser a turn once a slice is used up, then starts a new one', async () => {
    const clock = fakeClock();
    const pause = workSlices();
    let browserHadATurn = false;
    setTimeout(() => { browserHadATurn = true; }, 0);

    clock.advance(WORK_SLICE_MS);
    await pause();

    expect(browserHadATurn).toBe(true);
    expect(pause()).toBeUndefined();
  });

  it('keeps a loop over work that is already done from running in one go', async () => {
    const clock = fakeClock();
    const pause = workSlices();
    let turns = 0;
    const timer = setInterval(() => { turns += 1; }, 0);

    for (let unit = 0; unit < 40; unit++) {
      await Promise.resolve();
      clock.advance(1);
      await pause();
    }
    clearInterval(timer);

    // 40 ms of work in slices of 8 ms: the browser had its turn between them.
    expect(turns).toBeGreaterThanOrEqual(4);
  });
});
