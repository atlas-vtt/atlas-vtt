import { SoundImportError, type ImportProgress, type SoundImportJob, type SoundImportResult, type StreamSink } from '../sound/codec/soundImporter';
import { forPlayers, hasAtlasMark, rangesOf, readAtlasCopy, type AtlasCopyFacts } from '../sound/codec/atlasOpus';
import { growingInfo } from './growingCopies';
import { soundInfoOf } from '../sound/codec/soundInfo';
import { untilStuck } from '../sound/codec/stuckWatch';
import type { SoundBytes, SoundInfo, SoundRecord } from '../sound/soundTypes';
import { NOT_CONVERTED, type SoundConversion } from '../soundLibrary/soundConversion';
import type { CopyFolder } from './copyFolder';
import { backgroundCopies, CopyQueue, type BackgroundProgress } from './copyQueue';
import { copyEntry, factsWithin, identityOf, makeCopy, readyIn, type CopyEntry, type StoredFacts } from './copyEntries';
import type { PreparedSource } from './sourcePrepare';
import type { GrowingCopy } from '../sound/codec/growingCopy';

export { backgroundCopies } from './copyQueue';

/** What says which file a record stands for. */
export type SoundFileRef = Pick<SoundRecord, 'filePath' | 'audioSize'>;

export interface SoundFileAccess {
  /** Null while this device does not have the file. */
  statOf(sound: SoundFileRef): { size: number; mtime: number } | null;
  /** A Blob where the file lies on disk and need not pass through the main thread's memory. `onStep` hears a read that gets somewhere, where it comes in parts. */
  read(sound: SoundFileRef, onStep?: () => void): Promise<ArrayBuffer | Blob>;
  /** What the file is called on this device, which may be elsewhere than the shared record says. */
  pathNow(sound: SoundFileRef): string;
}

export interface CopyMaker {
  run(job: SoundImportJob, onProgress?: ImportProgress, sink?: StreamSink): Promise<SoundImportResult>;
}

const asBytes = (blob: Blob): SoundBytes => ({
  byteLength: blob.size,
  read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
});

const stored = (facts: Pick<AtlasCopyFacts, 'frames' | 'lufs' | 'truePeakDb' | 'peaks'>, kind: SoundRecord['kind']): StoredFacts => ({
  measure: { frames: facts.frames, lufs: facts.lufs, truePeakDb: facts.truePeakDb },
  peaks: kind === 'music' && facts.peaks && facts.peaks.length > 0 ? facts.peaks : null,
});

/**
 * The copies of a vault's sounds on this device: Atlas-made Opus files in the GM's folders, one queue that
 * makes the rest, and the bytes of each. A file that says it is a copy is ready as it is; a source is
 * converted once the GM agreed for its folder, in a worker of its own, and stored beside it.
 */
export class SoundCopies {
  private readonly entries = new Map<string, CopyEntry>();
  private readonly keys = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly queue: CopyQueue;
  private disposed = false;
  private readonly toldRefused = new Set<string>();

  constructor(
    private readonly files: SoundFileAccess,
    private readonly folder: CopyFolder,
    private readonly maker: CopyMaker,
    private readonly prepare: (source: ArrayBuffer | Blob) => Promise<PreparedSource>,
    private readonly onRefused: (record: SoundRecord, reason: SoundImportError['reason']) => void,
    parallel = backgroundCopies(),
    /** A copy that played while it was made is stored now: whatever still reads its growing pages may read the stored copy. */
    private readonly onStored: (key: string) => void = () => undefined,
  ) {
    this.queue = new CopyQueue(parallel, (record) => files.statOf(record)?.size ?? 0, (record) => this.convert(record), () => this.changed());
  }

