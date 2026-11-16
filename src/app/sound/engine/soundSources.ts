import { openOggOpus, readPacketRange, type PositionedPacket } from '../codec/oggOpusReader';
import { isWindowedSound, type StreamHead, type WindowedSound } from '../codec/windowedSound';
import type { SoundBytes } from '../soundTypes';
import type { SoundBuffer, SoundContext } from './audioNodes';
import { chooseWindowDecode, PRE_ROLL_FRAMES, type WindowDecode } from './windowDecoder';

/** Decoded short sounds no voice uses are kept up to this much, so a mood coming back starts at once. */
const SPARE_DECODED_BYTES = 128 * 1024 * 1024;

/** The bytes of a key's sound; a long one may come as packet ranges instead (being made, or stored in segments). */
export type ResolveBytes = (key: string) => SoundBytes | WindowedSound | Promise<SoundBytes | WindowedSound>;

interface OpenStream {
  stream: StreamHead;
  decode: WindowDecode;
  packets(fromGranule: number, toGranule: number): Promise<PositionedPacket[]>;
}

interface HeldBuffer {
  buffer: Promise<SoundBuffer>;
  uses: number;
  bytes: number;
  lastUse: number;
}

/**
 * Where a player gets its audio: the bytes of a key, short sounds decoded once and shared by every voice,
 * and windows of long ones. Decoding goes one job at a time, since parallel decodes can take a phone's tab
 * down; reading bytes does not wait in that line, so a slow store holds up only its own sound.
 */
export class SoundSources {
  private readonly bytes = new Map<string, Promise<SoundBytes | WindowedSound>>();
  private readonly buffers = new Map<string, HeldBuffer>();
  private readonly streams = new Map<string, Promise<OpenStream>>();
  private decoding: Promise<unknown> = Promise.resolve();
  private clock = 0;
  private readonly underWay = new Set<Promise<unknown>>();

  constructor(
    private context: SoundContext,
    private readonly resolve: ResolveBytes,
    private readonly forcedWindowDecode: ((context: SoundContext) => WindowDecode) | null = null,
    private readonly spareBytes: number = SPARE_DECODED_BYTES,
  ) {}

  /** Decoded audio outlives a context; only what decodes for it moves to the new one. */
  useContext(context: SoundContext): void {
    this.context = context;
    this.streams.clear();
  }

  /** Resolves once nothing asked for so far is still being read or decoded. */
  async settled(): Promise<void> {
    while (this.underWay.size > 0) await Promise.allSettled(this.underWay);
  }

  retain(key: string): Promise<SoundBuffer> {
    const held = this.buffers.get(key) ?? this.startDecode(key);
    held.uses++;
    held.lastUse = ++this.clock;
    return held.buffer;
  }

  release(key: string): void {
    const held = this.buffers.get(key);
    if (held) held.uses--;
    this.evict();
  }

  /** What whole decoded sounds hold now, spare ones included. */
  decodedBytes(): number {
    return [...this.buffers.values()].reduce((sum, held) => sum + held.bytes, 0);
  }

  /** Forgets a sound that failed, so a later attempt asks again. */
  forget(key: string): void {
    this.bytes.delete(key);
    this.streams.delete(key);
    const held = this.buffers.get(key);
    if (held && held.uses <= 0) this.buffers.delete(key);
  }

  decodeWindow(key: string, frame: number, count: number): Promise<SoundBuffer> {
    return this.tracked(this.windowOf(key, frame, count));
  }

  private async windowOf(key: string, frame: number, count: number): Promise<SoundBuffer> {
    const opened = await this.stream(key);
    const fromGranule = frame + opened.stream.preSkip;
    const packets = await opened.packets(fromGranule - PRE_ROLL_FRAMES, fromGranule + count);
    return this.inLine(() => opened.decode(opened.stream, packets, fromGranule, count));
  }

  private tracked<T>(work: Promise<T>): Promise<T> {
    // Comes off the list a turn after the caller's own `then` has run.
    const held: Promise<void> = work.then(() => undefined, () => undefined).then(() => {
      this.underWay.delete(held);
    });
    this.underWay.add(held);
    return work;
  }

  private stream(key: string): Promise<OpenStream> {
    let stream = this.streams.get(key);
    if (!stream) {
      stream = this.openStream(key);
      this.streams.set(key, stream);
      stream.catch(() => this.streams.delete(key));
    }
    return stream;
  }

  private async openStream(key: string): Promise<OpenStream> {
    const source = await this.source(key);
    const opened = isWindowedSound(source)
      ? { stream: source.stream, packets: (from: number, to: number) => source.packets(from, to) }
      : await openOggFile(source);
    const decode = this.forcedWindowDecode ? this.forcedWindowDecode(this.context) : await chooseWindowDecode(this.context, opened.stream);
    return { ...opened, decode };
  }

  private source(key: string): Promise<SoundBytes | WindowedSound> {
    let source = this.bytes.get(key);
    if (!source) {
      source = Promise.resolve().then(() => this.resolve(key));
      this.bytes.set(key, source);
      source.catch(() => this.bytes.delete(key));
    }
    return source;
  }

  private startDecode(key: string): HeldBuffer {
    const held: HeldBuffer = { buffer: this.tracked(this.decodeWhole(key)), uses: 0, bytes: 0, lastUse: 0 };
    held.buffer.then(
      (buffer) => {
        held.bytes = buffer.length * buffer.numberOfChannels * 4;
        this.evict();
      },
      () => this.buffers.delete(key),
    );
    this.buffers.set(key, held);
    return held;
  }

  private async decodeWhole(key: string): Promise<SoundBuffer> {
    const source = await this.source(key);
    if (isWindowedSound(source)) throw new Error(`${key} is read in windows, never whole.`);
    const bytes = await source.read(0, source.byteLength);
    // `decodeAudioData` takes the buffer away, and what `read` returned may be a view of something else.
    const owned = bytes.slice().buffer;
    return this.inLine(() => this.context.decodeAudioData(owned));
  }

  private inLine<T>(job: () => Promise<T>): Promise<T> {
    const result = this.decoding.then(job, job);
    this.decoding = result.catch(() => undefined);
    return result;
  }

  private evict(): void {
    const spare = [...this.buffers.entries()].filter(([, held]) => held.uses <= 0 && held.bytes > 0).sort((a, b) => a[1].lastUse - b[1].lastUse);
    let total = spare.reduce((sum, [, held]) => sum + held.bytes, 0);
    for (const [key, held] of spare) {
      if (total <= this.spareBytes) return;
      this.buffers.delete(key);
      total -= held.bytes;
    }
  }
}

/** An Ogg Opus file read by its header's seek table. */
async function openOggFile(source: SoundBytes): Promise<Pick<OpenStream, 'stream' | 'packets'>> {
  const sound = await openOggOpus(source);
  return { stream: sound, packets: (from, to) => readPacketRange(sound, source, from, to) };
}
