/** Where the registry keeps what it remembers between sessions: Atlas's settings. */
export interface NoteKeyStore {
  read(): unknown;
  write(keys: Record<string, string[]>): void;
}

const normalized = (keys: readonly string[]): string[] => keys.map((key) => key.trim().toLowerCase()).filter(Boolean);

/**
 * Note properties that extensions keep out of collection exports and installs.
 *
 * A key is stripped while an extension has it registered (`add`) and, once remembered (`remember`), also when
 * that extension is not loaded: Atlas keeps the keys per extension id in its settings, so notes never leave the
 * vault with a property the extension meant to keep private just because the extension was switched off.
 * Only an explicit unregister (`forget`) drops a remembered key; an extension unloading does not.
 */
class BundleNoteKeys {
  private readonly live = new Map<symbol, { owner: string; keys: ReadonlySet<string> }>();
  private remembered = new Map<string, Set<string>>();
  private store: NoteKeyStore | null = null;
  private cached: ReadonlySet<string> | null = null;

  /** Registers `keys` for `owner` while it is loaded; the returned function removes them again, and calling it twice does nothing. */
  add(owner: string, keys: readonly string[]): () => void {
    const entry = Symbol(owner);
    this.live.set(entry, { owner, keys: new Set(normalized(keys)) });
    this.cached = null;
    return (): void => {
      if (this.live.delete(entry)) this.cached = null;
    };
  }

  /** Keeps `keys` for `owner` across sessions, and while it is not loaded. */
  remember(owner: string, keys: readonly string[]): void {
    const kept = this.remembered.get(owner) ?? new Set<string>();
    for (const key of normalized(keys)) kept.add(key);
    this.remembered.set(owner, kept);
    this.changed();
  }

  /** Drops `keys` from what is remembered for `owner`, except those another live registration of it still holds. */
  forget(owner: string, keys: readonly string[]): void {
    const kept = this.remembered.get(owner);
    if (!kept) return;
    const stillHeld = new Set([...this.live.values()].filter((entry) => entry.owner === owner).flatMap((entry) => [...entry.keys]));
    for (const key of normalized(keys)) if (!stillHeld.has(key)) kept.delete(key);
    if (kept.size === 0) this.remembered.delete(owner);
    this.changed();
  }

  /** Drops everything remembered for `owner`; its live registrations keep stripping until they end. */
  forgetAll(owner: string): void {
    if (this.remembered.delete(owner)) this.changed();
  }

  /** Reads what was remembered from `store` (what it holds is checked) and writes every later change to it. */
  attach(store: NoteKeyStore): void {
    this.store = store;
    const stored = store.read();
    this.remembered = new Map();
    if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
      for (const [owner, keys] of Object.entries(stored)) {
        if (!Array.isArray(keys)) continue;
        const valid = normalized(keys.filter((key): key is string => typeof key === 'string'));
        if (valid.length > 0) this.remembered.set(owner, new Set(valid));
      }
    }
    this.cached = null;
  }

  /** Stops writing; what is remembered stays in memory until the next `attach`. */
  detach(): void {
    this.store = null;
  }

  /** Every key to strip, lowercase. */
  keys(): ReadonlySet<string> {
    this.cached ??= new Set([...this.live.values()].flatMap((entry) => [...entry.keys]).concat([...this.remembered.values()].flatMap((keys) => [...keys])));
    return this.cached;
  }

  private changed(): void {
    this.cached = null;
    this.store?.write(Object.fromEntries([...this.remembered].map(([owner, keys]) => [owner, [...keys].sort()])));
  }
}

export const bundleNoteKeys = new BundleNoteKeys();
