/** Files read for their length at one time: a row in view never waits long, and fast scrolling asks little of the disk. */
const AT_ONCE = 2;

/**
 * How long files play, read from their metadata as rows come into view and kept for the session. The
 * newest question goes first: a row that scrolled out long ago can wait.
 */
export class SoundLengths {
  private readonly known = new Map<string, number | null>();
  private readonly asked: { key: string; url: string }[] = [];
  private readonly pending = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private running = 0;
  private stopped = false;

  constructor(private readonly probe: (url: string) => Promise<number | null>) {}

  /** Seconds; null where it cannot be told, undefined while that is not known yet. */
  secondsOf(key: string, url: string | null): number | null | undefined {
    if (this.known.has(key)) return this.known.get(key);
    if (url === null) return null;
    if (!this.pending.has(key)) {
      this.pending.add(key);
      this.asked.push({ key, url });
      this.drain();
    }
    return undefined;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    this.stopped = true;
    this.asked.length = 0;
    this.listeners.clear();
  }

  private drain(): void {
    while (this.running < AT_ONCE && !this.stopped) {
      const next = this.asked.pop();
      if (!next) return;
      this.running++;
      void this.probe(next.url).catch(() => null).then((seconds) => {
        this.running--;
        this.pending.delete(next.key);
        this.known.set(next.key, seconds);
        for (const listener of [...this.listeners]) listener();
        this.drain();
      });
    }
  }
}
