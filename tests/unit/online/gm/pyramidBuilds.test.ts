import { describe, expect, it } from 'vitest';
import type { MapStanding } from '../../../../src/app/online/gm/assets/assetUses.ts';
import type { LivePyramid } from '../../../../src/app/online/gm/assets/livePyramid.ts';
import { MAX_BUILD_TRIES, PyramidBuilds, type BuiltPyramid } from '../../../../src/app/online/gm/assets/pyramidBuilds.ts';
import { settled } from './settled.ts';

/** Timers moved by hand. */
function clock(): { now: () => number; setTimer: (run: () => void, ms: number) => number; clearTimer: (id: number) => void; advance: (ms: number) => Promise<void> } {
  let now = 0;
  let ids = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => now,
    setTimer: (run, ms) => (timers.set((ids += 1), { at: now + ms, run }), ids),
    clearTimer: (id) => void timers.delete(id),
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
        await settled();
      }
      now = end;
      await settled();
    },
  };
}

/** A pyramid as the builds see it: its path, hash and standing, and whether it was given up. */
function pyramid(path: string, standing: MapStanding): LivePyramid & { failures: number } {
  const fake = { path, hash: `${path}-hash`, standing, failures: 0, fail: () => void (fake.failures += 1) };
  return fake as unknown as LivePyramid & { failures: number };
}

describe('the builds of pyramids on their way into the store', () => {
  it('never give a pyramid up while its builds keep storing tiles, however often they give way', async () => {
    const timers = clock();
    let stored = 0;
    const builds = new PyramidBuilds({ build: (): Promise<BuiltPyramid> => Promise.resolve({ hash: 'maps/a.png-hash', complete: false, stored: (stored += 10) }), timers });
    const map = pyramid('maps/a.png', 'presented');
    builds.want(map);
    for (let n = 0; n < 4 * MAX_BUILD_TRIES; n += 1) await timers.advance(2000);
    expect(stored).toBeGreaterThan(MAX_BUILD_TRIES * 10);
    expect(map.failures).toBe(0);
  });

  it('give a pyramid up once its builds store nothing more, try after try', async () => {
    const timers = clock();
    let asked = 0;
    const builds = new PyramidBuilds({ build: (): Promise<BuiltPyramid> => Promise.resolve({ hash: 'maps/a.png-hash', complete: false, stored: (asked += 1) > 0 ? 5 : 0 }), timers });
    const map = pyramid('maps/a.png', 'presented');
    builds.want(map);
    for (let n = 0; n < 60; n += 1) await timers.advance(10_000);
    expect(map.failures).toBe(1);
    expect(asked).toBe(MAX_BUILD_TRIES);
  });

  it('build one map players look at at a time, the presented floor first', async () => {
    const timers = clock();
    const asked: string[] = [];
    const ends = new Map<string, (built: BuiltPyramid) => void>();
    const builds = new PyramidBuilds({ build: (path) => (asked.push(path), new Promise((resolve) => ends.set(path, resolve))), timers });
    builds.want(pyramid('maps/cellar.png', 'watched'));
    expect(asked).toEqual(['maps/cellar.png']);
    builds.want(pyramid('maps/ground.png', 'presented'));
    builds.want(pyramid('maps/vault.png', 'watched'));
    expect(asked).toEqual(['maps/cellar.png']);
    ends.get('maps/cellar.png')?.({ hash: 'maps/cellar.png-hash', complete: true, stored: 33 });
    await timers.advance(10);
    expect(asked).toEqual(['maps/cellar.png', 'maps/ground.png']);
  });
});
