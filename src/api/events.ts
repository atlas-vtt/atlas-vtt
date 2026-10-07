import type { AtlasEvents } from './types/api';

type Listener = (...args: never[]) => void;

/** Every event an extension can hear (`AtlasExtension.on`); the compiler checks the list against `AtlasEvents`. */
export const API_EVENTS = ['unload', 'map-loaded', 'map-closed', 'rules-changed', 'settings-changed', 'tabs-changed'] as const satisfies ReadonlyArray<keyof AtlasEvents>;
/** Compiles only while every event of `AtlasEvents` is in `API_EVENTS`. */
export const EVERY_EVENT_LISTED: [Exclude<keyof AtlasEvents, (typeof API_EVENTS)[number]>] extends [never] ? true : never = true;

/** One per registration, so the same function registered twice has two independent disposers. */
interface Entry {
  readonly listener: Listener;
}

/** Fans Atlas's API events out to every connected extension; a failing listener never stops the others. */
export class ApiEvents {
  private readonly listeners = new Map<keyof AtlasEvents, Set<Entry>>();

  on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const stored = set;
    const entry: Entry = { listener };
    stored.add(entry);
    return (): void => { stored.delete(entry); };
  }

  emit<E extends keyof AtlasEvents>(event: E, ...args: Parameters<AtlasEvents[E]>): void {
    for (const { listener } of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as (...values: Parameters<AtlasEvents[E]>) => void)(...args);
      } catch (error) {
        console.error(`[Atlas API] A '${String(event)}' listener failed:`, error);
      }
    }
  }

  get size(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}
