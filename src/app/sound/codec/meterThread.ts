import { LoudnessMeter, type LoudnessResult } from './loudness';
import LoudnessWorker from './loudnessWorker?worker&inline';

export type MeterMessage = { type: 'add'; planes: Float32Array<ArrayBuffer>[] } | { type: 'peek' } | { type: 'finish' };
export type MeterReply = { type: 'ack' } | { type: 'peek'; result: LoudnessResult } | { type: 'result'; result: LoudnessResult };

/** Pieces sent and not yet measured, at most: about two seconds of sound, so memory stays flat if the meter falls behind. */
const MAX_IN_FLIGHT = 24;

/**
 * Loudness and true peak measured on a thread of their own, beside the conversion's decoding, resampling
 * and encoding: the true peak's oversampling is a conversion's costliest arithmetic after the resampler.
 * The result is the very one `LoudnessMeter` gives in place, which it falls back to where a worker cannot
 * be made.
 */
export class MeterThread {
  private readonly worker: Worker | null;
  private readonly local: LoudnessMeter | null;
  private inFlight = 0;
  private wake: (() => void) | null = null;
  private finished: ((result: LoudnessResult) => void) | null = null;
  private peeked: ((result: LoudnessResult) => void) | null = null;
  private failure: Error | null = null;

  constructor(channels: number) {
    let worker: Worker | null = null;
    try {
      worker = new LoudnessWorker({ name: 'Atlas sound loudness' });
    } catch {
      worker = null;
    }
    this.worker = worker;
    this.local = worker ? null : new LoudnessMeter(channels);
    if (!worker) return;
    worker.onmessage = (event: MessageEvent<MeterReply>): void => {
      const message = event.data;
      if (message.type === 'ack') {
        this.inFlight--;
        this.wake?.();
      } else if (message.type === 'peek') {
        this.peeked?.(message.result);
        this.peeked = null;
      } else {
        this.finished?.(message.result);
      }
    };
    worker.onerror = (event): void => {
      this.failure = new Error(event.message);
      this.wake?.();
      this.finished?.({ lufs: Number.NaN, truePeakDb: Number.NaN });
    };
  }

  /** Measures a copy: the planes go on to the encoder. */
  add(planes: readonly Float32Array[]): void {
    if (this.local) {
      this.local.add(planes);
      return;
    }
    const copies = planes.map((plane) => plane.slice());
    this.inFlight++;
    this.worker?.postMessage({ type: 'add', planes: copies } satisfies MeterMessage, copies.map((plane) => plane.buffer));
  }

  /** Waits while the meter is too far behind. */
  room(): Promise<void> | null {
    if (this.inFlight <= MAX_IN_FLIGHT || this.failure) return null;
    return new Promise((resolve) => {
      this.wake = () => {
        if (this.inFlight > MAX_IN_FLIGHT && !this.failure) return;
        this.wake = null;
        resolve();
      };
    });
  }

  /** Loudness of what was measured so far, for a copy played while it is made. One question at a time; null while one is open. */
  peek(): Promise<LoudnessResult> | null {
    if (this.local) return Promise.resolve(this.local.result());
    if (this.peeked || this.failure) return null;
    return new Promise((resolve) => {
      this.peeked = resolve;
      this.worker?.postMessage({ type: 'peek' } satisfies MeterMessage);
    });
  }

  async result(): Promise<LoudnessResult> {
    if (this.local) return this.local.result();
    const result = await new Promise<LoudnessResult>((resolve) => {
      this.finished = resolve;
      this.worker?.postMessage({ type: 'finish' } satisfies MeterMessage);
    });
    if (this.failure) throw this.failure;
    return result;
  }

  close(): void {
    this.worker?.terminate();
  }
}
