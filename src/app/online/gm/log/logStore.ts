import type { SavedLog } from './logEntries.ts';

/** Where the running table's log is kept (the companion's data), so a reload comes back to it; null clears it. */
export interface LogStore {
  read(): unknown;
  write(log: SavedLog | null): void;
}

const NO_LOG_STORE: LogStore = { read: () => undefined, write: () => undefined };

/**
 * The running table's log as the GM's side of online play keeps and announces it: kept in the
 * store with every change, forgotten with its table, and told to whoever draws it.
 */
export class LogKeeper {
  private readonly store: LogStore;
  private readonly listeners = new Set<() => void>();

  constructor(store: LogStore = NO_LOG_STORE) {
    this.store = store;
  }

  /** Hears every change of the running table's log (a message, a roll, a reaction), and when a table starts or ends. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The log as kept, for a table that comes back after a reload. */
  saved(): unknown {
    return this.store.read();
  }

  /** Keeps the log as it is now and tells the listeners. */
  keep(log: SavedLog): void {
    this.store.write(log);
    this.changed();
  }

  /** Forgets the kept log: its table is gone, or a new one starts. */
  forget(): void {
    this.store.write(null);
  }

  /** Tells the listeners: the log changed, or the table it belongs to did. */
  changed(): void {
    for (const listener of this.listeners) listener();
  }
}
