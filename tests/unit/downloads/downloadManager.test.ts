// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadManager, NOTIFY_MS, overallShare } from '../../../src/app/downloads/DownloadManager';
import type { DownloadProgress, DownloadTask } from '../../../src/app/downloads/downloadTypes';

let clock = 0;
let manager: DownloadManager;

/** A task the test drives: it reports what the test says and ends when told. */
interface Driven {
  task: DownloadTask;
  runs: number;
  progress: () => DownloadProgress;
  finish: () => void;
  fail: (error: Error) => void;
}

function driven(id: string, options: Partial<DownloadTask> = {}): Driven {
  let current: DownloadProgress | null = null;
  let end: { resolve: () => void; reject: (error: Error) => void } | null = null;
  const state: Driven = {
    runs: 0,
    progress: () => {
      if (!current) throw new Error(`${id} is not running`);
      return current;
    },
    finish: () => end?.resolve(),
    fail: (error) => end?.reject(error),
    task: {
      id,
      title: id,
      origin: 'music-pack',
      estimate: { bytes: 100, files: 10 },
      run: (progress) => {
        state.runs += 1;
        current = progress;
        return new Promise<void>((resolve, reject) => { end = { resolve, reject }; });
      },
      ...options,
    },
  };
  return state;
}

/** Lets the manager's microtask announcements and the run's settling go through. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const stateOf = (id: string): string | undefined => manager.job(id)?.state;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  clock = 0;
  manager = new DownloadManager({ now: () => clock });
});

afterEach(() => {
  manager.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the download queue', () => {
  it('runs one job at a time, first come first served, and starts the next once one ends', async () => {
    const first = driven('a');
    const second = driven('b');
    manager.enqueue(first.task);
    manager.enqueue(second.task);
    await settle();
    expect([stateOf('a'), stateOf('b')]).toEqual(['downloading', 'queued']);
    expect(second.runs).toBe(0);
    first.finish();
    await settle();
    expect([stateOf('a'), stateOf('b')]).toEqual(['done', 'downloading']);
    expect(second.runs).toBe(1);
  });

  it('keeps one job per id while it is ahead, and lets a finished one make way for a new run', async () => {
    const job = driven('a');
    manager.enqueue(job.task);
    manager.enqueue(job.task);
    await settle();
    expect(manager.jobs()).toHaveLength(1);
    job.finish();
    await settle();
    manager.enqueue(job.task);
    await settle();
    expect(manager.jobs()).toHaveLength(1);
    expect(job.runs).toBe(2);
  });

  it('shows the estimate while queued, then what the task expects, and counts files and bytes as they land', async () => {
    const job = driven('a');
    manager.enqueue(job.task);
    await settle();
    expect(manager.job('a')?.total).toEqual({ bytes: 100, files: 10 });
    job.progress().expect({ bytes: 300, files: 3 });
    job.progress().fileDone(100, false);
    job.progress().fileDone(100, true);
    vi.advanceTimersByTime(NOTIFY_MS);
    expect(manager.job('a')).toMatchObject({ total: { bytes: 300, files: 3 }, done: { bytes: 200, files: 2 } });
    expect(overallShare(manager.jobs())).toBeCloseTo(2 / 3);
    job.finish();
    await settle();
    expect(manager.job('a')?.done).toEqual({ bytes: 300, files: 3 });
    expect(overallShare(manager.jobs())).toBeNull();
  });

  it('announces progress a few times a second however often files land, and a change of state at once', async () => {
    const job = driven('a');
    const heard = vi.fn();
    manager.subscribe(heard);
    manager.enqueue(job.task);
    await settle();
    const before = heard.mock.calls.length;
    for (let i = 0; i < 50; i++) job.progress().fileDone(1, true);
    expect(heard.mock.calls.length).toBe(before);
    vi.advanceTimersByTime(NOTIFY_MS);
    expect(heard.mock.calls.length).toBe(before + 1);
    manager.cancel('a');
    await settle();
    expect(heard.mock.calls.length).toBe(before + 2);
    expect(stateOf('a')).toBe('cancelled');
  });

  it('measures the speed from fetched bytes over the last seconds, and the time left from it; files already there do not count', async () => {
    const job = driven('a');
    manager.enqueue(job.task);
    await settle();
    job.progress().expect({ bytes: 10_000_000, files: 10 });
    job.progress().fileDone(4_000_000, false);
    clock = 500;
    job.progress().fileDone(1_000_000, true);
    vi.advanceTimersByTime(NOTIFY_MS);
    // Too soon to say.
    expect(manager.job('a')?.speed).toBeNull();
    clock = 2000;
    job.progress().fileDone(1_000_000, true);
    vi.advanceTimersByTime(NOTIFY_MS);
    expect(manager.job('a')?.speed).toBeCloseTo(1_000_000);
    expect(manager.job('a')?.secondsLeft).toBeCloseTo(4);
    // A stall pulls the speed down as the seconds pass without a file.
    clock = 6000;
    vi.advanceTimersByTime(1000);
    expect(manager.job('a')?.speed).toBeCloseTo(2_000_000 / 6);
  });

  it('cancels a running job at once, ignores what its run still reports, and starts the next only once that run settled', async () => {
    const first = driven('a');
    const second = driven('b');
    manager.enqueue(first.task);
    manager.enqueue(second.task);
    await settle();
    const progress = first.progress();
    manager.cancel('a');
    await settle();
    expect(stateOf('a')).toBe('cancelled');
    expect(progress.signal.aborted).toBe(true);
    progress.fileDone(50, true);
    vi.advanceTimersByTime(NOTIFY_MS);
    expect(manager.job('a')?.done.bytes).toBe(0);
    expect(second.runs).toBe(0);
    first.fail(new DOMException('aborted', 'AbortError'));
    await settle();
    expect(stateOf('a')).toBe('cancelled');
    expect(stateOf('b')).toBe('downloading');
  });

  it('cancels a queued job without running it', async () => {
    const first = driven('a');
    const second = driven('b');
    manager.enqueue(first.task);
    manager.enqueue(second.task);
    manager.cancel('b');
    first.finish();
    await settle();
    expect(stateOf('b')).toBe('cancelled');
    expect(second.runs).toBe(0);
  });

  it('says why a job failed in its own words, and runs it again on Retry, at the end of the queue', async () => {
    const job = driven('a', { explain: () => 'No connection' });
    manager.enqueue(job.task);
    await settle();
    job.fail(new Error('net::ERR_INTERNET_DISCONNECTED'));
    await settle();
    expect(manager.job('a')).toMatchObject({ state: 'failed', failure: 'No connection' });
    manager.retry('a');
    await settle();
    expect(manager.job('a')).toMatchObject({ state: 'downloading', failure: null, done: { bytes: 0, files: 0 } });
    expect(job.runs).toBe(2);
  });

  it('clears finished jobs and keeps those still ahead', async () => {
    const done = driven('a');
    const failed = driven('b');
    const waiting = driven('c');
    manager.enqueue(done.task);
    manager.enqueue(failed.task);
    manager.enqueue(waiting.task);
    await settle();
    done.finish();
    await settle();
    failed.fail(new Error('x'));
    await settle();
    manager.clearFinished();
    await settle();
    expect(manager.jobs().map((job) => job.id)).toEqual(['c']);
  });

  it('runs onDone once after a whole run, and reveals only what is done', async () => {
    const onDone = vi.fn();
    const reveal = vi.fn();
    const job = driven('a', { onDone, reveal });
    manager.enqueue(job.task);
    await settle();
    manager.reveal('a');
    expect(reveal).not.toHaveBeenCalled();
    job.finish();
    await settle();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(manager.job('a')?.canReveal).toBe(true);
    manager.reveal('a');
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
