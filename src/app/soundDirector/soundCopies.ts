import { SoundImportError, type ImportProgress, type SoundImportJob, type SoundImportResult, type StreamSink } from '../sound/codec/soundImporter';
import { GrowingCopy } from '../sound/codec/growingCopy';
import { growingInfo, grownGain } from './growingCopies';
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
  run(job: SoundImportJob, onProgress?: ImportProgress, sink?: StreamSink): Promise<SoundImportResult>;
}



const READY: SoundConversion = { state: 'ready' };

/**
 * Copies made at once in the background: each takes a worker and an encoder's thread, and holds its source
 * and its copy in memory, so a few, never one per core. What the GM pressed may always take one more.
 */
export function backgroundCopies(cores: number = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2): number {
  return Math.max(1, Math.min(3, Math.floor(cores / 4)));
}

interface CopyEntry {
  identity: string;
  conversion: SoundConversion;
  key: string | null;
  measure: SoundMeasure | null;
  peaks: Uint8Array<ArrayBuffer> | null;
  /** Settles once what the cache knows of the file has been read. */
  known: Promise<void>;
  /** The copy while it is made, for a sound that may play before it is whole. */
  growing: GrowingCopy | null;
  /** The gain the table was last told of a growing copy, so a small move is no change. */
  toldGainDb: number | null;
}

const identityOf = (path: string, stat: { size: number; mtime: number }): string => `${path}|${stat.size}|${stat.mtime}`;



/**
 * The copies of a vault's sounds on this device: which exist, one queue that makes the rest, and the
 * bytes of each. A conversion runs in a worker of its own, so it costs the map no frame. A few run at
 * once (`backgroundCopies`); what the GM pressed goes first, and starts at once beside them.
 */
export class SoundCopies {
  private readonly entries = new Map<string, CopyEntry>();
  private readonly keys = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private queue: SoundRecord[] = [];
  /** Conversions under way, and the ids of those asked for by a press, which may run past the limit. */
  private active = 0;
  private readonly urgent = new Set<string>();
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
    private readonly parallel = backgroundCopies(),
    /** A copy that played while it was made is stored now: whatever still reads its growing pages may read the stored copy. */
    private readonly onStored: (key: string) => void = () => undefined,
  ) {}

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
    if (urgent) {
      this.queue = [...wanted, ...this.queue.filter((record) => !ids.has(record.id))];
      for (const id of ids) this.urgent.add(id);
    } else {
      this.queue.push(...wanted.filter((record) => !this.queue.some((other) => other.id === record.id)));
    }
    this.pump();
  }

  async bytes(key: string): Promise<SoundBytes> {
    const growing = this.growingOf(key);
    if (growing) return growing;
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
    this.urgent.clear();
    this.peaksQueue = [];
    this.listeners.clear();
  }

  /** Only what is stored, whole: what goes to players. */
  async storedBytes(key: string): Promise<SoundBytes> {
    const bytes = await this.cache.bytes(key);
    if (bytes) return bytes;
    throw new Error(`The copy of ${key} is not stored yet.`);
  }

  /** The copy of a key while it is made. */
  growingOf(key: string): GrowingCopy | null {
    const id = this.keys.get(key);
    const entry = id ? this.entries.get(id) : undefined;
    return entry && !entry.measure ? entry.growing : null;
  }

  private entryOf(record: SoundRecord): CopyEntry | null {
    const stat = this.files.statOf(record);
    if (!stat) return null;
    const identity = identityOf(record.filePath, stat);
    let entry = this.entries.get(record.id);
    if (entry?.identity !== identity) {
      const fresh: CopyEntry = { identity, conversion: NOT_CONVERTED, key: null, measure: null, peaks: null, known: Promise.resolve(), growing: null, toldGainDb: null };
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
    if (entry.growing) {
      entry.growing.end();
      entry.growing = null;
      entry.toldGainDb = null;
      this.onStored(key);
    }
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

  /** Starts what the queue's front may: up to `parallel`, and one more for a press, so a press never waits behind a long file. */
  private pump(): void {
    for (let next = this.queue[0]; next && !this.disposed; next = this.queue[0]) {
      const pressed = this.urgent.has(next.id);
      if (this.active >= this.parallel + (pressed ? 1 : 0)) return;
      this.queue.shift();
      this.active++;
      void this.convert(next).finally(() => {
        this.active--;
        this.urgent.delete(next.id);
        this.pump();
      });
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
    const loop = record.kind === 'ambience' || record.loop !== undefined;
    try {
      const result = await this.maker.run({ source, kind: record.kind, loop, stream: !loop }, (share) => {
        if (entry.conversion.state === 'converting') this.set(entry, { state: 'converting', progress: share });
      }, this.streamInto(record, entry, hash));
      const copy = { bytes: result.bytes, frames: result.frames, channels: result.channels, lufs: result.lufs, truePeakDb: result.truePeakDb };
      await this.cache.put(hash, copy);
      return copy;
    } catch (error) {
      entry.growing?.fail(error instanceof Error ? error : new Error(String(error)));
      entry.growing = null;
      throw error;
    }
  }

  /** Where a copy's pages go while it is made: the table hears when it can begin, and when its loudness has moved. */
  private streamInto(record: SoundRecord, entry: CopyEntry, hash: string): StreamSink {
    return {
      start: (start) => {
        entry.growing = new GrowingCopy(start);
        entry.key = hash;
        this.keys.set(hash, record.id);
      },
      pages: (pages) => {
        if (!entry.growing || entry.measure) return;
        const told = grownGain(entry.growing, pages, entry.toldGainDb, record.trimDb);
        if (told === entry.toldGainDb) return;
        entry.toldGainDb = told;
        this.changed();
      },
    };
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
