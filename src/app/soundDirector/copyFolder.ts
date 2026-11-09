import type { AtlasCopyFacts } from '../sound/codec/atlasOpus';
import type { SoundRecord } from '../sound/soundTypes';
import type { OriginalsChoice } from '../soundLibrary/SoundRoots';

/** An Atlas-made copy in the folder: what its file says of itself, and the path a record names it by. */
export interface FolderCopy {
  facts: AtlasCopyFacts;
  audioPath: string;
}

/** What a source measured before it was read, so a source rewritten while it converted is not mistaken for what was converted. */
export interface SourceStat {
  size: number;
  mtime: number;
}

/**
 * Where a device keeps the copies of its sounds: Atlas-made Opus files in the GM's own linked folders, beside
 * what they were made from, never in hidden storage. A file says what it is in its own header, so nothing
 * about a converted file is worked out again. Nothing converts in a folder before the GM chose what happens
 * to its originals.
 */
export interface CopyFolder {
  /** The GM's choice for the root the sound lies in; null while not agreed (nothing converts). */
  choiceFor(sound: SoundRecord): OriginalsChoice | null;
  /** Whether the sound's file lies outside every linked folder, where nothing converts. */
  outside(sound: SoundRecord): boolean;
  /**
   * What the sound's file says of itself; null for a source (or a file that cannot be read now); `unknown` where
   * its reads took too long once they began (a dead share), which is never taken for a source. Always settles.
   * A file that carries Atlas' mark beside facts that do not read is refused with `SoundImportError`.
   */
  factsOf(sound: SoundRecord): Promise<FolderCopy | null | 'unknown'>;
  /** Moves the sound's reads that still wait for their turn to the front: it was pressed. */
  hurry(sound: SoundRecord): void;
  /**
   * Puts a finished copy in the folder and deals with the source as chosen; returns the copy's audioPath.
   * A copy that cannot be written is refused with `SoundImportError('cannot-write')`, the source untouched.
   */
  store(sound: SoundRecord, copy: Blob, choice: OriginalsChoice, sourceStat: SourceStat): Promise<string>;
  /** A copy's bytes, by the path `factsOf` or `store` gave. */
  blob(audioPath: string): Promise<Blob>;
}
