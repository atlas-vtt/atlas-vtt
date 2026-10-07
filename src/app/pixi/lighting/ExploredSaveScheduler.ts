/**
 * Debounces saving explored memory into the scene, and never into a different scene: a save
 * scheduled on one map is dropped if the view has moved to another by the time it fires.
 * `flush` saves at once, for the moment before a map unloads.
 */
export class ExploredSaveScheduler {
  private timer: number | null = null;
  private scheduledFor: string | null = null;

  constructor(
    private readonly currentMapPath: () => string | null,
    private readonly save: () => void,
    private readonly delay: number,
  ) {}

  schedule(): void {
    if (this.timer !== null) return;
    this.scheduledFor = this.currentMapPath();
    this.timer = window.setTimeout(() => this.run(), this.delay);
  }

  /** The map was renamed: a save scheduled for it is made under its new path. */
  retarget(from: string | null, to: string | null): void {
    if (this.timer !== null && this.scheduledFor === from) this.scheduledFor = to;
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
