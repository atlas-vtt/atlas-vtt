// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIT_WAIT_MS, waitBeforeQuit } from '../../src/app/utils/quitTasks';
import { follow, QuitTasks, restOfTheTask } from '../helpers/obsidianQuit';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** What Obsidian waits for before it closes the window, given `work` as Atlas' one task. */
function waitedFor(work: Promise<unknown>): ReturnType<typeof follow> {
  const tasks = new QuitTasks();
  waitBeforeQuit(tasks, work, 'Saving');
  return follow(tasks.promise());
}

describe('what Obsidian waits for before it quits', () => {
  // Obsidian closes the window the moment its tasks are done, and a close asked for while
  // `beforeunload` is still being handled is ignored: the window then stays until it is destroyed.
  it('is never done within the quit event\'s own task, whatever the work', async () => {
    const waited = waitedFor(Promise.resolve());

    await restOfTheTask();
    expect(waited.outcome()).toBe('pending');

    await vi.advanceTimersByTimeAsync(0);
    expect(waited.outcome()).toBe('done');
  });

  it('is done as soon as the work is', async () => {
    let finish: () => void = () => undefined;
    const waited = waitedFor(new Promise<void>((resolve) => { finish = resolve; }));

    await vi.advanceTimersByTimeAsync(500);
    expect(waited.outcome()).toBe('pending');

    finish();
    await restOfTheTask();
    expect(waited.outcome()).toBe('done');
  });

  it('is done after the longest wait when the work never ends', async () => {
    const waited = waitedFor(new Promise<void>(() => undefined));

    await vi.advanceTimersByTimeAsync(QUIT_WAIT_MS - 1);
    expect(waited.outcome()).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(waited.outcome()).toBe('done');
  });

  it('is done, never rejected, when the work fails, and the failure is logged', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('The note is gone.');
    const waited = waitedFor(Promise.reject(failure));

    await vi.advanceTimersByTimeAsync(0);

    expect(waited.outcome()).toBe('done');
    expect(logged).toHaveBeenCalledWith('[Atlas] Saving before quitting failed:', failure);
  });
});
