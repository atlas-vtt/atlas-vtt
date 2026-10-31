/**
 * Runs grid detections off the main thread, one at a time, and hands on what each has to show
 * while it runs. A detection is one synchronous computation of up to several seconds, so the only
 * way to end one is to end its worker: cancelling does, and the next detection starts another.
 * Where no worker can start, detections run on the main thread as they did before there was one.
 */

import type { AlignmentResult } from '../gridAlignmentMath';
import { grayOfBitmap } from './detectGrid';
import type { MapGray, MapPicture } from './detectGrid';
import { NO_GRID, runDetection } from './detectionJob';
import type { DetectionEvent, DetectionJob, DetectionOutcome } from './detectionJob';
import type { DetectionReply, DetectionRequest } from './detectionProtocol';

export interface DetectOptions {
  /** The grids a measurement or placement can stand for; without them the whole map is searched. */
  candidates?: AlignmentResult[];
  /** Whether the outcome should say where the map's lines lie (`DetectionOutcome.lines`). */
  lines?: boolean;
  /** Hears what the detection finds on its way. Asking makes it read the map's line evidence first. */
  onEvent?: (event: DetectionEvent) => void;
  /** Ends the detection: its promise rejects with the signal's reason. */
  signal?: AbortSignal;
}

/** What a detection looks at: a map's luminance, or its picture for the worker to read the luminance from. */
export type MapPixels = MapGray | MapPicture;

interface Task extends DetectOptions {
  id: number;
  pixels: MapPixels;
  resolve: (outcome: DetectionOutcome) => void;
  reject: (reason: Error) => void;
  /** Set while the task waits to run on the main thread. */
  timer?: number;
}

/** Lets a status paint before a detection holds the main thread. */
const PAINT_DELAY_MS = 30;

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The grid detection was cancelled.', 'AbortError');
}

/** What a detection asked of a plugin that has unloaded is rejected with. */
export function detectionStopped(): Error {
  return new Error('Grid detection has stopped.');
}

export class SpectralEngineClient {
  private worker: Worker | null = null;
  /** The worker has answered once: an error after that is a crash, before it a worker that cannot run here. */
  private proven = false;
  private inThread = false;
  private disposed = false;
  private running: Task | null = null;
  private readonly waiting: Task[] = [];
  private readonly imageKeys = new WeakMap<MapPixels, number>();
  /** Pictures read on the main thread, where no worker runs. */
  private readonly readHere = new WeakMap<MapPicture, MapGray | null>();
  /** The image the running worker holds. */
  private heldKey: number | null = null;
  private nextId = 1;

  constructor(private readonly createWorker: () => Worker) {}

  detect(pixels: MapPixels, options: DetectOptions = {}): Promise<DetectionOutcome> {
    if (this.disposed) return Promise.reject(detectionStopped());
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise((resolve, reject) => {
      const task: Task = { ...options, id: this.nextId++, pixels, resolve, reject };
      signal?.addEventListener('abort', () => this.cancel(task, abortReason(signal)), { once: true });
      this.waiting.push(task);
      this.next();
    });
  }

  /** Ends every detection; called when the plugin unloads. */
  dispose(): void {
    this.disposed = true;
    const stopped = detectionStopped();
    // A copy: `cancel` takes each task out of the queue it finds it in.
    for (const task of [this.running, ...this.waiting]) if (task) this.cancel(task, stopped);
  }

  private next(): void {
    if (this.running || this.disposed) return;
    const task = this.waiting.shift();
    if (!task) return;
    this.running = task;
    if (this.inThread || !this.startedWorker()) {
      this.runInThread(task);
      return;
    }

    void this.send(task);
  }

