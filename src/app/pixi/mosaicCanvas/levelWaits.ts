import type { StoredLevel } from './tesseraBlobs';
import type { TesseraEvent } from './tesseraProtocol';

interface Waiter {
  readonly hash: string;
  readonly level: number;
  readonly settle: (level: StoredLevel | null) => void;
  readonly fail: (error: unknown) => void;
}

/**
 * Requests that wait for a level of a pyramid to be stored whole: answered at once where the cache
 * holds it, else as the build's batches land (its `progress` and `complete` events), never by polling.
 * A waiter outlives builds that stop or give way, since a later build of the same map resumes and
 * stores the level; whoever waits cancels it, or loses it with the worker.
 */
export class LevelWaits {
  private readonly waiters = new Map<number, Waiter>();
  /** Hashes being read now, and whether news came in meanwhile, so they are read once more. */
  private readonly reading = new Map<string, boolean>();

  constructor(private readonly read: (hash: string, level: number) => Promise<StoredLevel | null>) {}

  /** The level once all its tesserae are stored; null once cancelled. Rejects for a level outside the pyramid. */
  wait(id: number, hash: string, level: number): Promise<StoredLevel | null> {
    return new Promise((settle, fail) => {
      this.waiters.set(id, { hash, level, settle, fail });
      this.look(hash);
    });
  }

  /** A build stored tesserae or ended complete: its waiters look again. */
  heard(event: TesseraEvent): void {
    if (event.type === 'progress' || event.type === 'complete') this.look(event.hash);
  }

  cancel(id: number): void {
    const waiter = this.waiters.get(id);
    if (!waiter) return;
    this.waiters.delete(id);
    waiter.settle(null);
  }

  dispose(): void {
    for (const id of [...this.waiters.keys()]) this.cancel(id);
  }

  private look(hash: string): void {
    if (this.reading.has(hash)) {
      this.reading.set(hash, true);
      return;
    }
    this.reading.set(hash, false);
    void this.readAll(hash);
  }

  private async readAll(hash: string): Promise<void> {
    try {
      do {
        this.reading.set(hash, false);
        for (const [id, waiter] of [...this.waiters].filter(([, candidate]) => candidate.hash === hash)) {
          const level = await this.read(hash, waiter.level).catch((error: unknown) => (this.take(id, waiter)?.fail(error), null));
          if (level) this.take(id, waiter)?.settle(level);
        }
      } while (this.reading.get(hash) === true);
    } finally {
      this.reading.delete(hash);
    }
  }

  /** The waiter, taken out, while it is still the one under its id. */
  private take(id: number, waiter: Waiter): Waiter | undefined {
    if (this.waiters.get(id) !== waiter) return undefined;
    this.waiters.delete(id);
    return waiter;
  }
}
