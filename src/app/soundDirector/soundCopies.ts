import { SoundImportError } from '../sound/codec/soundImporter';
import { forPlayers } from '../sound/codec/atlasOpus';
import { growingInfo } from './growingCopies';
import { soundInfoOf } from '../sound/codec/soundInfo';
import { untilStuck } from '../sound/codec/stuckWatch';
import type { SoundBytes, SoundInfo, SoundRecord } from '../sound/soundTypes';
import { NOT_CONVERTED, type SoundConversion } from '../soundLibrary/soundConversion';
import type { CopyFolder } from './copyFolder';
import { backgroundCopies, CopyQueue, type BackgroundProgress } from './copyQueue';
import { asBytes, atlasMade, copyEntry, type CopyMaker, entryKeyOf, identityOf, makeCopy, PENDING, readyIn, stored, UNKNOWN_RETRY_MS, type CopyEntry, type StoredFacts } from './copyEntries';
import type { PreparedSource } from './sourcePrepare';
import type { GrowingCopy } from '../sound/codec/growingCopy';

export { backgroundCopies } from './copyQueue';
export type { CopyMaker } from './copyEntries';

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

/**
 * The copies of a vault's sounds on this device: Atlas-made Opus files in the GM's folders, one queue that
 * makes the rest, and the bytes of each. A file that says it is a copy is ready as it is; a source is
 * converted once the GM agreed for its folder, in a worker of its own, and stored beside it.
 */
export class SoundCopies {
  /** By record and the path it names: a record that moved to its copy while an older object of it still names the source is two entries. */
  private readonly entries = new Map<string, CopyEntry>();
  /** The entry each sound key was last made or found for. */
  private readonly keys = new Map<string, CopyEntry>();
  /** Every entry that holds a key, newest last: a row of a file without a record holds the key of the record's copy too. */
  private readonly holders = new Map<string, CopyEntry[]>();
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

