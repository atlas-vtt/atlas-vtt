/** How far back the speed looks: long enough to smooth over files that land seconds apart, short enough to follow a change. */
const WINDOW_MS = 8000;
/** No speed is named before the meter has watched this long: the first file's arrival alone says little. */
const MIN_SPAN_MS = 1500;

interface Sample {
  time: number;
  bytes: number;
}

/**
 * A job's speed, from the bytes it fetched over the last few seconds. Bytes arrive a whole file at a time (Obsidian's
 * `requestUrl` reports none on the way), so the rate is measured over a sliding window up to now: a stall pulls it
 * down as the seconds pass without a file, instead of holding the last burst.
 */
export class SpeedMeter {
  private readonly samples: Sample[];

  constructor(start: number) {
    this.samples = [{ time: start, bytes: 0 }];
  }

  /** `bytes` is the job's total fetched so far, at `time`. */
  record(bytes: number, time: number): void {
    this.samples.push({ time, bytes });
    this.prune(time);
  }

  /** Bytes a second, or null while too little has been watched or nothing came yet. */
  rate(now: number): number | null {
    this.prune(now);
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last) return null;
    const span = now - first.time;
    const bytes = last.bytes - first.bytes;
    if (span < MIN_SPAN_MS || bytes <= 0) return null;
    return bytes / (span / 1000);
  }

  /** Keeps the newest sample at or before the window's start as its base, and everything after it. */
  private prune(now: number): void {
    while (this.samples.length > 2 && (this.samples[1]?.time ?? now) <= now - WINDOW_MS) this.samples.shift();
  }
}
