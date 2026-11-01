import type { SoundInfo, SoundRecord } from '../sound/soundTypes';
import { SoundCopies } from './soundCopies';
import type { SoundDirectorDeps } from './directorDeps';
import type { MoodMix, ReadySounds } from './tableSound';
import type { SoundRefusal } from '../sound/codec/demux/demuxTypes';
import type { SoundConversion } from '../soundLibrary/soundConversion';

const NOT_CONVERTED: SoundConversion = { state: 'not-converted' };

/** The sounds there are and which of them can play: the records, and this device's copies of them, while sound is switched on. */
export class SoundShelf {
  private records = new Map<string, SoundRecord>();
  private read = false;
  private copies: SoundCopies | null = null;
  private maker: { dispose(): void } | null = null;
  private cache: { close(): Promise<void> } | null = null;

  constructor(
    private readonly deps: Pick<SoundDirectorDeps, 'files' | 'createCache' | 'createMaker' | 'readRecords'>,
    private readonly onRefused: (record: SoundRecord, reason: SoundRefusal) => void,
  ) {}

  open(): SoundCopies {
    const maker = this.deps.createMaker();
    const cache = this.deps.createCache();
    this.maker = maker;
    this.cache = cache;
    this.copies = new SoundCopies(this.deps.files, cache, maker, this.onRefused);
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
    return this.deps.files.statOf(record.filePath) !== null;
  }

  stateOf(record: SoundRecord): SoundConversion {
    return this.copies?.stateOf(record) ?? NOT_CONVERTED;
  }

  infoOf(record: SoundRecord): SoundInfo | null {
    return this.copies?.infoFor(record) ?? null;
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

  bytes(key: string): ReturnType<SoundCopies['bytes']> {
    return this.copies ? this.copies.bytes(key) : Promise.reject(new Error('Sound is switched off.'));
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
