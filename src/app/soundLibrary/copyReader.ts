import { readMarkedCopy } from '../sound/codec/atlasMark';
import { readAtlasCopy, type AtlasCopyFacts } from '../sound/codec/atlasOpus';
import { SoundImportError } from '../sound/codec/demux/demuxTypes';
import type { FileRanges } from '../sound/codec/fileRanges';
import type { SoundLocation } from './soundLocation';

/** Files read for what they say of themselves at once: a start asks of every file in the folders. */
const READING_AT_ONCE = 8;

/**
 * How long one sound's files may take to say what they are once their turn came: a dead network share holds
 * the reads that wait behind it. A file that took longer is unknown for now, never taken for a source. A sound
 * that has waited this long for a turn while every turn is held by such reads is unknown too, and is not read.
 */
export const FACTS_STUCK_MS = 10_000;

interface Waiter {
  key: string;
  start: (granted: boolean) => void;
  timer: number | null;
}

/** Reads what files in a folder say of themselves, from their first pages and last page, a few sounds at a time. */
export class CopyReader {
  private reading = 0;
  /** Reads that still hold their turn past `stuckMs`. */
  private overdue = 0;
  private waiting: Waiter[] = [];

  constructor(private readonly stuckMs = FACTS_STUCK_MS) {}

  /**
   * Runs one sound's reads in its turn and gives `unknown` where they take longer than `stuckMs` from the moment
   * they began. Nothing cancels the reads themselves, so the turn is given back only when they settle: reads
   * on a dead share never outnumber the turns. Always settles: a sound that waits `stuckMs` while every turn
   * is held by overdue reads gives `unknown` without reading.
   */
  async within<T>(key: string, work: () => Promise<T>): Promise<T | 'unknown'> {
    if (!(await this.turn(key))) return 'unknown';
    const running = (async (): Promise<T> => work())();
    let settled = false;
    let late = false;
    const release = (): void => {
      settled = true;
      this.done(late);
    };
    void running.then(release, release);
    let timer = 0;
    const stuck = new Promise<'unknown'>((resolve) => {
      timer = window.setTimeout(() => {
        if (!settled) {
          late = true;
          this.markOverdue();
        }
        resolve('unknown');
      }, this.stuckMs);
    });
    try {
      return await Promise.race([running, stuck]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** Moves a sound's reads that still wait for their turn to the front. */
  hurry(key: string): void {
    const at = this.waiting.findIndex((waiter) => waiter.key === key);
    if (at <= 0) return;
    const [waiter] = this.waiting.splice(at, 1);
    if (waiter) this.waiting.unshift(waiter);
  }

  /**
   * What a file says of itself; null for any other file, one that is not there, or one that cannot be read now.
   * Where `refuse`, a file marked by Atlas whose facts do not read is refused as damaged.
   */
  async factsAt(location: SoundLocation, path: string, refuse: boolean): Promise<AtlasCopyFacts | null> {
    return (await this.copyAt(location, path, refuse))?.facts ?? null;
  }

  /** As `factsAt`, with the size the file had when it was read. */
  async copyAt(location: SoundLocation, path: string, refuse: boolean): Promise<{ facts: AtlasCopyFacts; size: number } | null> {
    try {
      const stat = await location.stat(path);
      if (!stat) return null;
      const ranges: FileRanges = { size: stat.size, read: (start, end) => location.readRange(path, start, end) };
      const facts = refuse ? await readMarkedCopy(ranges, path) : await readAtlasCopy(ranges);
      return facts && { facts, size: stat.size };
    } catch (error) {
      if (error instanceof SoundImportError) throw error;
      console.error(`[Atlas] Could not read ${path}`, error);
      return null;
    }
  }

  /** Whether the copy at `path` is whole on disk: its size, and the key its own header says. */
  async stands(location: SoundLocation, path: string, key: string, size: number): Promise<boolean> {
    try {
      const stat = await location.stat(path);
      return stat?.size === size && (await this.factsAt(location, path, false))?.key === key;
    } catch {
      return false;
    }
  }

  /** Whether every turn is held by a read past its own time: then nothing turns over until one settles. */
  private get allOverdue(): boolean {
    return this.reading >= READING_AT_ONCE && this.overdue >= this.reading;
  }

  private turn(key: string): Promise<boolean> {
    if (this.reading < READING_AT_ONCE) {
      this.reading++;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const waiter: Waiter = { key, start: resolve, timer: null };
      this.waiting.push(waiter);
      if (this.allOverdue) this.arm(waiter);
    });
  }

  private markOverdue(): void {
    this.overdue++;
    if (this.allOverdue) for (const waiter of this.waiting) this.arm(waiter);
  }

  /** A waiter gives up once it has waited `stuckMs` with every turn stuck the whole time. */
  private arm(waiter: Waiter): void {
    if (waiter.timer !== null) return;
    waiter.timer = window.setTimeout(() => {
      this.waiting = this.waiting.filter((other) => other !== waiter);
      waiter.start(false);
    }, this.stuckMs);
  }

  private disarm(waiter: Waiter): void {
    if (waiter.timer !== null) window.clearTimeout(waiter.timer);
    waiter.timer = null;
  }

  private done(late: boolean): void {
    if (late) {
      this.overdue--;
      for (const waiter of this.waiting) this.disarm(waiter);
    }
    const next = this.waiting.shift();
    if (!next) {
      this.reading--;
      return;
    }
    this.disarm(next);
    next.start(true);
  }
}
