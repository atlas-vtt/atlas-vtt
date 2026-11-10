/**
 * Pending writes per note path. A path's items run together: after a delay (disk writes coalesce),
 * or at once on a flush. Runs of one path never overlap: a run waits for the one in flight, so
 * every write lands on the text the previous one left. A run that finishes synchronously (an
 * editor transaction) holds nothing up, so writes to an open note land in the order they come.
 */

type Run<T> = (path: string, items: T[]) => Promise<void> | void;

export class WriteQueue<T> {
  private readonly items = new Map<string, T[]>();
  private readonly timers = new Map<string, number>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly run: Run<T>) {}

  add(path: string, item: T): void {
    const items = this.items.get(path);
    if (items) items.push(item);
    else this.items.set(path, [item]);
  }

  /** Runs the path's items after `delayMs`, unless a run is planned already: the window does not move with later writes. */
  schedule(path: string, delayMs: number): void {
    if (this.timers.has(path)) return;
    this.timers.set(path, window.setTimeout(() => {
      this.timers.delete(path);
      void this.flush(path);
    }, delayMs));
  }

  /** Runs the path's items now, or right after the run in flight; resolves once they are done. */
  flush(path: string): Promise<void> {
    const inFlight = this.running.get(path);
    if (inFlight) return inFlight.then(() => this.flush(path));
    this.cancelTimer(path);
    const items = this.items.get(path);
    if (!items) return Promise.resolve();
    this.items.delete(path);
    const done = this.run(path, items);
    if (!done) return Promise.resolve();
    const tracked = done
      .catch((error: unknown) => { console.error(`[Atlas] Writing ${path} failed:`, error); })
      .finally(() => { if (this.running.get(path) === tracked) this.running.delete(path); });
    this.running.set(path, tracked);
    return tracked;
  }

  /** Runs every pending item and waits for every run in flight. */
  async flushAll(): Promise<void> {
    const paths = new Set([...this.items.keys(), ...this.running.keys()]);
    await Promise.all([...paths].map((path) => this.flush(path)));
  }

  /** Paths with items waiting or a run in flight at or below `path` (a note, or a folder). */
  pathsWithin(path: string): string[] {
    const paths = new Set([...this.items.keys(), ...this.running.keys()]);
    return [...paths].filter((candidate) => candidate === path || candidate.startsWith(`${path}/`));
  }

  /** The note was renamed: its waiting items go with it. A run in flight finishes on the file it started with. */
  move(from: string, to: string): void {
    const items = this.items.get(from);
    this.cancelTimer(from);
    if (!items) return;
    this.items.delete(from);
    for (const item of items) this.add(to, item);
  }

  /** Forgets the timers; items not flushed stay unwritten. Callers flush first. */
  clear(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
  }

  private cancelTimer(path: string): void {
    const timer = this.timers.get(path);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.timers.delete(path);
  }
}
