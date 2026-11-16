// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExploredSaveScheduler } from '../ExploredSaveScheduler';

describe('ExploredSaveScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(): { scheduler: ExploredSaveScheduler; save: ReturnType<typeof vi.fn>; scene: { path: string | null } } {
    const scene = { path: 'a.atlasmap' as string | null };
    const save = vi.fn();
    return { scheduler: new ExploredSaveScheduler(() => scene.path, save, 2000), save, scene };
  }

  it('saves once after the delay, however often it is scheduled', () => {
    const { scheduler, save } = setup();
    scheduler.schedule();
    scheduler.schedule();
    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('drops a save whose scene was switched away before it fired', () => {
    const { scheduler, save, scene } = setup();
    scheduler.schedule();
    scene.path = 'b.atlasmap';
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves at once on flush, while the scene is still the one it was scheduled for', () => {
    const { scheduler, save } = setup();
    scheduler.schedule();
    scheduler.flush();
    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does nothing on flush without a pending save, or after cancel', () => {
    const { scheduler, save } = setup();
    scheduler.flush();
    scheduler.schedule();
    scheduler.cancel();
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('ExploredSaveScheduler while the memory keeps changing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits until the memory has rested, and never longer than its longest wait', () => {
    const save = vi.fn();
    let now = 0;
    const scheduler = new ExploredSaveScheduler(() => 'a.atlasmap', save, 2000, 10_000, () => now);
    // A drag: a change every 100 ms for 6 s saves nothing until it rests.
    for (let t = 0; t < 6000; t += 100) {
      now = t;
      scheduler.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(save).not.toHaveBeenCalled();
    now = 8100;
    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);
    // A drag longer than the longest wait saves once it has waited that long.
    for (let t = 9000; t < 20_000; t += 100) {
      now = t;
      scheduler.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(save).toHaveBeenCalledTimes(2);
  });
});
