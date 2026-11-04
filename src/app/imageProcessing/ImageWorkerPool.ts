import type { ImageJob, ImageJobRequest, ImageJobResponse, ImageJobResult } from './imageJob';

/** Raised when a worker cannot read the source format; the caller may decode it on the main thread. */
export class ImageDecodeError extends Error {}

/** A band decoder refused the source; `reason` is a `BandUnsupportedReason`. */
export class BandRefusedError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
  }
}

export interface ImageJobOptions {
  signal?: AbortSignal | undefined;
  /**
   * Bytes the job holds while it runs (decoded pixels and canvases); unknown
   * runs the job alone. Jobs only run together while their costs fit the
   * pool's memory budget.
   */
  cost?: number | undefined;
  /** Work nobody is waiting for yet, such as preview conversions; other jobs start first. */
  background?: boolean;
  /** Bitmaps moved to the worker instead of copied, such as a source decoded on the main thread. */
  transfer?: ImageBitmap[];
}

export interface ImageWorkerPoolLimits {
  maxWorkers: number;
  /** Bytes all running jobs may hold together. A job that exceeds it alone still runs, by itself. */
  memoryBudget: number;
  idleTimeoutMs?: number;
  jobTimeoutMs?: number;
}

interface PendingJob {
  id: number;
  job: ImageJob;
  cost: number;
  background: boolean;
  transfer: ImageBitmap[];
  signal: AbortSignal | undefined;
  settled: boolean;
  resolve: (result: ImageJobResult) => void;
  reject: (reason: unknown) => void;
  onAbort: () => void;
}

interface WorkerSlot {
  worker: Worker;
  job: PendingJob | null;
  timeout: number | null;
}

/** Idle workers are stopped after this long, so no threads linger between imports. */
const IDLE_TIMEOUT_MS = 30_000;
/** A worker that has not answered after this long is stopped; even huge maps finish well within it. */
const JOB_TIMEOUT_MS = 5 * 60_000;
const STOPPED_MESSAGE = 'Image processing has stopped.';

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The image job was cancelled.', 'AbortError');
}

/**
 * Runs image jobs on a bounded set of dedicated workers, first in, first out
 * (background jobs after the rest), as many at once as workers and memory
 * budget allow. Workers start on demand and stop when idle; a crashed worker
 * fails only its own job and is replaced by the next one that is needed.
 */
