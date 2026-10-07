export interface SlotEntry<T> { owner: string; item: T }

/** What extensions add to one place in Atlas's UI, in the order they were added. */
export class SlotRegistry<T> {
  private entries: ReadonlyArray<SlotEntry<T>> = [];
  private revision = 0;
  private readonly listeners = new Set<() => void>();

  /** Adds `item` for extension `owner`; the removal is idempotent. */
  add(owner: string, item: T): () => void {
    const entry = { owner, item };
    this.entries = [...this.entries, entry];
    this.changed();
    let done = false;
    return (): void => {
      if (done) return;
      done = true;
      this.entries = this.entries.filter((candidate) => candidate !== entry);
      this.changed();
    };
  }

  list(): ReadonlyArray<SlotEntry<T>> {
    return this.entries;
  }

  /** A number that changes on add, remove and `invalidate`, for `useSyncExternalStore`. */
  version(): number {
    return this.revision;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Asks every reader to re-read the items' callbacks (badges, isActive, commands). */
  invalidate(): void {
    this.changed();
  }

  private changed(): void {
    this.revision++;
    for (const listener of [...this.listeners]) listener();
  }
}

/** Calls `read`, logging and returning `fallback` when an extension's callback throws. */
export function safely<R>(owner: string, slot: string, read: () => R, fallback: R): R {
  try {
    return read();
  } catch (error) {
    console.error(`[Atlas API] ${owner}: ${slot} failed:`, error);
    return fallback;
  }
}
