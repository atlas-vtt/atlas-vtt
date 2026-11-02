import { SoundImportError, type ImportProgress, type SoundImportJob, type SoundImportResult } from '../sound/codec/soundImporter';
import { soundInfoOf, type SoundMeasure } from '../sound/codec/soundInfo';
import type { CachedSound, SoundIdentity } from '../sound/codec/opusCache';
import { untilStuck } from '../sound/codec/stuckWatch';
import type { SoundBytes, SoundInfo, SoundRecord } from '../sound/soundTypes';
import { NOT_CONVERTED, type SoundConversion } from '../soundLibrary/soundConversion';
import type { PreparedSource } from './sourcePrepare';

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

/** The parts of `OpusCache` a device's copies need. */
export interface CopyCache {
  get(hash: string): Promise<CachedSound | null>;
  put(hash: string, copy: { bytes: Blob; frames: number; channels: number; lufs: number; truePeakDb: number }): Promise<void>;
  bytes(hash: string): Promise<SoundBytes | null>;
  blob(hash: string): Promise<Blob | null>;
  setPeaks(hash: string, peaks: Uint8Array<ArrayBuffer>): Promise<void>;
  hashOf(path: string, size: number, mtime: number): Promise<string | null>;
  remember(identity: SoundIdentity): Promise<void>;
  pin(hash: string): void;
  unpin(hash: string): void;
}

export interface CopyMaker {
  run(job: SoundImportJob, onProgress?: ImportProgress): Promise<SoundImportResult>;
}

const READY: SoundConversion = { state: 'ready' };

interface CopyEntry {
  identity: string;
  conversion: SoundConversion;
  key: string | null;
  measure: SoundMeasure | null;
  peaks: Uint8Array<ArrayBuffer> | null;
  /** Settles once what the cache knows of the file has been read. */
  known: Promise<void>;
}

const identityOf = (path: string, stat: { size: number; mtime: number }): string => `${path}|${stat.size}|${stat.mtime}`;

/**
 * The copies of a vault's sounds on this device: which exist, one queue that makes the rest, and the
 * bytes of each. A conversion runs in a worker of its own, so it costs the map no frame; what the GM
 * pressed goes first.
 */
export class SoundCopies {
  private readonly entries = new Map<string, CopyEntry>();
  private readonly keys = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private queue: SoundRecord[] = [];
  private running = false;
  private disposed = false;
  private pinned = new Set<string>();
  private readonly toldRefused = new Set<string>();
  private peaksQueue: CopyEntry[] = [];
  private readingPeaks = false;

  constructor(
    private readonly files: SoundFileAccess,
    private readonly cache: CopyCache,
    private readonly maker: CopyMaker,
    private readonly prepare: (source: ArrayBuffer | Blob) => Promise<PreparedSource>,
    private readonly onRefused: (record: SoundRecord, reason: SoundImportError['reason']) => void,
    private readonly readPeaks: (copy: Blob, frames: number) => Promise<Uint8Array<ArrayBuffer>>,
  ) {}

