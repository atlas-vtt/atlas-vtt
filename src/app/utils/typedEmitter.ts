type Listener = (...args: unknown[]) => void;

interface Entry {
  listener: Listener;
  once: boolean;
  fired: boolean;
}

/**
 * Node's `EventEmitter` as far as Atlas uses it, without Node: Obsidian's mobile apps have no
 * `events` module. Listeners are called at once, in the order they were added, with the emitter
 * as `this`; an emit goes through the listeners there were when it began, so a listener may remove
 * itself or another, and one added meanwhile waits for the next emit. A listener that throws ends
 * the emit and the error reaches the caller.
 */
export class EventEmitter {
  /** Never changed in place: an emit under way keeps the list it started with. */
  private readonly entries = new Map<string, readonly Entry[]>();

  on<Args extends unknown[]>(event: string, listener: (...args: Args) => void): this {
    return this.add(event, listener as Listener, false);
  }

  once<Args extends unknown[]>(event: string, listener: (...args: Args) => void): this {
    return this.add(event, listener as Listener, true);
  }

  /** Removes the listener as it was added last, if it was added more than once. */
  off<Args extends unknown[]>(event: string, listener: (...args: Args) => void): this {
    const list = this.entries.get(event) ?? [];
    const last = list.map(entry => entry.listener).lastIndexOf(listener as Listener);
    if (last >= 0) this.setList(event, list.filter((_, index) => index !== last));
    return this;
  }

  /** Whether anyone was listening. */
  emit(event: string, ...args: unknown[]): boolean {
    const list = this.entries.get(event);
    if (!list) return false;
    for (const entry of list) {
      if (entry.once) {
        // An emit of the same event from an earlier listener has called it already.
        if (entry.fired) continue;
        entry.fired = true;
        this.removeEntry(event, entry);
      }
      Reflect.apply(entry.listener, this, args);
    }
    return true;
  }

  removeAllListeners(): this {
    this.entries.clear();
    return this;
  }

  listenerCount(event: string): number {
    return this.entries.get(event)?.length ?? 0;
  }

  private add(event: string, listener: Listener, once: boolean): this {
    this.setList(event, [...(this.entries.get(event) ?? []), { listener, once, fired: false }]);
    return this;
  }

  private removeEntry(event: string, entry: Entry): void {
    const list = this.entries.get(event);
    if (list?.includes(entry)) this.setList(event, list.filter(other => other !== entry));
  }

  private setList(event: string, list: readonly Entry[]): void {
    if (list.length) this.entries.set(event, list);
    else this.entries.delete(event);
  }
}
