/** The clock and timers a pacer runs on: the window's in Obsidian, fakes in tests. */
export interface PacerClock {
  now(): number;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/**
 * Runs work at most once every `interval` milliseconds: a request runs it now, or once the
 * interval since the last run has passed, however many requests come meanwhile; the last request
 * is always followed by a run.
 */
export class Pacer {
  private readonly clock: PacerClock;
  private readonly interval: number;
  private readonly work: () => void;
  private lastAt = Number.NEGATIVE_INFINITY;
  private timer: number | undefined;

  constructor(clock: PacerClock, interval: number, work: () => void) {
    this.clock = clock;
    this.interval = interval;
    this.work = work;
  }

  request(): void {
    if (this.timer !== undefined) return;
    const wait = this.lastAt + this.interval - this.clock.now();
    if (wait <= 0) return this.run();
    this.timer = this.clock.setTimer(() => {
      this.timer = undefined;
      this.run();
    }, wait);
  }

  /** Drops a run that waits; the next request runs as if none had run before. */
  cancel(): void {
    if (this.timer !== undefined) this.clock.clearTimer(this.timer);
    this.timer = undefined;
    this.lastAt = Number.NEGATIVE_INFINITY;
  }

  private run(): void {
    this.lastAt = this.clock.now();
    this.work();
  }
}