  /** The same object while a sound's state is the same, since cards read it on every render. */
  stateOf(sound: SoundRecord): SoundConversion {
    return this.entryOf(sound)?.conversion ?? NOT_CONVERTED;
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * What the engine plays a sound by, once its copy is here, or once a copy being made holds enough to begin
   * (`growing`: its length and loudness are what can be told so far, and follow as the copy grows).
   */
  infoFor(record: SoundRecord): SoundInfo | null {
    const entry = this.entryOf(record);
    if (!entry?.key) return null;
    const trim = { ...(record.trimDb !== undefined && { trimDb: record.trimDb }), ...(record.loop && { loop: record.loop }) };
    if (entry.measure) return soundInfoOf(entry.key, entry.measure, trim);
    return entry.growing ? growingInfo(entry.key, entry.growing, entry.toldGainDb, trim) : null;
  }

  /** How a music sound goes over its length, as its file says; null for ambience and until it is known. */
  peaksFor(record: SoundRecord): Uint8Array<ArrayBuffer> | null {
    return this.entryOf(record)?.peaks ?? null;
  }

  /** The record a copy was last made or found for. */
  recordIdOf(key: string): string | null {
    return this.keys.get(key) ?? null;
  }

  /**
   * Asks for copies; `urgent` is what the GM pressed. A file not here yet, or in a folder the GM has not agreed
   * to, is asked for again when that changes. Each sound's file is read for what it says of itself first: a
   * press waits for all of its files, so they keep its order; the background takes each as soon as it is read.
   */
  request(records: readonly SoundRecord[], urgent = false): void {
    if (this.disposed) return;
    if (urgent) {
      void Promise.all(records.flatMap((record) => this.entryOf(record)?.known ?? [])).then(() => this.enqueue(records, true));
      return;
    }
    const pending = records.filter((record) => this.entryOf(record)?.settled === false);
    this.enqueue(records.filter((record) => !pending.includes(record)), false);
    for (const record of pending) void this.entryOf(record)?.known.then(() => this.enqueue([record], false));
  }

  private enqueue(records: readonly SoundRecord[], urgent: boolean): void {
    if (this.disposed) return;
    const wanted = records.filter((record) => this.stateOf(record).state === 'not-converted' && this.files.statOf(record) && this.folder.choiceFor(record) !== null);
    if (wanted.length > 0) this.queue.add(wanted, urgent);
  }

  /** The background's progress since it last stood empty; null while it has nothing to do. */
  background(): BackgroundProgress | null {
    return this.queue.background();
  }

  /** Holds the background until resumed or the next start; a press still converts. */
  pauseBackground(paused: boolean): void {
    this.queue.pause(paused);
  }

  /** What the engine reads a sound by: the copy being made, else its file. */
  async bytes(key: string): Promise<SoundBytes> {
    const growing = this.growingOf(key);
    if (growing) return growing;
    try {
      return asBytes(await this.folder.blob(this.storedPath(key)));
    } catch (error) {
      this.forgetKey(key);
      throw error;
    }
  }

  /** Only what is stored, whole, as players get it: without Atlas' comments, so the source's hash never leaves. */
  async storedBytes(key: string): Promise<SoundBytes> {
    return asBytes(await forPlayers(await this.folder.blob(this.storedPath(key))));
  }

  /** The copy of a key while it is made. */
  growingOf(key: string): GrowingCopy | null {
    const id = this.keys.get(key);
    const entry = id ? this.entries.get(id) : undefined;
    return entry && !entry.measure ? entry.growing : null;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.dispose();
    this.listeners.clear();
  }

  private storedPath(key: string): string {
    const id = this.keys.get(key);
    const path = id ? this.entries.get(id)?.audioPath : null;
    if (!path) throw new Error(`The copy of ${key} is not stored yet.`);
    return path;
  }

  /**
   * A record's entry, made anew when its file changed. A copy just stored keeps its entry until the record
   * names it: the record follows a moment later, and the listing may not show the new file yet.
   */
  private entryOf(record: SoundRecord): CopyEntry | null {
    const stat = this.files.statOf(record);
    const entry = this.entries.get(record.id);
    const follows = entry?.follows;
    if (entry && follows && record.filePath === follows.to && stat) {
      entry.identity = identityOf(record.filePath, stat);
      entry.follows = null;
      return entry;
    }
    if (entry && follows && (record.filePath === follows.to || record.filePath === follows.from)) return entry;
    if (!stat) return null;
    const identity = identityOf(record.filePath, stat);
    if (entry?.identity === identity) return entry;
    const fresh = copyEntry(identity);
    fresh.settled = false;
    fresh.known = this.lookUp(record, fresh).finally(() => {
      fresh.settled = true;
    });
    this.entries.set(record.id, fresh);
    return fresh;
  }

  private async lookUp(record: SoundRecord, entry: CopyEntry): Promise<void> {
    try {
      const found = await factsWithin(this.folder, record);
      if (found === 'stuck') console.error(`[Atlas] Reading what ${record.filePath} says of itself got nowhere`);
      else if (found && !this.disposed) this.markStored(record, entry, found.facts.key, stored(found.facts, record.kind), found.audioPath);
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof SoundImportError) this.refuse(record, entry, error.reason);
      else console.error('[Atlas] Could not read what a sound says of itself', error);
    }
  }

