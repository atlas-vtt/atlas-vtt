import { afterEach, describe, expect, it, vi } from 'vitest';
import { every, WorkerTimers, type TimerWorker } from '../../../../src/app/online/gm/companionTimers.ts';

/** A worker that holds what it was asked and fires a timer when the test says so. */
function fakeWorker(): { readonly factory: (fire: (id: number) => void) => TimerWorker; readonly set: Map<number, number>; fire(id: number): void; terminated(): boolean; posts: number } {
  let fire: (id: number) => void = () => undefined;
  let terminated = false;
  const state = {
    set: new Map<number, number>(),
    posts: 0,
    fire: (id: number): void => {
      state.set.delete(id);
      fire(id);
    },
    terminated: (): boolean => terminated,
    factory: (onFire: (id: number) => void): TimerWorker => {
      fire = onFire;
      return {
        post: (request) => {
          state.posts += 1;
          if (request.ms === undefined) state.set.delete(request.id);
          else state.set.set(request.id, request.ms);
        },
        terminate: () => {
          terminated = true;
        },
      };
    },
  };
  return state;
}

describe('the companion timers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('set their timers in the worker and run each once when it fires', () => {
    const worker = fakeWorker();
    const timers = new WorkerTimers(worker.factory);
    const run = vi.fn();
    const id = timers.setTimer(run, 20);
    expect(worker.set.get(id)).toBe(20);
    worker.fire(id);
    worker.fire(id);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never run a cleared timer, and clear it in the worker', () => {
    const worker = fakeWorker();
    const timers = new WorkerTimers(worker.factory);
    const run = vi.fn();
    const id = timers.setTimer(run, 1000);
    timers.clearTimer(id);
    expect(worker.set.has(id)).toBe(false);
    worker.fire(id);
    expect(run).not.toHaveBeenCalled();
  });

  it('stop the worker when disposed: nothing set runs and nothing new is set', () => {
    const worker = fakeWorker();
    const timers = new WorkerTimers(worker.factory);
    const run = vi.fn();
    const id = timers.setTimer(run, 10);
    timers.dispose();
    expect(worker.terminated()).toBe(true);
    worker.fire(id);
    const posts = worker.posts;
    expect(timers.setTimer(run, 10)).toBe(0);
    expect(worker.posts).toBe(posts);
    expect(run).not.toHaveBeenCalled();
  });

  it('fall back to the window timers where no worker can run', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const timers = new WorkerTimers(() => null);
    const run = vi.fn();
    const cleared = vi.fn();
    timers.setTimer(run, 50);
    timers.clearTimer(timers.setTimer(cleared, 50));
    vi.advanceTimersByTime(50);
    expect(run).toHaveBeenCalledTimes(1);
    expect(cleared).not.toHaveBeenCalled();
  });

  it('repeat `every` until it is stopped, also from within its own run', () => {
    const worker = fakeWorker();
    const timers = new WorkerTimers(worker.factory);
    let runs = 0;
    const stop = every(timers, 100, () => {
      runs += 1;
      if (runs === 3) stop();
    });
    for (let step = 0; step < 5; step += 1) {
      const [id] = [...worker.set.keys()];
      if (id !== undefined) worker.fire(id);
    }
    expect(runs).toBe(3);
    expect(worker.set.size).toBe(0);
  });
});
