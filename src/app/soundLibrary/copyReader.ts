import { hasAtlasMark } from '../sound/codec/atlasMark';
import { readAtlasCopy, type AtlasCopyFacts } from '../sound/codec/atlasOpus';
import { SoundImportError } from '../sound/codec/demux/demuxTypes';
import type { FileRanges } from '../sound/codec/fileRanges';
import type { SoundLocation } from './soundLocation';

/** Files read for what they say of themselves at once: a start asks of every file in the folders. */
const READING_AT_ONCE = 8;

/**
 * How long one sound's files may take to say what they are once their turn came: a dead network share holds
 * the reads that wait behind it. A file that took longer is unknown for now, never taken for a source.
 */
export const FACTS_STUCK_MS = 10_000;

interface Waiter {
  key: string;
  start: () => void;
}

/** Reads what files in a folder say of themselves, from their first pages and last page, a few sounds at a time. */
export class CopyReader {
  private reading = 0;
  private waiting: Waiter[] = [];

  constructor(private readonly stuckMs = FACTS_STUCK_MS) {}

  /**
   * Runs one sound's reads in its turn and gives `unknown` where they take longer than `stuckMs` from the moment
   * they began. Nothing cancels the reads themselves, so the turn is given back only when they settle: reads
   * on a dead share never outnumber the turns.
   */
  async within<T>(key: string, work: () => Promise<T>): Promise<T | 'unknown'> {
    await this.turn(key);
    const running = work();
    const release = (): void => this.done();
    void running.then(release, release);
    let timer = 0;
    const stuck = new Promise<'unknown'>((resolve) => {
      timer = window.setTimeout(() => resolve('unknown'), this.stuckMs);
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
    try {
      const stat = await location.stat(path);
      if (!stat) return null;
      const ranges: FileRanges = { size: stat.size, read: (start, end) => location.readRange(path, start, end) };
      const facts = await readAtlasCopy(ranges);
      if (!facts && refuse && (await hasAtlasMark(ranges))) throw new SoundImportError('unreadable', `${path} was made by Atlas and its facts do not read.`);
      return facts;
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

  private turn(key: string): Promise<void> {
    if (this.reading < READING_AT_ONCE) {
      this.reading++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push({ key, start: resolve }));
  }

  private done(): void {
    const next = this.waiting.shift();
    if (next) next.start();
    else this.reading--;
  }
}
