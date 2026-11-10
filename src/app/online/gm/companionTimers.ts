/** The clock and timers the companion schedules with. */
export interface Timers {
  now(): number;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/** What the timers ask of their worker: set or clear a timer by id; it answers with the id when one fires. */
export interface TimerWorker {
  post(request: { readonly id: number; readonly ms?: number }): void;
  terminate(): void;
}

/** Makes the worker that fires timers by calling `fire` with their id, or null where none can run. */
export type TimerWorkerFactory = (fire: (id: number) => void) => TimerWorker | null;

/** A dedicated worker's own timers: a request with `ms` sets one, without clears it. */
const WORKER_SOURCE = `const timers = new Map();
onmessage = ({ data }) => {
  clearTimeout(timers.get(data.id));
  timers.delete(data.id);
  if (data.ms !== undefined) timers.set(data.id, setTimeout(() => { timers.delete(data.id); postMessage(data.id); }, data.ms));
};`;

/** A worker from an inline script; null where workers are missing (tests in Node) or refused. */
export function blobTimerWorker(fire: (id: number) => void): TimerWorker | null {
  if (typeof Worker === 'undefined') return null;
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  try {
    const worker = new Worker(url);
    worker.onmessage = (event: MessageEvent<number>): void => fire(event.data);
    return {
      post: (request) => worker.postMessage(request),
      terminate: () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/**
 * Timers that keep their pace while Obsidian's window is hidden. Chromium runs a hidden page's timers
 * once a second, and chained ones once a minute after five minutes, and stops its animation frames;
 * a dedicated worker's timers are not throttled, and its messages wake the page at once. Without a
 * worker the window's timers stand in. Once disposed, nothing is scheduled any more.
 */
export class WorkerTimers implements Timers {
  private worker: TimerWorker | null;
  /** No worker could be made: the window's timers run instead. */
  private readonly fallback: boolean;
  private readonly runs = new Map<number, () => void>();
  private nextId = 1;
  private disposed = false;

  constructor(createWorker: TimerWorkerFactory = blobTimerWorker) {
    this.worker = createWorker((id) => this.fire(id));
    this.fallback = this.worker === null;
  }

  now(): number {
    return performance.now();
  }

  setTimer(run: () => void, ms: number): number {
    if (this.disposed) return 0;
    if (this.worker === null) return window.setTimeout(run, ms);
    const id = this.nextId;
    this.nextId += 1;
    this.runs.set(id, run);
    this.worker.post({ id, ms: Math.max(0, ms) });
    return id;
  }

  clearTimer(timer: number): void {
    if (this.fallback) return window.clearTimeout(timer);
    if (this.runs.delete(timer)) this.worker?.post({ id: timer });
  }

  /** Stops the worker; timers still set never run. */
  dispose(): void {
    this.disposed = true;
    this.runs.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private fire(id: number): void {
    const run = this.runs.get(id);
    if (run === undefined) return;
    this.runs.delete(id);
    run();
  }
}

/** Runs `run` every `ms` on `timers` until the returned function is called. */
export function every(timers: Timers, ms: number, run: () => void): () => void {
  let timer = 0;
  let stopped = false;
  const next = (): void => {
    timer = timers.setTimer(() => {
      if (stopped) return;
      next();
      run();
    }, ms);
  };
  next();
  return () => {
    stopped = true;
    timers.clearTimer(timer);
  };
}

let shared: WorkerTimers | null = null;

/** The companion's timers, one worker for this load of the plugin, made when first asked for. */
export function companionTimers(): Timers {
  shared ??= new WorkerTimers();
  return shared;
}

/** Stops online play's timer worker when it unloads; a disposed one fires nothing, so the next load makes its own. */
export function stopCompanionTimers(): void {
  shared?.dispose();
  shared = null;
}
