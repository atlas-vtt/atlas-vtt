import { acceptsListener } from '../../api/listenerCheck';
import type { Disposer } from '../../api/types/common';

/** An extension's callback must never throw into Atlas's store, pointer handling or frame loop. */
export function callGuarded<A extends unknown[], R>(what: string, listener: (...args: A) => R, ...args: A): R | undefined {
  try {
    return listener(...args);
  } catch (error) {
    console.error(`[Atlas API] A remote view ${what} listener failed:`, error);
    return undefined;
  }
}

/**
 * Listeners that are dropped all at once when the view closes. Each registration is its own entry, so the same function
 * added twice runs twice, and each disposer removes only its own registration, once.
 */
export class ListenerSet<L> {
  private readonly entries = new Set<{ readonly listener: L }>();
  private closed = false;

  /** `method`: the `RemoteView` method that adds to this set, named when it refuses a listener. */
  constructor(private readonly method: string) {}

  add(listener: L): Disposer {
    if (!acceptsListener(`RemoteView.${this.method}`, listener) || this.closed) return () => undefined;
    const entry = { listener };
    this.entries.add(entry);
    return () => { this.entries.delete(entry); };
  }

  list(): L[] {
    return [...this.entries].map((entry) => entry.listener);
  }

  close(): void {
    this.closed = true;
    this.entries.clear();
  }
}
