import { hasAtlasMark } from '../sound/codec/atlasMark';
import { readAtlasCopy, type AtlasCopyFacts } from '../sound/codec/atlasOpus';
import { SoundImportError } from '../sound/codec/demux/demuxTypes';
import type { FileRanges } from '../sound/codec/fileRanges';
import type { SoundLocation } from './soundLocation';

/** Files read for what they say of themselves at once: a start asks of every file in the folders. */
const READING_AT_ONCE = 8;

/** Reads what files in a folder say of themselves, from their first pages and last page, a few at a time. */
export class CopyReader {
  private reading = 0;
  private readonly waiting: Array<() => void> = [];

  /**
   * What a file says of itself; null for any other file, one that is not there, or one that cannot be read now.
   * Where `refuse`, a file marked by Atlas whose facts do not read is refused as damaged.
   */
  async factsAt(location: SoundLocation, path: string, refuse: boolean): Promise<AtlasCopyFacts | null> {
    await this.turn();
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
    } finally {
      this.done();
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

  private turn(): Promise<void> {
    if (this.reading < READING_AT_ONCE) {
      this.reading++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private done(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.reading--;
  }
}
