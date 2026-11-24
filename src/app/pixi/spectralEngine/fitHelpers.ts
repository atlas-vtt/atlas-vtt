/**
 * Workers that run single fits for the detection worker, so a detection fits several proposals at
 * once (`runFitsAhead`). The detection worker hands its image over once; each helper gets it with
 * its first fit on it. A helper that fails answers its fit with the error, and the next fit starts
 * another.
 */

import type { FitAnswer, FitTask } from './detectionProtocol';
import type { GrayImage } from './grayImage';
import type { FitRequest } from './proposalFits';

/**
 * Helpers by the cores the device has: on twelve, two besides the detection worker itself (a
 * detection then takes about half its time on one), none on four or fewer. The pyramid of a new
 * map is built at the same time, and every helper holds a copy of the image (64 MB at 4096 px a
 * side): none on mobile.
 */
export function fitHelperCount(cores: number, desktop: boolean): number {
  return desktop ? Math.min(2, Math.max(0, Math.floor(cores / 4) - 1)) : 0;
}

/** Helpers left without a fit this long are ended, with the image each holds: a panel's next fit within it finds them ready. */
const IDLE_MS = 30_000;

interface Helper {
  worker: Worker;
  /** The image it holds. */
  imageKey: number | null;
  /** The fit it is on. */
  task: Pending | null;
}

interface Pending {
  ticket: number;
  imageKey: number;
  request: FitRequest;
  answer: (answer: FitAnswer) => void;
}

export class FitHelpers {
  private readonly helpers: Helper[] = [];
  private readonly waiting: Pending[] = [];
  private image: { key: number; image: GrayImage } | null = null;
  private idleTimer: number | null = null;

  constructor(private readonly createWorker: () => Worker, readonly count: number) {}

  /** Whether the helpers have the image named `key`, or can be given it. */
  holds(key: number): boolean {
    return this.image?.key === key;
  }

  /** The image the next fits are run on. */
  share(key: number, image: GrayImage): void {
    this.image = { key, image };
  }

  /** Runs a fit on the first helper that is free; a helper that fails answers with its error. */
  run(ticket: number, imageKey: number, request: FitRequest): Promise<FitAnswer> {
    return new Promise((answer) => {
      this.stopIdling();
      this.waiting.push({ ticket, imageKey, request, answer });
      this.next();
    });
  }

  /** Ends every helper and every fit; the next fit starts helpers anew. */
  reset(): void {
    this.stopIdling();
    for (const helper of this.helpers.splice(0)) this.end(helper, 'Grid detection has stopped.');
    for (const pending of this.waiting.splice(0)) pending.answer({ ticket: pending.ticket, error: 'Grid detection has stopped.' });
    this.image = null;
  }

  private next(): void {
    while (this.waiting.length > 0) {
      const helper = this.helpers.find((candidate) => !candidate.task) ?? this.started();
      if (!helper) return;
      const pending = this.waiting.shift()!;
      const task: FitTask = { ticket: pending.ticket, imageKey: pending.imageKey, request: pending.request };
      if (helper.imageKey !== pending.imageKey && this.image?.key === pending.imageKey) task.image = this.image.image;
      helper.task = pending;
      helper.imageKey = pending.imageKey;
      helper.worker.postMessage(task);
    }
  }

  private started(): Helper | null {
    if (this.helpers.length >= this.count) return null;
    let worker: Worker;
    try {
      worker = this.createWorker();
    } catch (error) {
      // The detection worker runs these fits itself.
      for (const pending of this.waiting.splice(0)) pending.answer({ ticket: pending.ticket, error: String(error) });
      return null;
    }
    const helper: Helper = { worker, imageKey: null, task: null };
    worker.addEventListener('message', ({ data }: MessageEvent<FitAnswer>) => {
      const task = helper.task;
      if (task?.ticket !== data.ticket) return;
      helper.task = null;
      task.answer(data);
      this.next();
      if (this.waiting.length === 0 && this.helpers.every((each) => !each.task)) this.idleTimer = window.setTimeout(() => this.reset(), IDLE_MS);
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      const at = this.helpers.indexOf(helper);
      if (at >= 0) this.helpers.splice(at, 1);
      this.end(helper, `A grid detection helper failed: ${event.message}`);
      this.next();
    });
    this.helpers.push(helper);
    return helper;
  }

  private stopIdling(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private end(helper: Helper, error: string): void {
    helper.worker.terminate();
    if (helper.task) helper.task.answer({ ticket: helper.task.ticket, error });
    helper.task = null;
  }
}
