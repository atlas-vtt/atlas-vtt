/**
 * Debounces saving explored memory into the scene, and never into a different scene: a save
 * scheduled on one map is dropped if the view has moved to another by the time it fires.
 * A save waits until the memory has rested for `delay` (a save reads the whole memory back and
 * encodes it, tens of milliseconds the window stands still: never in the middle of a drag), but
 * no longer than `maxWait` after the first change it holds. `flush` saves at once, for the moment
 * before a map unloads.
 */
export class ExploredSaveScheduler {
  private timer: number | null = null;
  private scheduledFor: string | null = null;
  /** When the first change the pending save holds was made. */
  private firstAt = 0;

  constructor(
    private readonly currentMapPath: () => string | null,
    private readonly save: () => void,
    private readonly delay: number,
    private readonly maxWait = delay * 15,
    private readonly now: () => number = () => performance.now(),
  ) {}

  schedule(): void {
    const now = this.now();
    if (this.timer === null) {
      this.scheduledFor = this.currentMapPath();
      this.firstAt = now;
    } else {
      window.clearTimeout(this.timer);
    }
    const wait = Math.max(0, Math.min(this.delay, this.firstAt + this.maxWait - now));
    this.timer = window.setTimeout(() => this.run(), wait);
  }

  flush(): void {
    if (this.timer !== null) this.run();
  }

  cancel(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private run(): void {
    this.cancel();
    if (this.currentMapPath() === this.scheduledFor) this.save();
  }
}