  /** The same object while a sound's state is the same, since cards read it on every render. */
  stateOf(sound: SoundRecord): SoundConversion {
    return this.entryOf(sound)?.conversion ?? NOT_CONVERTED;
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** What the engine plays a sound by, once its copy is here. */
  infoFor(record: SoundRecord): SoundInfo | null {
    const entry = this.entryOf(record);
    return entry?.key && entry.measure ? soundInfoOf(entry.key, entry.measure, { ...(record.trimDb !== undefined && { trimDb: record.trimDb }), ...(record.loop && { loop: record.loop }) }) : null;
  }

  /** How a sound goes over its length; null until worked out, which only music is. */
  peaksFor(record: SoundRecord): Uint8Array<ArrayBuffer> | null {
    return this.entryOf(record)?.peaks ?? null;
  }

  /** The record a copy was last made or found for. */
  recordIdOf(key: string): string | null {
    return this.keys.get(key) ?? null;
  }

  /** Asks for copies; `urgent` is what the GM pressed. A file not in the vault yet is asked for again when it comes. */
  request(records: readonly SoundRecord[], urgent = false): void {
    if (this.disposed) return;
    const wanted = records.filter((record) => this.stateOf(record).state === 'not-converted' && this.files.statOf(record));
    const ids = new Set(wanted.map((record) => record.id));
    if (urgent) this.queue = [...wanted, ...this.queue.filter((record) => !ids.has(record.id))];
    else this.queue.push(...wanted.filter((record) => !this.queue.some((other) => other.id === record.id)));
    void this.drain();
  }

  async bytes(key: string): Promise<SoundBytes> {
    const bytes = await this.cache.bytes(key);
    if (bytes) return bytes;
    this.forgetKey(key);
    throw new Error(`The copy of ${key} is gone.`);
  }

  /** Keeps what plays out of the cache's eviction. */
  pinOnly(keys: ReadonlySet<string>): void {
    for (const key of keys) if (!this.pinned.has(key)) this.cache.pin(key);
    for (const key of this.pinned) if (!keys.has(key)) this.cache.unpin(key);
    this.pinned = new Set(keys);
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.peaksQueue = [];
    this.listeners.clear();
  }

  private entryOf(record: SoundRecord): CopyEntry | null {
    const stat = this.files.statOf(record);
    if (!stat) return null;
    const identity = identityOf(record.filePath, stat);
    let entry = this.entries.get(record.id);
    if (entry?.identity !== identity) {
      const fresh: CopyEntry = { identity, conversion: NOT_CONVERTED, key: null, measure: null, peaks: null, known: Promise.resolve() };
      fresh.known = this.lookUp(record, stat, fresh);
      this.entries.set(record.id, fresh);
      entry = fresh;
    }
    return entry;
  }

  private async lookUp(record: SoundRecord, stat: { size: number; mtime: number }, entry: CopyEntry): Promise<void> {
    try {
      const hash = await this.cache.hashOf(record.filePath, stat.size, stat.mtime);
      const copy = hash === null ? null : await this.cache.get(hash);
      if (hash !== null && copy && !this.disposed) this.markReady(record, entry, hash, copy);
    } catch (error) {
      console.error('[Atlas] Could not read the copies of sounds', error);
    }
  }

  private markReady(record: SoundRecord, entry: CopyEntry, key: string, measure: SoundMeasure & { peaks?: Uint8Array<ArrayBuffer> }): void {
    entry.key = key;
    entry.measure = measure;
    entry.peaks = measure.peaks ?? null;
    if (record.kind === 'music' && entry.peaks === null) {
      this.peaksQueue.push(entry);
      void this.drainPeaks();
    }
    entry.conversion = READY;
    this.keys.set(key, record.id);
    this.changed();
  }

  private set(entry: CopyEntry, conversion: SoundConversion): void {
    entry.conversion = conversion;
    this.changed();
  }

  private forgetKey(key: string): void {
    for (const entry of this.entries.values()) {
      if (entry.key !== key) continue;
      entry.key = null;
      entry.measure = null;
      entry.peaks = null;
      entry.conversion = NOT_CONVERTED;
    }
    this.changed();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let record = this.queue.shift(); record && !this.disposed; record = this.queue.shift()) await this.convert(record);
    } finally {
      this.running = false;
    }
  }

  /** One after another, in a worker each: a waveform is never worth holding up a conversion for. */
  private async drainPeaks(): Promise<void> {
    if (this.readingPeaks) return;
    this.readingPeaks = true;
    try {
      for (let entry = this.peaksQueue.shift(); entry && !this.disposed; entry = this.peaksQueue.shift()) await this.workOutPeaks(entry);
    } finally {
      this.readingPeaks = false;
    }
  }

  private async workOutPeaks({ key, measure }: CopyEntry): Promise<void> {
    if (key === null || measure === null) return;
    try {
      const copy = await this.cache.blob(key);
      if (!copy) return;
      const peaks = await this.readPeaks(copy, measure.frames);
      await this.cache.setPeaks(key, peaks);
      for (const entry of this.entries.values()) if (entry.key === key) entry.peaks = peaks;
      this.changed();
    } catch (error) {
      if (!this.disposed) console.error(`[Atlas] Could not read the waveform of ${key}`, error);
    }
  }

  private async convert(record: SoundRecord): Promise<void> {
    const entry = this.entryOf(record);
    if (!entry) return;
    await entry.known;
    if (this.disposed || entry.conversion.state !== 'not-converted') return;
    this.set(entry, { state: 'converting', progress: null });
    try {
      const stat = this.files.statOf(record);
      const read = await untilStuck('reading a sound', (step) => this.files.read(record, step));
      const { hash, source } = await this.prepare(read);
      if (stat) await this.cache.remember({ path: record.filePath, size: stat.size, mtime: stat.mtime, hash });
      const measure = (await this.cache.get(hash)) ?? (await this.made(record, entry, source, hash));
      if (!this.disposed) this.markReady(record, entry, hash, measure);
    } catch (error) {
      if (this.disposed) return;
      const reason = error instanceof SoundImportError ? error.reason : 'unreadable';
      if (!(error instanceof SoundImportError)) console.error(`[Atlas] Could not convert ${record.filePath}`, error);
      this.set(entry, { state: 'refused', reason });
      if (!this.toldRefused.has(record.id)) {
        this.toldRefused.add(record.id);
        this.onRefused(record, reason);
      }
    }
  }

  private async made(record: SoundRecord, entry: CopyEntry, source: Blob, hash: string): Promise<SoundMeasure> {
    const result = await this.maker.run({ source, kind: record.kind, loop: record.kind === 'ambience' || record.loop !== undefined }, (share) => {
      if (entry.conversion.state === 'converting') this.set(entry, { state: 'converting', progress: share });
    });
    const copy = { bytes: result.bytes, frames: result.frames, channels: result.channels, lufs: result.lufs, truePeakDb: result.truePeakDb };
    await this.cache.put(hash, copy);
    return copy;
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
