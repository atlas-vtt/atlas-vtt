import type { SoundRecord } from '../sound/soundTypes';

/**
 * Sources being converted in the background together hold at most about this much: each is in the browser
 * process as a Blob while it converts. Once this much is in flight no other starts; one always may.
 */
export const IN_FLIGHT_BYTES = 1024 ** 3;

/** How far the background's work has come since it last stood empty. */
export interface BackgroundProgress {
  done: number;
  total: number;
  paused: boolean;
}

/**
 * Copies made at once in the background: each takes a worker and an encoder's thread, and holds its source
 * and its copy in memory, so a few, never one per core. What the GM pressed may always take one more.
 */
export function backgroundCopies(cores: number = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2): number {
  return Math.max(1, Math.min(3, Math.floor(cores / 4)));
}

interface Running {
  bytes: number;
  counted: boolean;
}

/**
 * The order copies are made in: what the GM pressed first and at once beside the rest, the background a few
 * at a time within `IN_FLIGHT_BYTES`, and held while paused. A press is never held.
 */
export class CopyQueue {
  private waiting: SoundRecord[] = [];
  private readonly pressed = new Set<string>();
  private readonly running = new Map<string, Running>();
  /** Background records asked for since the background last stood empty, still waiting. */
  private readonly counted = new Set<string>();
  private total = 0;
  private done = 0;
  private paused = false;
  private disposed = false;

  constructor(
    private readonly parallel: number,
    private readonly sizeOf: (record: SoundRecord) => number,
    private readonly run: (record: SoundRecord) => Promise<void>,
    private readonly onChange: () => void,
  ) {}

  add(records: readonly SoundRecord[], urgent: boolean): void {
    if (this.disposed) return;
    const fresh = records.filter((record) => !this.running.has(record.id));
    const ids = new Set(fresh.map((record) => record.id));
    if (urgent) {
      this.waiting = [...fresh, ...this.waiting.filter((record) => !ids.has(record.id))];
      for (const id of ids) this.pressed.add(id);
    } else {
      for (const record of fresh) {
        if (this.waiting.some((other) => other.id === record.id)) continue;
        this.waiting.push(record);
        this.counted.add(record.id);
        this.total++;
      }
    }
    this.pump();
    this.onChange();
  }

  background(): BackgroundProgress | null {
    return this.total === 0 ? null : { done: this.done, total: this.total, paused: this.paused };
  }

  pause(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.pump();
    this.onChange();
  }

  dispose(): void {
    this.disposed = true;
    this.waiting = [];
    this.pressed.clear();
  }

  private inFlight(): number {
    let bytes = 0;
    for (const { bytes: held } of this.running.values()) bytes += held;
    return bytes;
  }

  private mayStart(record: SoundRecord): boolean {
    if (this.pressed.has(record.id)) return this.running.size < this.parallel + 1;
    if (this.paused || this.running.size >= this.parallel) return false;
    return this.running.size === 0 || this.inFlight() < IN_FLIGHT_BYTES;
  }

  /** Starts what the front may: a press is never held behind a long file, the background stays within its slots and bytes. */
  private pump(): void {
    for (let next = this.waiting[0]; next && !this.disposed; next = this.waiting[0]) {
      if (!this.mayStart(next)) return;
      this.waiting.shift();
      const counted = this.counted.delete(next.id);
      const record = next;
      this.running.set(record.id, { bytes: this.sizeOf(record), counted });
      void this.run(record).finally(() => this.finished(record.id));
    }
  }

  private finished(id: string): void {
    const running = this.running.get(id);
    this.running.delete(id);
    this.pressed.delete(id);
    if (running?.counted) this.done++;
    if (this.counted.size === 0 && ![...this.running.values()].some((one) => one.counted)) {
      this.total = 0;
      this.done = 0;
    }
    this.pump();
    this.onChange();
  }
}