  /** Hands `task` to the worker, with the map's pixels where the worker does not hold them yet. */
  private async send(task: Task): Promise<void> {
    const key = this.keyOf(task.pixels);
    const request: DetectionRequest = { id: task.id, imageKey: key, ink: task.onEvent !== undefined, lines: task.lines === true, ...(task.candidates ? { candidates: task.candidates } : {}) };
    const transfer: Transferable[] = [];
    if (this.heldKey !== key) {
      if ('image' in task.pixels) {
        request.gray = task.pixels;
      } else {
        const bitmap = await task.pixels.bitmap().catch((): null => null);
        // Ended while the picture was fetched: nobody waits for it.
        if (this.running !== task) {
          bitmap?.close();
          return;
        }
        if (!bitmap) {
          this.running = null;
          task.resolve(NO_GRID);
          this.next();
          return;
        }
        request.picture = { bitmap, size: task.pixels.size };
        transfer.push(bitmap);
      }
    }
    this.heldKey = key;
    this.worker?.postMessage(request, transfer);
  }

  private keyOf(pixels: MapPixels): number {
    let key = this.imageKeys.get(pixels);
    if (key === undefined) {
      key = this.nextId++;
      this.imageKeys.set(pixels, key);
    }
    return key;
  }

  private startedWorker(): boolean {
    if (this.worker) return true;
    try {
      const worker = this.createWorker();
      worker.addEventListener('message', ({ data }: MessageEvent<DetectionReply>) => this.receive(data));
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        this.workerFailed(event.message);
      });
      this.worker = worker;
      return true;
    } catch {
      this.inThread = true;
      return false;
    }
  }

  private receive(reply: DetectionReply): void {
    this.proven = true;
    const task = this.running;
    if (task?.id !== reply.id) return;
    if ('event' in reply) {
      task.onEvent?.(reply.event);
      return;
    }
    this.running = null;
    if ('outcome' in reply) task.resolve(reply.outcome);
    else task.reject(new Error(reply.error));
    this.next();
  }

  private workerFailed(message: string): void {
    this.dropWorker();
    const task = this.running;
    this.running = null;
    if (!this.proven) {
      // A worker that never ran will not run next time either: the main thread takes over, this task first.
      this.inThread = true;
      if (task) this.waiting.unshift(task);
    } else {
      task?.reject(new Error(`Grid detection failed: ${message}`));
    }
    this.next();
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.heldKey = null;
  }

  private runInThread(task: Task): void {
    task.timer = window.setTimeout(() => void this.detectHere(task), PAINT_DELAY_MS);
  }

  private async detectHere(task: Task): Promise<void> {
    const { candidates, onEvent, lines } = task;
    try {
      const gray = await this.grayHere(task.pixels);
      if (this.running !== task) return;
      const job: DetectionJob | null = gray && { gray, ink: onEvent !== undefined, lines: lines === true, ...(candidates ? { candidates } : {}) };
      task.resolve(job ? runDetection(job, (event) => onEvent?.(event)) : NO_GRID);
    } catch (error) {
      if (this.running !== task) return;
      task.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.running = null;
    this.next();
  }

  /** The luminance of `pixels`, read on the main thread once for a picture. */
  private async grayHere(pixels: MapPixels): Promise<MapGray | null> {
    if ('image' in pixels) return pixels;
    const known = this.readHere.get(pixels);
    if (known !== undefined) return known;
    const bitmap = await pixels.bitmap();
    const gray = bitmap ? grayOfBitmap(bitmap, pixels.size) : null;
    this.readHere.set(pixels, gray);
    return gray;
  }

  private cancel(task: Task, reason: Error): void {
    const waitingAt = this.waiting.indexOf(task);
    if (waitingAt >= 0) {
      this.waiting.splice(waitingAt, 1);
    } else if (this.running === task) {
      this.running = null;
      window.clearTimeout(task.timer);
      // The worker is in the middle of this task and hears nothing until it is through.
      if (!this.inThread) this.dropWorker();
    } else {
      // Already answered, or ended before.
      return;
    }
    task.reject(reason);
    this.next();
  }
}
