import { isNewerRelease } from '../changelog/version';

/** Device-local: the newest version this device has already been told of. */
export const UPDATE_STORAGE_KEY = 'atlas-vtt:update-announced';

export interface UpdateWatchDeps {
  installed: string;
  /** The release Obsidian would install now, or null when it cannot be told (`readPublishedVersion`). */
  readPublished: () => Promise<string | null>;
  /** The GM's switch, Settings → Updates. */
  enabled: () => boolean;
  online: () => boolean;
  announced: { get(): string | null; set(version: string): void };
  announce: (version: string) => void;
}

/**
 * Knows whether a newer Atlas is out and says so once per version. It only looks: Obsidian's own
 * updater installs, so Atlas never downloads or replaces its files.
 */
export class UpdateWatch {
  private newest: string | null = null;
  private running: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

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
    const announced = this.deps.announced.get();
    if (this.newest && (announced === null || isNewerRelease(this.newest, announced))) {
      this.deps.announced.set(this.newest);
      this.deps.announce(this.newest);
    }
  }

  private changed(): void {
    this.listeners.forEach(listener => listener());
  }
}
