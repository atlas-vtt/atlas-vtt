import { GrowingCopy } from '../sound/codec/growingCopy';
import type { SoundMeasure } from '../sound/codec/soundInfo';
import type { ImportProgress, SoundImportJob, SoundImportResult, StreamSink } from '../sound/codec/soundImporter';
import type { SoundBytes, SoundRecord } from '../sound/soundTypes';
import type { AtlasCopyFacts } from '../sound/codec/atlasOpus';
import type { SoundConversion } from '../soundLibrary/soundConversion';
import { NOT_CONVERTED } from '../soundLibrary/soundConversion';
import { nameOfRelative } from '../soundLibrary/soundPaths';
import { grownGain } from './growingCopies';

export const READY: SoundConversion = { state: 'ready' };

/** A file outside every linked folder shows why on the sound; a start that found several does not tell each. */
export const OUTSIDE: SoundConversion = { state: 'refused', reason: 'outside-folder' };

export interface CopyMaker {
  run(job: SoundImportJob, onProgress?: ImportProgress, sink?: StreamSink): Promise<SoundImportResult>;
}

/** What a stored copy plays by. */
export interface StoredFacts {
  measure: SoundMeasure;
  peaks: Uint8Array<ArrayBuffer> | null;
}

/** What this device knows of one record's copy. */
export interface CopyEntry {
  /** The record as it was when the entry was made: it says where the file lies. */
  record: SoundRecord;
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
  /** When its file last took too long to say what it is: never converted in the background, asked again later. */
  unknownAt: number | null;
  /** Whether its file is being read for what it says of itself: one read at a time. */
  looking: boolean;
  /** The copy while it is made, for a sound that may play before it is whole. */
  growing: GrowingCopy | null;
  /** The gain the table was last told of a growing copy, so a small move is no change. */
  toldGainDb: number | null;
}

export const identityOf = (path: string, stat: { size: number; mtime: number }): string => `${path}|${stat.size}|${stat.mtime}`;

/** The identity of a copy's entry just stored, taken from the file's first measure. */
export const PENDING = '';

export const entryKeyOf = (recordId: string, path: string): string => `${recordId}\n${path}`;

export function copyEntry(record: SoundRecord, identity: string): CopyEntry {
  return { record, recordId: record.id, identity, conversion: NOT_CONVERTED, key: null, measure: null, peaks: null, audioPath: null, known: Promise.resolve(), unknownAt: null, looking: false, growing: null, toldGainDb: null };
}

/** A file asked about while it was unknown is read again no sooner than this. */
export const UNKNOWN_RETRY_MS = 30_000;

export const asBytes = (blob: Blob): SoundBytes => ({
  byteLength: blob.size,
  read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
});

export const stored = (facts: Pick<AtlasCopyFacts, 'frames' | 'lufs' | 'truePeakDb' | 'peaks'>, kind: SoundRecord['kind']): StoredFacts => ({
  measure: { frames: facts.frames, lufs: facts.lufs, truePeakDb: facts.truePeakDb },
  peaks: kind === 'music' && facts.peaks && facts.peaks.length > 0 ? facts.peaks : null,
});

export function readyIn(entry: CopyEntry, key: string, facts: StoredFacts, audioPath: string): void {
  entry.key = key;
  entry.measure = facts.measure;
  entry.peaks = facts.peaks;
  entry.audioPath = audioPath;
  entry.conversion = READY;
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