  private markStored(record: SoundRecord, entry: CopyEntry, key: string, facts: StoredFacts, audioPath: string): void {
    readyIn(entry, key, facts, audioPath);
    this.keys.set(key, record.id);
    if (entry.growing) {
      entry.growing.end();
      entry.growing = null;
      entry.toldGainDb = null;
      this.onStored(key);
    }
    this.changed();
  }

  private forgetKey(key: string): void {
    for (const entry of this.entries.values()) {
      if (entry.key !== key) continue;
      entry.key = null;
      entry.measure = null;
      entry.peaks = null;
      entry.audioPath = null;
      entry.conversion = NOT_CONVERTED;
    }
    this.changed();
  }

  private async convert(record: SoundRecord): Promise<void> {
    const entry = this.entryOf(record);
    if (!entry) return;
    await entry.known;
    const choice = this.folder.choiceFor(record);
    const stat = this.files.statOf(record);
    if (this.disposed || entry.conversion.state !== 'not-converted' || choice === null || !stat) return;
    this.set(entry, { state: 'converting', progress: null });
    try {
      const read = await untilStuck('reading a sound', (step) => this.files.read(record, step));
      const made = await this.atlasMade(read);
      if (made) {
        this.markStored(record, entry, made.key, stored(made, record.kind), this.files.pathNow(record));
        return;
      }
      const { hash, source } = await this.prepare(read);
      const result = await makeCopy(this.maker, record, entry, source, hash, {
        progress: (share) => {
          if (entry.conversion.state === 'converting') this.set(entry, { state: 'converting', progress: share });
        },
        started: () => this.keys.set(hash, record.id),
        changed: () => this.changed(),
      });
      const audioPath = await this.folder.store(record, result.bytes, choice, stat);
      if (this.disposed) return;
      entry.follows = { from: record.filePath, to: audioPath };
      this.markStored(record, entry, hash, stored(result, record.kind), audioPath);
    } catch (error) {
      entry.growing?.fail(error instanceof Error ? error : new Error(String(error)));
      entry.growing = null;
      if (this.disposed) return;
      if (!(error instanceof SoundImportError)) console.error(`[Atlas] Could not convert ${record.filePath}`, error);
      this.refuse(record, entry, error instanceof SoundImportError ? error.reason : 'unreadable');
    }
  }

  /** What a file Atlas made says, so it is never converted again; one whose mark stands beside facts that do not read is refused. */
  private async atlasMade(read: ArrayBuffer | Blob): Promise<AtlasCopyFacts | null> {
    const ranges = rangesOf(read);
    const facts = await readAtlasCopy(ranges);
    if (facts) return facts;
    if (await hasAtlasMark(ranges)) throw new SoundImportError('unreadable', 'An Opus file Atlas made whose facts do not read.');
    return null;
  }

  private refuse(record: SoundRecord, entry: CopyEntry, reason: SoundImportError['reason']): void {
    this.set(entry, { state: 'refused', reason });
    if (this.toldRefused.has(record.id)) return;
    this.toldRefused.add(record.id);
    this.onRefused(record, reason);
  }

  private set(entry: CopyEntry, conversion: SoundConversion): void {
    entry.conversion = conversion;
    this.changed();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
