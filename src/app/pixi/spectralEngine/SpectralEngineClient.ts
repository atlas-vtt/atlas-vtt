/**
 * Runs grid detections off the main thread, each on a worker of its own and up to `lanes` at once,
 * and hands on what each has to show while it runs. A detection is one synchronous computation of
 * up to several seconds, so the only way to end one is to end its worker: cancelling does, and the
 * next detection starts another. Where no worker can start, detections run on the main thread one
 * after the other, as they did before there was one.
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
  /** Only where the map's lines lie (`DetectionOutcome.lines`), without searching it. */
  linesOnly?: boolean;
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

/** One worker and the detection it runs. */
interface Lane {
  worker: Worker;
  /** The image the worker holds. */
  heldKey: number | null;
  task: Task | null;
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
  private readonly lanes: Lane[] = [];
  /** A worker has answered once: an error after that is a crash, before it a worker that cannot run here. */
  private proven = false;
  private inThread = false;
  private disposed = false;
  /** The detection running on the main thread, where no worker runs. */
  private here: Task | null = null;
  private readonly waiting: Task[] = [];
  private readonly imageKeys = new WeakMap<MapPixels, number>();
  /** Pictures read on the main thread, where no worker runs. */
  private readonly readHere = new WeakMap<MapPicture, MapGray | null>();
  private nextId = 1;

  /** `lanes`: detections run at once, each on its own worker; with one they run one after the other. */
  constructor(private readonly createWorker: () => Worker, private readonly laneCount = 1) {}

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
    // A copy: `cancel` takes each task out of the place it finds it in.
    for (const task of [this.here, ...this.lanes.map((lane) => lane.task), ...this.waiting]) if (task) this.cancel(task, stopped);
  }

  private next(): void {
    while (!this.disposed && this.waiting.length > 0) {
      if (this.inThread) {
        if (this.here) return;
        this.here = this.waiting.shift()!;
        this.runInThread(this.here);
        return;
      }
      const lane = this.lanes.find((each) => !each.task) ?? (this.lanes.length < this.laneCount ? this.startedLane() : null);
      if (!lane) {
        // None could start: the main thread takes over.
        if (this.inThread) continue;
        return;
      }
      const task = this.waiting.shift()!;
      lane.task = task;
      void this.send(lane, task);
    }
    // Workers beyond the first end once nothing waits for them, with the image each holds: a huge map's windows are asked about
    // once. The first keeps its image, which the whole-map search after a huge map's lines and a panel's next fit find there.
    for (const lane of this.lanes.slice(1)) if (!lane.task) this.drop(lane);
  }

  /** Hands `task` to `lane`'s worker, with the map's pixels where the worker does not hold them yet. */
  private async send(lane: Lane, task: Task): Promise<void> {
    const key = this.keyOf(task.pixels);
    const request: DetectionRequest = { id: task.id, imageKey: key, ink: task.onEvent !== undefined, linesOnly: task.linesOnly === true, ...(task.candidates ? { candidates: task.candidates } : {}) };
    const transfer: Transferable[] = [];
    if (lane.heldKey !== key) {
      if ('image' in task.pixels) {
        request.gray = task.pixels;
      } else {
        const bitmap = await task.pixels.bitmap().catch((): null => null);
        // Ended while the picture was fetched: nobody waits for it.
        if (lane.task !== task) {
          bitmap?.close();
          return;
        }
        if (!bitmap) {
          lane.task = null;
          task.resolve(NO_GRID);
          this.next();
          return;
        }
        request.picture = { bitmap, size: task.pixels.size };
        transfer.push(bitmap);
      }
    }
    lane.heldKey = key;
    lane.worker.postMessage(request, transfer);
  }

  private keyOf(pixels: MapPixels): number {
    let key = this.imageKeys.get(pixels);
    if (key === undefined) {
      key = this.nextId++;
      this.imageKeys.set(pixels, key);
    }
    return key;
  }

  /** A new worker; null where none can start, and where not even the first could, detections run on the main thread. */
  private startedLane(): Lane | null {
    try {
      const lane: Lane = { worker: this.createWorker(), heldKey: null, task: null };
      lane.worker.addEventListener('message', ({ data }: MessageEvent<DetectionReply>) => this.receive(lane, data));
      lane.worker.addEventListener('error', (event) => {
        event.preventDefault();
        this.workerFailed(lane, event.message);
      });
      this.lanes.push(lane);
      return lane;
    } catch {
      if (this.lanes.length === 0) this.inThread = true;
      return null;
    }
  }

  private receive(lane: Lane, reply: DetectionReply): void {
    this.proven = true;
    const task = lane.task;
    if (task?.id !== reply.id) return;
    if ('event' in reply) {
      task.onEvent?.(reply.event);
      return;
    }
    lane.task = null;
    if ('outcome' in reply) task.resolve(reply.outcome);
    else task.reject(new Error(reply.error));
    this.next();
  }

  private workerFailed(lane: Lane, message: string): void {
    const task = lane.task;
    this.drop(lane);
    if (!this.proven) {
      // A worker that never ran will not run next time either: the main thread takes over, this task first.
      this.inThread = true;
      if (task) this.waiting.unshift(task);
    } else {
      task?.reject(new Error(`Grid detection failed: ${message}`));
    }
    this.next();
  }

  private drop(lane: Lane): void {
    lane.worker.terminate();
    lane.task = null;
    const at = this.lanes.indexOf(lane);
    if (at >= 0) this.lanes.splice(at, 1);
  }

  private runInThread(task: Task): void {
    task.timer = window.setTimeout(() => void this.detectHere(task), PAINT_DELAY_MS);
  }

  private async detectHere(task: Task): Promise<void> {
    const { candidates, onEvent, linesOnly } = task;
    try {
      const gray = await this.grayHere(task.pixels);
      if (this.here !== task) return;
      const job: DetectionJob | null = gray && { gray, ink: onEvent !== undefined, linesOnly: linesOnly === true, ...(candidates ? { candidates } : {}) };
      task.resolve(job ? runDetection(job, (event) => onEvent?.(event)) : NO_GRID);
    } catch (error) {
      if (this.here !== task) return;
      task.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.here = null;
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
    const lane = this.lanes.find((each) => each.task === task);
    if (waitingAt >= 0) {
      this.waiting.splice(waitingAt, 1);
    } else if (this.here === task) {
      this.here = null;
      window.clearTimeout(task.timer);
    } else if (lane) {
      // The worker is in the middle of this task and hears nothing until it is through.
      this.drop(lane);
    } else {
      // Already answered, or ended before.
      return;
    }
    task.reject(reason);
    this.next();
  }
}
