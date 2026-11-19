import { WorkerTimers, type Timers } from '../../utils/workerTimers';

export { blobTimerWorker, WorkerTimers, type TimerWorker, type TimerWorkerFactory, type Timers } from '../../utils/workerTimers';

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
