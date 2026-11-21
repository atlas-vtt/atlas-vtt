import type { App } from 'obsidian';
import { t } from '../i18n';
import { SpeedMeter } from './speedMeter';
import { isActive, type DownloadAmount, type DownloadJob, type DownloadProgress, type DownloadState, type DownloadTask } from './downloadTypes';

/** Progress is announced at most this often: a download must not re-render anything many times a second. */
export const NOTIFY_MS = 250;
/** While a job downloads with no file landing, speed and time left are refreshed this often, so a stall shows. */
const IDLE_REFRESH_MS = 1000;

interface Entry {
  task: DownloadTask;
  state: DownloadState;
  done: DownloadAmount;
  total: DownloadAmount;
  fetched: number;
  meter: SpeedMeter | null;
  controller: AbortController;
  failure: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface DownloadManagerDeps {
  now?: () => number;
}

/** The share of the bytes of every job still ahead that has come: what the downloads button's ring shows. */
export function overallShare(jobs: readonly DownloadJob[]): number | null {
  const active = jobs.filter(isActive);
  const total = active.reduce((sum, job) => sum + job.total.bytes, 0);
  if (active.length === 0 || total <= 0) return active.length > 0 ? 0 : null;
  return Math.min(1, active.reduce((sum, job) => sum + job.done.bytes, 0) / total);
}

/**
 * Downloads of content the plugin brings in from its hosts, one per app, released on unload. It knows nothing of
 * what a job fetches or where it puts it: a job is a task that reports files and honours a cancel.
 *
 * One job runs at a time, first come first served. Each job already fetches several files at once, which fills the
 * line; two jobs would share it, so both would finish later, and neither's time left would mean anything.
 *
 * Cancel cannot stop a request on its way (`requestUrl` has no abort): the task starts no new file and drops what
 * arrives unwritten, and whatever is whole on disk stays, so a later run goes on from there. The next job waits for
 * the cancelled run to settle, so two runs never write at once.
 */
export class DownloadManager {
  private static readonly instances = new WeakMap<App, DownloadManager>();

  static forApp(app: App): DownloadManager {
    let manager = DownloadManager.instances.get(app);
    if (!manager) {
      manager = new DownloadManager();
      DownloadManager.instances.set(app, manager);
    }
    return manager;
  }

  static release(app: App): void {
    DownloadManager.instances.get(app)?.destroy();
    DownloadManager.instances.delete(app);
  }

  private readonly now: () => number;
  private entries: Entry[] = [];
  private snapshot: readonly DownloadJob[] = [];
  private readonly listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private timer: number | null = null;
  /** Whether the pending timer is only the stall refresh, which progress may bring forward. */
  private timerIdle = false;
  private flushQueued = false;
  private destroyed = false;

  constructor({ now = () => Date.now() }: DownloadManagerDeps = {}) {
    this.now = now;
  }

  /** Every job, oldest first; the same array until the next announcement. Bound, for `useSyncExternalStore`. */
  readonly jobs = (): readonly DownloadJob[] => this.snapshot;

  job(id: string): DownloadJob | null {
    return this.snapshot.find((job) => job.id === id) ?? null;
  }

  /** Hears every announcement: changes of state at once, progress a few times a second. Bound. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Queues `task`, unless a job of its id is still ahead; a finished one of that id makes way for it. */
  enqueue(task: DownloadTask): void {
    if (this.destroyed) return;
    const existing = this.entries.find((entry) => entry.task.id === task.id);
    if (existing && isActive(existing)) return;
    if (existing) this.entries = this.entries.filter((entry) => entry !== existing);
    this.entries.push(this.fresh(task));
    this.changed(true);
    this.pump();
  }

  cancel(id: string): void {
    const entry = this.entryOf(id);
    if (!entry || !isActive(entry)) return;
    entry.controller.abort();
    this.finish(entry, 'cancelled');
  }

  /** Starts a failed or cancelled job again, at the end of the queue. */
  retry(id: string): void {
    const entry = this.entryOf(id);
    if (!entry || (entry.state !== 'failed' && entry.state !== 'cancelled')) return;
    this.entries = [...this.entries.filter((other) => other !== entry), this.fresh(entry.task)];
    this.changed(true);
    this.pump();
  }