  /** The same object while a sound's state is the same: cards read it on every render. */
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
    return this.keys.get(key)?.recordId ?? null;
  }

  /** Every record a copy was made or found for, newest first. */
  recordIdsOf(key: string): string[] {
    const held = (this.holders.get(key) ?? []).filter((entry) => entry.key === key).map((entry) => entry.recordId);
    return [...new Set(held.reverse())];
  }

  /**
   * Asks for copies; `urgent` is what the GM pressed. A file not here yet, or in a folder the GM has not agreed
   * to, is asked for again when that changes. Each sound's file is read for what it says of itself first, all of
   * a request together, which keeps its order; a press is read first. A file whose reads took too long is asked
   * again now and then and converted only when pressed.
   */
  request(records: readonly SoundRecord[], urgent = false): void {
    if (this.disposed) return;
    const known = records.flatMap((record) => {
      const entry = this.entryOf(record);
      if (entry && entry.unknownAt !== null && !urgent && Date.now() - entry.unknownAt >= UNKNOWN_RETRY_MS) entry.known = this.lookUp(record, entry, false);
      else if (urgent) this.folder.hurry(record);
      return entry?.known ?? [];
    });
    void Promise.all(known).then(() => this.enqueue(records, urgent));
  }

  private enqueue(records: readonly SoundRecord[], urgent: boolean): void {
    if (this.disposed) return;
    const wanted = records.filter((record) => {
      const entry = this.entryOf(record);
      return entry?.conversion.state === 'not-converted' && (urgent || entry.unknownAt === null) && this.folder.choiceFor(record) !== null;
    });
    if (wanted.length > 0) this.queue.add(wanted, urgent);
  }

  /** The library changed: a sound refused as outside every linked folder is looked at again where that is no longer so. */
  recheckOutside(): void {
    const linked = [...this.entries].filter(([, entry]) => entry.conversion.state === 'refused' && entry.conversion.reason === 'outside-folder' && !this.folder.outside(entry.record));
    for (const [at] of linked) this.entries.delete(at);
    if (linked.length > 0) this.changed();
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
    const entry = this.keys.get(key);
    return entry?.measure ? null : (entry?.growing ?? null);
  }

  dispose(): void {
    this.disposed = true;
    this.queue.dispose();
    this.listeners.clear();
  }

  private storedPath(key: string): string {
    const path = this.keys.get(key)?.audioPath;
    if (!path) throw new Error(`The copy of ${key} is not stored yet.`);
    return path;
  }

  /**
   * A record's entry, made anew when its file changed. The entry of a copy just stored waits for the file's
   * measure, as the listing may not show the new file yet.
   */
  private entryOf(record: SoundRecord): CopyEntry | null {
    const at = entryKeyOf(record.id, record.filePath);
    const stat = this.files.statOf(record);
    const entry = this.entries.get(at);
    if (entry?.identity === PENDING) {
      if (stat) entry.identity = identityOf(record.filePath, stat);
      return entry;
    }
    if (!stat) return null;
    const identity = identityOf(record.filePath, stat);
    if (entry?.identity === identity) return entry;
    const fresh = copyEntry(record, identity);
    fresh.known = this.lookUp(record, fresh, false);
    this.entries.set(at, fresh);
    return fresh;
  }

  private async lookUp(record: SoundRecord, entry: CopyEntry, pressed: boolean): Promise<void> {
    // A file outside every linked folder shows why on the sound; a start that found several would tell each.
    if (this.folder.outside(record)) return this.refuse(record, entry, 'outside-folder', false);
    try {
      const found = await this.folder.factsOf(record, pressed);
      entry.unknownAt = found === 'unknown' ? Date.now() : null;
      if (found && found !== 'unknown' && !this.disposed) this.markStored(record, entry, found.facts.key, stored(found.facts, record.kind), found.audioPath);
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof SoundImportError) this.refuse(record, entry, error.reason);
      else console.error('[Atlas] Could not read what a sound says of itself', error);
    }
  }

  private markStored(record: SoundRecord, entry: CopyEntry, key: string, facts: StoredFacts, audioPath: string): void {
    readyIn(entry, key, facts, audioPath);
    this.hold(key, entry);
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
      const made = await atlasMade(read);
      if (made) {
        this.markStored(record, entry, made.key, stored(made, record.kind), this.files.pathNow(record));
        return;
      }
      const { hash, source } = await this.prepare(read);
      const result = await makeCopy(this.maker, record, entry, source, hash, {
        progress: (share) => {
          if (entry.conversion.state === 'converting') this.set(entry, { state: 'converting', progress: share });
        },
        started: () => this.keys.set(hash, entry),
        changed: () => this.changed(),
      });
      const audioPath = await this.folder.store(record, result.bytes, choice, stat);
      if (this.disposed) return;
      this.markStored(record, entry, hash, stored(result, record.kind), audioPath);
      // The file at the record's own path was replaced: its next measure is the copy's.
      if (audioPath === record.filePath) entry.identity = PENDING;
      else this.storedAt(record, entry, audioPath);
    } catch (error) {
      entry.growing?.fail(error instanceof Error ? error : new Error(String(error)));
      entry.growing = null;
      if (this.disposed) return;
      if (!(error instanceof SoundImportError)) console.error(`[Atlas] Could not convert ${record.filePath}`, error);
      this.refuse(record, entry, error instanceof SoundImportError ? error.reason : 'unreadable');
    }
  }

  /** The record follows its copy a moment later: its entry there is ready from the start. */
  private storedAt(record: SoundRecord, entry: CopyEntry, audioPath: string): void {
    const moved: CopyEntry = { ...entry, identity: PENDING, known: Promise.resolve(), unknownAt: null, growing: null, toldGainDb: null };
    this.entries.set(entryKeyOf(record.id, audioPath), moved);
    if (entry.key) this.hold(entry.key, moved);
  }

  private hold(key: string, entry: CopyEntry): void {
    this.keys.set(key, entry);
    const held = (this.holders.get(key) ?? []).filter((one) => one !== entry && one.key === key);
    this.holders.set(key, [...held, entry]);
  }

  private refuse(record: SoundRecord, entry: CopyEntry, reason: SoundImportError['reason'], tell = true): void {
    this.set(entry, { state: 'refused', reason });
    if (!tell || this.toldRefused.has(record.id)) return;
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
