/** Files read for their length at one time: a row in view never waits long, and fast scrolling asks little of the disk. */
const AT_ONCE = 2;
/** At one time while a sort by length waits for a whole list: each read is a media element that waits on the disk, so more run side by side. */
export const ALL_AT_ONCE = 8;

/**
 * How long files play, read from their metadata as rows come into view and kept for the session. The
 * newest question goes first: a row that scrolled out long ago can wait.
 */
export class SoundLengths {
  private readonly known = new Map<string, number | null>();
  private readonly asked: { key: string; url: string }[] = [];
  /** Asked for a whole list, first asked first read, after every row in view. */
  private listed: { key: string; url: string }[] = [];
  /** The next of `listed` to read: a shift per read would move thousands of entries each time. */
  private listedAt = 0;
  private readonly pending = new Set<string>();
  /** Keys a whole list waits for, wherever they were first asked: while any is still to come, more are read at once. */
  private readonly forList = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private running = 0;
  private stopped = false;

  constructor(private readonly probe: (url: string) => Promise<number | null>) {}

  /** Seconds; null where it cannot be told, undefined while that is not known yet. A row in view asks; a whole list asks `forList`, behind the rows in view. */
  secondsOf(key: string, url: string | null, forList = false): number | null | undefined {
    if (this.known.has(key)) return this.known.get(key);
    if (url === null) return null;
    if (forList) this.forList.add(key);
    if (!this.pending.has(key)) {
      this.pending.add(key);
      (forList ? this.listed : this.asked).push({ key, url });
    }
    this.drain();
    return undefined;
  }

  /** Whether the answer for a key is in, without asking. */
  knows(key: string): boolean {
    return this.known.has(key);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    this.stopped = true;
    this.asked.length = 0;
    this.listed = [];
    this.listedAt = 0;
    this.forList.clear();
    this.listeners.clear();
  }

  private drain(): void {
    while (this.running < (this.forList.size > 0 ? ALL_AT_ONCE : AT_ONCE) && !this.stopped) {
      const next = this.asked.pop() ?? this.nextListed();
      if (!next) return;
      this.running++;
      void this.probe(next.url).catch(() => null).then((seconds) => {
        this.running--;
        this.pending.delete(next.key);
        this.forList.delete(next.key);
        this.known.set(next.key, seconds);
        for (const listener of [...this.listeners]) listener();
        this.drain();
      });
    }
  }

  private nextListed(): { key: string; url: string } | undefined {
    const next = this.listed[this.listedAt];
    if (next) this.listedAt++;
    if (this.listedAt >= this.listed.length) {
      this.listed = [];
      this.listedAt = 0;
    }
    return next;
  }
}
