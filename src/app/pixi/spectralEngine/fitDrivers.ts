/**
 * Running a detection's fits (`FitSteps`): one after the other on this thread, or ahead of time on
 * several, where the fits a detection will most likely ask for next are already under way while it
 * still weighs the last. Either way it is handed the same fits in the same order, so it ends with
 * the same answer.
 */

import type { GrayImage } from './grayImage';
import { fitRequested } from './proposalFits';
import type { RefinedGrid } from './refineGrid';
import type { FitRequest, FitSteps } from './proposalFits';

/** Runs `steps` to their end, each fit on this thread when it is asked for. */
export function runFits<T>(image: GrayImage, steps: FitSteps<T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next(fitRequested(image, step.value.request));
  return step.value;
}

/** Runs one fit somewhere it gives `fitRequested`'s answer: on this thread, or on a worker that holds the same image. */
export type FitRunner = (request: FitRequest) => Promise<RefinedGrid | null>;

interface FitJob {
  request: FitRequest;
  fit: Promise<RefinedGrid | null>;
  start(runner: FitRunner): Promise<void>;
}

function fitJob(request: FitRequest): FitJob {
  let settle!: (run: Promise<RefinedGrid | null>) => void;
  const fit = new Promise<RefinedGrid | null>((resolve) => {
    settle = resolve;
  });
  // A fit started ahead of time that nobody asks for fails unheard; one asked for fails its detection.
  fit.catch(() => undefined);
  return {
    request,
    fit,
    start(runner): Promise<void> {
      const run = runner(request);
      settle(run);
      return run.then(() => undefined, () => undefined);
    },
  };
}

/**
 * Runs `steps` on `runners`, one fit on each at a time: the fit asked for first, and on runners still
 * free the fits the steps say they will ask for next. A fit asked for again is run once; one the steps
 * no longer expect is dropped before it starts.
 */
export async function runFitsAhead<T>(steps: FitSteps<T>, runners: FitRunner[]): Promise<T> {
  const started = new Map<string, FitJob>();
  let waiting: FitJob[] = [];
  const free = [...runners];
  const pump = (): void => {
    while (free.length > 0 && waiting.length > 0) {
      const job = waiting.shift()!;
      const runner = free.shift()!;
      started.set(JSON.stringify(job.request), job);
      void job.start(runner).then(() => {
        free.push(runner);
        pump();
      });
    }
  };
  let step = steps.next();
  while (!step.done) {
    const queued = new Map(waiting.map((job) => [JSON.stringify(job.request), job]));
    waiting = [];
    for (const request of [step.value.request, ...step.value.ahead]) {
      const key = JSON.stringify(request);
      if (started.has(key) || waiting.some((job) => JSON.stringify(job.request) === key)) continue;
      waiting.push(queued.get(key) ?? fitJob(request));
    }
    // The fit asked for heads the queue, or is under way.
    const wanted = started.get(JSON.stringify(step.value.request)) ?? waiting[0]!;
    pump();
    step = steps.next(await wanted.fit);
  }
  return step.value;
}
