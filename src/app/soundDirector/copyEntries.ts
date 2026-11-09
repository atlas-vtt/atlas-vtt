import { GrowingCopy } from '../sound/codec/growingCopy';
import type { SoundMeasure } from '../sound/codec/soundInfo';
import type { SoundImportResult, StreamSink } from '../sound/codec/soundImporter';
import type { SoundRecord } from '../sound/soundTypes';
import type { SoundConversion } from '../soundLibrary/soundConversion';
import { NOT_CONVERTED } from '../soundLibrary/soundConversion';
import { nameOfRelative } from '../soundLibrary/soundPaths';
import type { CopyFolder, FolderCopy } from './copyFolder';
import { grownGain } from './growingCopies';
import type { CopyMaker } from './soundCopies';

export const READY: SoundConversion = { state: 'ready' };

/** What a stored copy plays by. */
export interface StoredFacts {
  measure: SoundMeasure;
  peaks: Uint8Array<ArrayBuffer> | null;
}

/** What this device knows of one record's copy. */
export interface CopyEntry {
  recordId: string;
  /** The file it was worked out for: its path, size and time; `PENDING` for a copy just stored, until it is measured. */
  identity: string;
  conversion: SoundConversion;
  key: string | null;
  measure: SoundMeasure | null;
  peaks: Uint8Array<ArrayBuffer> | null;
  /** Where its stored copy lies, as a record names a file. */
  audioPath: string | null;
  /** Settles once what the file says of itself has been read. */
  known: Promise<void>;
  /** The copy while it is made, for a sound that may play before it is whole. */
  growing: GrowingCopy | null;
  /** The gain the table was last told of a growing copy, so a small move is no change. */
  toldGainDb: number | null;
}

export const identityOf = (path: string, stat: { size: number; mtime: number }): string => `${path}|${stat.size}|${stat.mtime}`;

/** The identity of a copy's entry just stored, taken from the file's first measure. */
export const PENDING = '';

export const entryKeyOf = (recordId: string, path: string): string => `${recordId}\n${path}`;

export function copyEntry(recordId: string, identity: string): CopyEntry {
  return { recordId, identity, conversion: NOT_CONVERTED, key: null, measure: null, peaks: null, audioPath: null, known: Promise.resolve(), growing: null, toldGainDb: null };
}

export function readyIn(entry: CopyEntry, key: string, facts: StoredFacts, audioPath: string): void {
  entry.key = key;
  entry.measure = facts.measure;
  entry.peaks = facts.peaks;
  entry.audioPath = audioPath;
  entry.conversion = READY;
}

/**
 * How long reading a file's first pages and last page may take: a dead network share holds the requests that wait
 * on it. A file that took longer is read whole when it converts, and plays as it is if Atlas made it.
 */
export const FACTS_STUCK_MS = 10_000;

/** What a sound's file says, or `stuck` where reading it gets nowhere: the queue must not wait on it. */
export function factsWithin(folder: CopyFolder, record: SoundRecord): Promise<FolderCopy | null | 'stuck'> {
  return new Promise((resolve, reject) => {
    const timer = self.setTimeout(() => resolve('stuck'), FACTS_STUCK_MS);
    folder.factsOf(record).then(resolve, reject).finally(() => self.clearTimeout(timer));
  });
}

export interface MakingListener {
  progress(share: number): void;
  /** The copy's first pages are here: it is known by its key from now on. */
  started(): void;
  changed(): void;
}

/** Converts a source, its pages going to a growing copy as they are written where the sound may play before it is whole. */
export async function makeCopy(maker: CopyMaker, record: SoundRecord, entry: CopyEntry, source: Blob, hash: string, listener: MakingListener): Promise<SoundImportResult> {
  const loop = record.kind === 'ambience' || record.loop !== undefined;
  const job = { source, key: hash, from: nameOfRelative(record.filePath), kind: record.kind, loop, stream: !loop };
  const sink: StreamSink = {
    start: (start) => {
      entry.growing = new GrowingCopy(start);
      entry.key = hash;
      listener.started();
    },
    pages: (pages) => {
      if (!entry.growing || entry.measure) return;
      const told = grownGain(entry.growing, pages, entry.toldGainDb, record.trimDb);
      if (told === entry.toldGainDb) return;
      entry.toldGainDb = told;
      listener.changed();
    },
  };
  return maker.run(job, (share) => listener.progress(share), sink);
}