export class ImageWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: PendingJob[] = [];
  private nextId = 1;
  private idleTimer: number | null = null;
  private disposed = false;

  private readonly maxWorkers: number;
  private readonly memoryBudget: number;
  private readonly idleTimeoutMs: number;
  private readonly jobTimeoutMs: number;

  constructor(private readonly createWorker: () => Worker, limits: ImageWorkerPoolLimits) {
    this.maxWorkers = limits.maxWorkers;
    this.memoryBudget = limits.memoryBudget;
    this.idleTimeoutMs = limits.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    this.jobTimeoutMs = limits.jobTimeoutMs ?? JOB_TIMEOUT_MS;
  }

  run(job: ImageJob, options: ImageJobOptions = {}): Promise<ImageJobResult> {
    const { signal } = options;
    if (this.disposed || signal?.aborted) {
      for (const bitmap of options.transfer ?? []) bitmap.close();
      return Promise.reject(signal?.aborted ? abortReason(signal) : new Error(STOPPED_MESSAGE));
    }
    return new Promise<ImageJobResult>((resolve, reject) => {
      const pending: PendingJob = {
        id: this.nextId++,
        job,
        cost: options.cost ?? Infinity,
        background: options.background ?? false,
        transfer: options.transfer ?? [],
        signal,
        settled: false,
        resolve,
        reject,
        onAbort: () => this.abort(pending),
      };
      signal?.addEventListener('abort', pending.onAbort, { once: true });
      this.enqueue(pending);
      this.pump();
    });
  }

  /** Stops every worker and fails all queued and running jobs. */
  dispose(): void {
    this.disposed = true;
    this.clearIdleTimer();
    for (const slot of this.slots.splice(0)) {
      this.clearJobTimeout(slot);
      slot.worker.terminate();
      if (slot.job) this.fail(slot.job, new Error(STOPPED_MESSAGE));
    }
    for (const pending of this.queue.splice(0)) this.drop(pending, new Error(STOPPED_MESSAGE));
  }

  private enqueue(pending: PendingJob): void {
    const firstBackground = pending.background ? -1 : this.queue.findIndex(queued => queued.background);
    if (firstBackground < 0) this.queue.push(pending);
    else this.queue.splice(firstBackground, 0, pending);
  }

  /** Starts queued jobs in order; a job that does not fit the budget yet lets smaller ones behind it pass. */
  private pump(): void {
    let running = this.slots.filter(slot => slot.job).length;
    let used = this.slots.reduce((sum, slot) => sum + (slot.job?.cost ?? 0), 0);
    for (let index = 0; index < this.queue.length;) {
      const pending = this.queue[index]!;
      if (running > 0 && used + pending.cost > this.memoryBudget) {
        index += 1;
        continue;
      }
      let slot: WorkerSlot | null;
      try {
        slot = this.freeSlot();
      } catch (error) {
        // A worker that cannot even start fails the job instead of leaving it queued forever.
        this.queue.splice(index, 1);
        this.drop(pending, error);
        continue;
      }
      if (!slot) break;
      this.queue.splice(index, 1);
      running += 1;
      used += pending.cost;
      this.start(slot, pending);
    }
    this.stopWhenIdle();
  }

  private freeSlot(): WorkerSlot | null {
    const idle = this.slots.find(slot => !slot.job);
    if (idle) return idle;
    return this.slots.length < this.maxWorkers ? this.addSlot() : null;
  }

  private addSlot(): WorkerSlot {
    const slot: WorkerSlot = { worker: this.createWorker(), job: null, timeout: null };
    slot.worker.addEventListener('message', (event: MessageEvent<ImageJobResponse>) => this.finish(slot, event.data));
    slot.worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      this.crash(slot, event.message || 'The image worker stopped unexpectedly.');
    });
    slot.worker.addEventListener('messageerror', () => this.crash(slot, 'Could not read the image worker’s reply.'));
    this.slots.push(slot);
    return slot;
  }

  private start(slot: WorkerSlot, pending: PendingJob): void {
    slot.job = pending;
    const request: ImageJobRequest = { id: pending.id, job: pending.job };
    try {
      slot.worker.postMessage(request, pending.transfer);
    } catch (error) {
      slot.job = null;
      this.fail(pending, error);
      return;
    }
    slot.timeout = window.setTimeout(() => this.crash(slot, 'Processing the image took too long.'), this.jobTimeoutMs);
  }

  private finish(slot: WorkerSlot, response: ImageJobResponse): void {
    const pending = slot.job;
    if (!pending || pending.id !== response.id) return;
    this.clearJobTimeout(slot);
    slot.job = null;
    if (response.ok) this.succeed(pending, response.result);
    else if (response.unsupported !== undefined) this.fail(pending, new BandRefusedError(response.message, response.unsupported));
    else this.fail(pending, response.decodeFailed ? new ImageDecodeError(response.message) : new Error(response.message));
    this.pump();
  }

  private crash(slot: WorkerSlot, message: string): void {
    this.retire(slot, new Error(message));
  }

  /** Stops a slot's worker, fails its job with `reason` and lets the next job start. */
  private retire(slot: WorkerSlot, reason: unknown): void {
    this.clearJobTimeout(slot);
    slot.worker.terminate();
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
    if (slot.job) this.fail(slot.job, reason);
    slot.job = null;
    this.pump();
  }

  /**
   * A queued job leaves the queue. A running one stops with its worker, so it neither
   * keeps a worker busy nor holds its share of the memory budget.
   */
  private abort(pending: PendingJob): void {
    const reason = abortReason(pending.signal!);
    const running = this.slots.find(slot => slot.job === pending);
    if (running) {
      this.retire(running, reason);
      return;
    }
    const index = this.queue.indexOf(pending);
    if (index < 0) return;
    this.queue.splice(index, 1);
    this.drop(pending, reason);
    this.stopWhenIdle();
  }

  /** Fails a job that never reached a worker and frees the bitmaps it would have transferred. */
  private drop(pending: PendingJob, reason: unknown): void {
    for (const bitmap of pending.transfer) bitmap.close();
    this.fail(pending, reason);
  }

  private succeed(pending: PendingJob, result: ImageJobResult): void {
    if (pending.settled) return;
    this.settle(pending);
    pending.resolve(result);
  }

  private fail(pending: PendingJob, reason: unknown): void {
    if (pending.settled) return;
    this.settle(pending);
    pending.reject(reason);
  }

  private settle(pending: PendingJob): void {
    pending.settled = true;
    pending.signal?.removeEventListener('abort', pending.onAbort);
  }

  private stopWhenIdle(): void {
    this.clearIdleTimer();
    if (this.slots.length === 0 || this.queue.length > 0 || this.slots.some(slot => slot.job)) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      for (const slot of this.slots.splice(0)) slot.worker.terminate();
    }, this.idleTimeoutMs);
  }

  private clearJobTimeout(slot: WorkerSlot): void {
    if (slot.timeout === null) return;
    window.clearTimeout(slot.timeout);
    slot.timeout = null;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