  /** Forgets every job that has nothing ahead of it. */
  clearFinished(): void {
    const left = this.entries.filter(isActive);
    if (left.length === this.entries.length) return;
    this.entries = left;
    this.changed(true);
  }

  reveal(id: string): void {
    const entry = this.entryOf(id);
    if (entry?.state === 'done') entry.task.reveal?.();
  }

  destroy(): void {
    this.destroyed = true;
    for (const entry of this.entries) entry.controller.abort();
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private fresh(task: DownloadTask): Entry {
    return {
      task,
      state: 'queued',
      done: { bytes: 0, files: 0 },
      total: { ...task.estimate },
      fetched: 0,
      meter: null,
      controller: new AbortController(),
      failure: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  private entryOf(id: string): Entry | undefined {
    return this.entries.find((entry) => entry.task.id === id);
  }

  private pump(): void {
    if (this.running || this.destroyed) return;
    const next = this.entries.find((entry) => entry.state === 'queued');
    if (!next) return;
    this.running = this.run(next).finally(() => {
      this.running = null;
      this.pump();
    });
  }

  private async run(entry: Entry): Promise<void> {
    const { signal } = entry.controller;
    entry.state = 'downloading';
    entry.startedAt = this.now();
    entry.meter = new SpeedMeter(entry.startedAt);
    this.changed(true);
    try {
      await entry.task.run(this.progressOf(entry, signal));
      if (signal.aborted || this.destroyed) return;
      entry.done = { ...entry.total };
      this.finish(entry, 'done');
      try {
        entry.task.onDone?.();
      } catch (error) {
        console.error(`[Atlas] After downloading ${entry.task.title}`, error);
      }
    } catch (error) {
      // A cancelled run's failure is the cancel showing through; the job says Cancelled already.
      if (signal.aborted || this.destroyed) return;
      console.error(`[Atlas] Could not download ${entry.task.title}`, error);
      entry.failure = entry.task.explain?.(error) ?? t('downloads.failed');
      this.finish(entry, 'failed');
    }
  }

  private progressOf(entry: Entry, signal: AbortSignal): DownloadProgress {
    return {
      signal,
      expect: (total) => {
        if (signal.aborted) return;
        entry.total = { ...total };
        this.changed(false);
      },
      fileDone: (bytes, fetched) => {
        if (signal.aborted) return;
        entry.done = { bytes: entry.done.bytes + bytes, files: entry.done.files + 1 };
        if (fetched) {
          entry.fetched += bytes;
          entry.meter?.record(entry.fetched, this.now());
        }
        this.changed(false);
      },
    };
  }

  private finish(entry: Entry, state: DownloadState): void {
    entry.state = state;
    entry.finishedAt = this.now();
    entry.meter = null;
    this.changed(true);
  }

  /** A change of state is announced in the same task; progress at most every `NOTIFY_MS`. */
  private changed(now: boolean): void {
    if (this.destroyed) return;
    if (now) {
      if (this.flushQueued) return;
      this.flushQueued = true;
      queueMicrotask(() => this.flush());
      return;
    }
    if (this.timer !== null && !this.timerIdle) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timerIdle = false;
    this.timer = window.setTimeout(() => this.flush(), NOTIFY_MS);
  }

  private flush(): void {
    this.flushQueued = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.destroyed) return;
    const now = this.now();
    this.snapshot = this.entries.map((entry) => this.viewOf(entry, now));
    for (const listener of [...this.listeners]) listener();
    if (!this.entries.some((entry) => entry.state === 'downloading')) return;
    this.timerIdle = true;
    this.timer = window.setTimeout(() => this.flush(), IDLE_REFRESH_MS);
  }

  private viewOf(entry: Entry, now: number): DownloadJob {
    const speed = entry.state === 'downloading' ? entry.meter?.rate(now) ?? null : null;
    const left = Math.max(0, entry.total.bytes - entry.done.bytes);
    return {
      id: entry.task.id,
      title: entry.task.title,
      origin: entry.task.origin,
      state: entry.state,
      done: { ...entry.done },
      total: { ...entry.total },
      speed,
      secondsLeft: speed ? left / speed : null,
      failure: entry.failure,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      canReveal: entry.task.reveal !== undefined,
    };
  }
}
