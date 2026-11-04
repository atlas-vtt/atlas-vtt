import { isNewerRelease } from '../changelog/version';

/** Device-local: the newest version the GM acted on in its notice (Update, What's new, or closed it). */
export const UPDATE_STORAGE_KEY = 'atlas-vtt:update-announced';

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
}

/**
 * Knows whether a newer Atlas is out and says so until the GM acts on the notice: once per start of
 * Atlas, so a notice shown while nobody looked (a window behind others, a vault closed at once)
 * comes back the next time. It only looks: Obsidian's own updater installs, so Atlas never
 * downloads or replaces its files.
 */
export class UpdateWatch {
  private newest: string | null = null;
  private running: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  /** The release this run of Atlas has shown its notice for: the hourly look never shows a second one. */
  private shown: string | null = null;

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

  private async look(): Promise<void> {
    const published = await this.deps.readPublished();
    // A failed look keeps what an earlier one found; the next one tries again.
    if (published === null) return;
    this.newest = isNewerRelease(published, this.deps.installed) ? published : null;
    const newest = this.newest;
    const announced = this.deps.announced.get();
    if (newest && newest !== this.shown && (announced === null || isNewerRelease(newest, announced))) {
      this.shown = newest;
      this.deps.announce(newest, () => this.deps.announced.set(newest));
    }
  }

  private changed(): void {
    this.listeners.forEach(listener => listener());
  }
}
