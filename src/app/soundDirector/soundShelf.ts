import type { SoundInfo, SoundRecord } from '../sound/soundTypes';
import { SoundCopies } from './soundCopies';
import type { GrowingCopy } from '../sound/codec/growingCopy';
import type { SoundDirectorDeps } from './directorDeps';
import type { MoodMix, ReadySounds } from './tableSound';
import type { SoundRefusal } from '../sound/codec/demux/demuxTypes';
import { NOT_CONVERTED, type SoundConversion } from '../soundLibrary/soundConversion';

/** The sounds there are and which of them can play: the records, and this device's copies of them, while sound is switched on. */
export class SoundShelf {
  private records = new Map<string, SoundRecord>();
  private read = false;
  private copies: SoundCopies | null = null;
  private maker: { dispose(): void } | null = null;
  private cache: { close(): Promise<void> } | null = null;

  constructor(
    private readonly deps: Pick<SoundDirectorDeps, 'files' | 'createCache' | 'createMaker' | 'prepareSource' | 'readRecords' | 'readPeaks'>,
    private readonly onRefused: (record: SoundRecord, reason: SoundRefusal) => void,
    /** A copy that played while it was made is stored. */
    private readonly onStored: (key: string) => void = () => undefined,
  ) {}

  open(): SoundCopies {
    const maker = this.deps.createMaker();
    const cache = this.deps.createCache();
    this.maker = maker;
    this.cache = cache;
    this.copies = new SoundCopies(this.deps.files, cache, maker, (buffer) => this.deps.prepareSource(buffer), this.onRefused, (copy, frames) => this.deps.readPeaks(copy, frames), undefined, this.onStored);
    return this.copies;
  }

  close(): void {
    this.copies?.dispose();
    this.copies = null;
    this.maker?.dispose();
    this.maker = null;
    void this.cache?.close();
    this.cache = null;
  }

  recordOf(id: string): SoundRecord | null {
    return this.records.get(id) ?? null;
  }

  recordOfKey(key: string): SoundRecord | null {
    const id = this.copies?.recordIdOf(key);
    return id ? this.recordOf(id) : null;
  }

  idOfKey(key: string): string | null {
    return this.copies?.recordIdOf(key) ?? null;
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  hasFile(record: SoundRecord): boolean {
    return this.deps.files.statOf(record) !== null;
  }

  /** What the record's file is called on this device. */
  pathNow(record: SoundRecord): string {
    return this.deps.files.pathNow(record);
  }

  stateOf(record: SoundRecord): SoundConversion {
    return this.copies?.stateOf(record) ?? NOT_CONVERTED;
  }

  /** Whether a copy of a sound can still come: not one refused, or whose file is not here. */
  mayCome(id: string): boolean {
    const record = this.recordOf(id);
    return record !== null && this.hasFile(record) && this.stateOf(record).state !== 'refused';
  }

  infoOf(record: SoundRecord): SoundInfo | null {
    return this.copies?.infoFor(record) ?? null;
  }

  /** How the sound a key names goes over its length, once that is known. */
  peaksOfKey(key: string): Uint8Array<ArrayBuffer> | null {
    const record = this.recordOfKey(key);
    return record && (this.copies?.peaksFor(record) ?? null);
  }

  /** What a mix names that has a record; a deleted sound is simply gone from it. */
  recordsOf(mix: Pick<MoodMix, 'music' | 'layers'>): SoundRecord[] {
    const tracks = typeof mix.music === 'string' ? [] : mix.music.tracks;
    return [...tracks, ...mix.layers.map((layer) => layer.sound)].flatMap((id) => this.records.get(id) ?? []);
  }

  readyOf(records: readonly SoundRecord[]): ReadySounds {
    const ready = new Map<string, SoundInfo>();
    for (const record of records) {
      const info = this.infoOf(record);
      if (info) ready.set(record.id, info);
    }
    return ready;
  }

  request(records: readonly SoundRecord[], urgent = false): void {
    this.copies?.request(records, urgent);
  }

  pinOnly(keys: ReadonlySet<string>): void {
    this.copies?.pinOnly(keys);
  }

  /** A copy the cache gave up under a sound is made again; the player keeps asking in the meantime. */
  copyFailed(key: string, error: unknown): void {
    console.error(`[Atlas] Could not play the sound ${key}`, error);
    const record = this.recordOfKey(key);
    if (record) this.request([record], true);
  }

  /** What the engine reads a sound by: its stored copy, or the copy being made. */
  bytes(key: string): ReturnType<SoundCopies['bytes']> {
    return this.copies ? this.copies.bytes(key) : Promise.reject(new Error('Sound is switched off.'));
  }

  /** A copy while it is made: players get it in segments as it grows. */
  growingOf(key: string): GrowingCopy | null {
    return this.copies?.growingOf(key) ?? null;
  }

  /** Only a stored, whole copy: what goes to players. */
  storedBytes(key: string): ReturnType<SoundCopies['storedBytes']> {
    return this.copies ? this.copies.storedBytes(key) : Promise.reject(new Error('Sound is switched off.'));
  }

  /** Reads the records again. Sounds that are new since the last read are made ready for use; at a start, what exists only says how far it is. */
  async refresh(): Promise<void> {
    const records = await this.deps.readRecords();
    const fresh = this.read ? records.filter((record) => !this.records.has(record.id)) : [];
    this.records = new Map(records.map((record) => [record.id, record]));
    this.read = true;
    for (const record of records) this.copies?.stateOf(record);
    this.copies?.request(fresh);
  }
}
