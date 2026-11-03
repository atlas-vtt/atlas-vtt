import type { SoundBytes } from '../soundTypes';
import { readPacketRange, type OggOpusSound, type PositionedPacket } from './oggOpusReader';
import type { StreamHead, WindowedSound } from './windowedSound';
import { readOpusHead } from './opusFormat';
import { SEEK_INTERVAL_FRAMES, type SeekEntry } from './seekTable';

/** What a conversion says first: the stream's head, and how long the sound will be as far as can be told yet. */
export interface GrowingStart {
  head: Uint8Array<ArrayBuffer>;
  estimatedFrames: number;
}

/** Audio pages as the writer wrote them: whole pages, each page's start byte (from the first audio page) and start granule. */
export interface GrowingPages {
  bytes: Uint8Array<ArrayBuffer>;
  pages: { byte: number; granule: number }[];
  /** The position after the last page's last packet, pre-skip included. */
  endGranule: number;
  estimatedFrames: number;
  /** Loudness of what was converted so far. */
  lufs: number;
  truePeakDb: number;
}

interface Waiter {
  granule: number;
  resolve: () => void;
}

/**
 * A copy while it is made: the audio pages written so far, readable as they come. Its pages are the very
 * ones the finished file holds after its header (the header is written last and the writer's offsets count
 * from the first audio page), so what plays from it now plays the same from the stored copy later. Reads
 * only what is written; `reach` waits for more.
 */
export class GrowingCopy implements SoundBytes, WindowedSound {
  readonly windowed = true;
  readonly head: Uint8Array<ArrayBuffer>;
  readonly channels: number;
  readonly preSkip: number;
  estimatedFrames: number;
  lufs = Number.NEGATIVE_INFINITY;
  truePeakDb = Number.NEGATIVE_INFINITY;
  private readonly pieces: Blob[] = [];
  private written = 0;
  private endGranule: number;
  private readonly seek: SeekEntry[] = [];
  private nextSeekGranule = 0;
  private waiters: Waiter[] = [];
  private whole: Blob | null = null;
  private ended = false;
  private failure: Error | null = null;

  constructor(start: GrowingStart) {
    this.head = start.head;
    const head = readOpusHead(start.head);
    this.channels = head.channels;
    this.preSkip = head.preSkip;
    this.endGranule = head.preSkip;
    this.estimatedFrames = start.estimatedFrames;
  }

  get stream(): StreamHead {
    return { head: this.head, channels: this.channels, preSkip: this.preSkip };
  }

  /** The packets of a range once the copy holds it: it is made far faster than it plays. */
  async packets(fromGranule: number, toGranule: number): Promise<PositionedPacket[]> {
    await this.reach(toGranule);
    return readPacketRange(this.sound(), this, fromGranule, toGranule);
  }

  /** Frames of the sound written so far, past the pre-skip. */
  get frames(): number {
    return Math.max(0, this.endGranule - this.preSkip);
  }

  get byteLength(): number {
    return this.written;
  }

  /** Whether the whole sound is written. */
  get done(): boolean {
    return this.ended;
  }

  add(pages: GrowingPages): void {
    if (this.ended) return;
    for (const page of pages.pages) {
      if (page.granule >= this.nextSeekGranule) {
        this.seek.push({ byte: page.byte, granule: page.granule });
        this.nextSeekGranule = page.granule + SEEK_INTERVAL_FRAMES;
      }
    }
    this.pieces.push(new Blob([pages.bytes]));
    this.whole = null;
    this.written += pages.bytes.byteLength;
    this.endGranule = pages.endGranule;
    this.estimatedFrames = pages.estimatedFrames;
    this.lufs = pages.lufs;
    this.truePeakDb = pages.truePeakDb;
    this.wake();
  }

  /** Nothing more comes: everything waiting reads what there is. */
  end(): void {
    this.ended = true;
    this.wake();
  }

  /** The conversion failed: everything waiting is told. */
  fail(error: Error): void {
    this.failure = error;
    this.ended = true;
    this.wake();
  }

  /** Settles once the copy holds the sound up to `granule` (pre-skip included), or nothing more will come; rejects if it failed. */
  reach(granule: number): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.ended || this.endGranule >= granule) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.waiters.push({ granule, resolve: () => (this.failure ? reject(this.failure) : resolve()) });
    });
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    if (this.failure) throw this.failure;
    this.whole ??= new Blob(this.pieces);
    return new Uint8Array(await this.whole.slice(start, Math.min(end, this.written)).arrayBuffer());
  }

  /** The stream as the engine reads it: no header pages, its seek table and length as far as it has come. */
  sound(): OggOpusSound {
    const seekNow = (): SeekEntry[] => (this.seek.length > 0 ? this.seek : [{ byte: 0, granule: 0 }]);
    const lengthNow = (): number => this.written;
    return {
      head: this.head,
      channels: this.channels,
      preSkip: this.preSkip,
      audioStart: 0,
      get seek(): SeekEntry[] {
        return seekNow();
      },
      get byteLength(): number {
        return lengthNow();
      },
    };
  }

  private wake(): void {
    const still: Waiter[] = [];
    for (const waiter of this.waiters) {
      if (this.ended || this.endGranule >= waiter.granule) waiter.resolve();
      else still.push(waiter);
    }
    this.waiters = still;
  }
}
