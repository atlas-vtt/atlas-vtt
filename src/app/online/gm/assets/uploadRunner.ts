import type { Timers } from '../companionTimers.ts';
import { runJob, type JobDeps, type JobEnd } from './assetJob.ts';
import { inFlight, RestingLatency, Slots } from './uploadPace.ts';
import type { UploadQueue, QueueEntry } from './uploadQueue.ts';

/** How often the queue looks again while anything is on its way: players come and go, the round trip changes. */
export const PUMP_MS = 1_000;
/**
 * The most uploads of whole assets under way at once; how many requests they send at once is the
 * connection's (`inFlight`). Pyramids are not counted: between batches they only wait for a turn, which
 * goes to the most urgent asker, so a pyramid nobody looks at never keeps a map players look at from starting.
 */
export const MAX_JOBS = 4;
/** An asset at least this large holds its bytes in memory while it goes up: one such at a time. */
export const LARGE_BYTES = 32 * 1024 * 1024;

export interface RunnerDeps extends Pick<JobDeps, 'client' | 'readFile' | 'blobs' | 'unchanged'> {
  readonly queue: UploadQueue;
  readonly timers: Timers;
  /** The players connected now, and the time the socket's last keep-alive took. */
  connection(): { readonly players: number; readonly latencyMs: number | null };
  /** Whether uploads may go now (the store took the account's assets). */
  mayUpload(): boolean;
  /** An upload's share so far. */
  progress(entry: QueueEntry, share: number): void;
  /** An upload ended. */
  ended(entry: QueueEntry, end: JobEnd): void;
  /** The queue's look again: offers what waits, else `pump`s. */
  tick(): void;
  /** Nothing is on its way any more. */
  settled(): void;
}

/**
 * Runs the queue's uploads: up to `MAX_JOBS` whole assets at once (one of them large) and every pyramid
 * whose next level is cut, their requests let out as the connection allows (`inFlight`: four while
 * nobody plays, one while players are connected or the keep-alive takes more than twice its resting
 * time) to the most urgent asset first, and
 * stopped before their next request once `stop` or `abort` comes.
 */
export class UploadRunner {
  private readonly latency = new RestingLatency();
  private readonly slots: Slots;
  private controller = new AbortController();
  private readonly running = new Set<QueueEntry>();
  private timer: number | undefined;
  private stopped = false;

  constructor(private readonly deps: RunnerDeps) {
    this.slots = new Slots(() => this.limit());
  }

  /** How many requests may be in flight now; samples the round trip it is measured by. */
  limit(): number {
    const { players, latencyMs } = this.deps.connection();
    this.latency.sample(latencyMs, this.deps.timers.now());
    return inFlight(players, latencyMs, this.latency.value());
  }

  get busy(): boolean {
    return this.running.size > 0;
  }

  /** The resting round trip is learnt anew (a new socket). */
  resetLatency(): void {
    this.latency.reset();
  }

  /** Starts what may go now and looks again while anything is on its way. */
  pump(): void {
    if (this.stopped) return;
    this.slots.drain();
    const now = this.deps.timers.now();
    while (this.deps.mayUpload()) {
      const whole = [...this.running].filter((entry) => entry.kind !== 'tiles');
      const full = whole.length >= MAX_JOBS;
      const large = whole.some((entry) => entry.size >= LARGE_BYTES);
      const next = this.deps.queue.next(now, (entry) => entry.kind === 'tiles' || (!full && (!large || entry.size < LARGE_BYTES)));
      if (next === undefined) break;
      void this.run(next);
    }
    if (this.timer === undefined && this.deps.mayUpload() && (this.deps.queue.busy || this.running.size > 0)) {
      this.timer = this.deps.timers.setTimer(() => {
        this.timer = undefined;
        this.deps.tick();
      }, PUMP_MS);
    }
  }

  /** Stops the uploads under way before their next request; new ones run once the queue may go again. */
  abort(): void {
    this.controller.abort();
    this.controller = new AbortController();
  }

  /** Stops for good: nothing more goes out. */
  stop(): void {
    this.stopped = true;
    this.controller.abort();
    this.slots.close();
    if (this.timer !== undefined) this.deps.timers.clearTimer(this.timer);
    this.timer = undefined;
  }

  private async run(entry: QueueEntry): Promise<void> {
    entry.state = 'uploading';
    this.running.add(entry);
    const { signal } = this.controller;
    let end: JobEnd;
    try {
      end = await runJob(entry, {
        client: this.deps.client,
        readFile: (path) => this.deps.readFile(path),
        blobs: this.deps.blobs,
        unchanged: (path, hash) => this.deps.unchanged(path, hash),
        slot: () => this.slots.take(() => ({ rank: entry.rank, stamp: entry.stamp })),
        signal,
        progress: (share) => this.deps.progress(entry, share),
      });
    } catch {
      end = 'retry';
    }
    this.running.delete(entry);
    if (this.stopped) return;
    // Stopped for a sign-out: it waits, as it was, for the queue to go again.
    if (end === 'stopped' || signal.aborted) entry.state = 'queued';
    else this.deps.ended(entry, end);
    this.pump();
    if (!this.deps.queue.busy && this.running.size === 0) this.deps.settled();
  }
}
