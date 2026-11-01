import { isNewerRelease } from '../changelog/version';

/** Device-local: the newest version the GM acted on in its notice (Update, What's new, or closed it). */
export const UPDATE_STORAGE_KEY = 'atlas-vtt:update-announced';
/** Device-local: when a notice first had to wait because Atlas was in use. */
export const UPDATE_HELD_STORAGE_KEY = 'atlas-vtt:update-held-since';
/** How long a notice waits at most, or a GM who always keeps a map open would stay on an old version for good. */
export const MAX_HOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface UpdateWatchDeps {
  installed: string;
  /** The release Obsidian would install now, or null when it cannot be told (`readPublishedVersion`). */
  readPublished: () => Promise<string | null>;
  /** The GM's switch, Settings → Updates. */
  enabled: () => boolean;
  online: () => boolean;
  /** The newest version the GM acted on in a notice; one at or above a release silences it. */
  announced: { get(): string | null; set(version: string): void };
  /** Shows the notice; `acted` is called once the GM uses it (Update, What's new, close). */
  announce: (version: string, acted: () => void) => void;
  /** Whether the GM is preparing or playing: the notice waits meanwhile. */
  inUse: () => boolean;
  /** When a notice first had to wait; a newer release does not start it anew. */
  heldSince: { get(): number | null; set(at: number | null): void };
  now: () => number;
}

/**
 * Knows whether a newer Atlas is out and says so until the GM acts on the notice: once per start of
 * Atlas, so a notice shown while nobody looked (a window behind others, a vault closed at once)
 * comes back the next time. While Atlas is in use the notice waits for a quiet moment, at most
 * `MAX_HOLD_MS`. It only looks: Obsidian's own updater installs, so Atlas never downloads or
 * replaces its files.
 */
export class UpdateWatch {
  private newest: string | null = null;
  private running: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  /** The release this run of Atlas has shown its notice for: the hourly look never shows a second one. */
  private shown: string | null = null;
  /** Whether a notice waits for Atlas to fall quiet. */
  private held = false;

  constructor(private readonly deps: UpdateWatchDeps) {}

  /** The newest release above the installed one, or null. */
  available(): string | null {
    return this.newest;
  }

  isChecking(): boolean {
    return this.running !== null;
  }

  /** Hears every change of `available()` and `isChecking()`; returns the unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Looks once; `force` (Check now) looks while switched off or offline too. One look at a time. */
  check(options: { force?: boolean } = {}): Promise<void> {
    if (this.running) return this.running;
    if (!options.force && (!this.deps.enabled() || !this.deps.online())) return Promise.resolve();
    this.running = this.look().finally(() => {
      this.running = null;
      this.changed();
    });
    this.changed();
    return this.running;
  }

  /** Atlas may have fallen quiet (a map view or the player window closed): a waiting notice shows now. */
  quietMoment(): void {
    if (this.held && this.deps.enabled()) this.announceIfDue();
  }

  private async look(): Promise<void> {
    const published = await this.deps.readPublished();
    // A failed look keeps what an earlier one found; the next one tries again.
    if (published !== null) this.newest = isNewerRelease(published, this.deps.installed) ? published : null;
    this.announceIfDue();
  }

  private announceIfDue(): void {
    const newest = this.newest;
    const announced = this.deps.announced.get();
    this.held = false;
    if (!newest || (announced !== null && !isNewerRelease(newest, announced))) {
      if (this.deps.heldSince.get() !== null) this.deps.heldSince.set(null);
      return;
    }
    if (newest === this.shown) return;
    if (this.deps.inUse() && !this.heldLongEnough()) {
      this.held = true;
      return;
    }
    this.shown = newest;
    this.deps.announce(newest, () => {
      this.deps.announced.set(newest);
      this.deps.heldSince.set(null);
    });
  }

  /** Starts the wait if none runs. A time ahead of the clock can never be reached, so it starts anew too. */
  private heldLongEnough(): boolean {
    const now = this.deps.now();
    const since = this.deps.heldSince.get();
    if (since === null || since > now) {
      this.deps.heldSince.set(now);
      return false;
    }
    return now - since >= MAX_HOLD_MS;
  }

  private changed(): void {
    this.listeners.forEach(listener => listener());
  }
}
