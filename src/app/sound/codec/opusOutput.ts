import { SOUND_RATE } from '../engine/soundMath';
import { SoundImportError } from './demux/demuxTypes';
import { OggOpusWriter, type WrittenPage } from './oggOpusWriter';
import { opusPacketFrames, readOpusHead, writeOpusHead } from './opusFormat';

const MAX_QUEUE = 32;
/** How long a queue may stand still before it is looked at again. */
const QUEUE_WAIT_MS = 10;

export function queueRoom(queue: () => number, target: EventTarget): Promise<void> | null {
  if (queue() <= MAX_QUEUE) return null;
  return new Promise((resolve) => {
    const done = (): void => {
      self.clearTimeout(timer);
      target.removeEventListener('dequeue', done);
      resolve();
    };
    const timer = self.setTimeout(done, QUEUE_WAIT_MS);
    target.addEventListener('dequeue', done);
  });
}

/** `AudioData` for the encoder, from planes that stay ours. */
function audioData(planes: readonly Float32Array[], timestampFrames: number): AudioData {
  const frames = planes[0]?.length ?? 0;
  const data = new Float32Array(frames * planes.length);
  planes.forEach((plane, channel) => data.set(plane, channel * frames));
  return new AudioData({
    format: 'f32-planar',
    sampleRate: SOUND_RATE,
    numberOfFrames: frames,
    numberOfChannels: planes.length,
    timestamp: Math.round((timestampFrames * 1e6) / SOUND_RATE),
    data,
  });
}

/** Opus at the kind's bitrate, written to Ogg as it comes. */
export class OpusOutput {
  private readonly encoder: AudioEncoder;
  private writer: OggOpusWriter | null = null;
  private failure: Error | null = null;
  /** Frames the stream ends after: what is added past them only shows the encoder how the sound goes on. */
  private keepFrames: number | null = null;
  private preSkip = 0;
  private packetFrames = 0;
  frames = 0;

  /** The stream's head, once the encoder has said it. */
  head: Uint8Array<ArrayBuffer> | null = null;

  constructor(
    readonly channels: number,
    bitrate: number,
    /** Hears each audio page as it is written, with the stream's head. */
    private readonly onPage?: (page: WrittenPage, head: Uint8Array<ArrayBuffer>) => void,
  ) {
    this.encoder = new AudioEncoder({
      output: (chunk, metadata) => this.packet(chunk, metadata),
      error: (error) => {
        this.failure = error;
      },
    });
    this.encoder.configure({ codec: 'opus', sampleRate: SOUND_RATE, numberOfChannels: channels, bitrate });
  }

  add(planes: readonly Float32Array[]): void {
    const count = planes[0]?.length ?? 0;
    if (count === 0) return;
    const data = audioData(planes, this.frames);
    this.encoder.encode(data);
    data.close();
    this.frames += count;
  }

  /** The stream ends here, though more is added. */
  endHere(): void {
    this.keepFrames = this.frames;
  }

  get keptFrames(): number {
    return this.keepFrames ?? this.frames;
  }

  room(): Promise<void> | null {
    return queueRoom(() => this.encoder.encodeQueueSize, this.encoder);
  }

  async finish(skipFrames: number): Promise<Blob> {
    await this.encoder.flush();
    this.encoder.close();
    if (this.failure) throw new SoundImportError('unreadable', `Encoding failed: ${this.failure.message}`);
    if (!this.writer) throw new SoundImportError('empty', 'There is no audio in the file.');
    return this.writer.finish(this.keptFrames - skipFrames, skipFrames);
  }

  close(): void {
    if (this.encoder.state !== 'closed') this.encoder.close();
  }

  private packet(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata): void {
    if (!this.writer) {
      const description = metadata?.decoderConfig?.description;
      if (!description) throw new SoundImportError('no-encoder', 'The encoder gives no Opus header.');
      const head = readOpusHead(description instanceof ArrayBuffer ? new Uint8Array(description) : new Uint8Array(description.buffer, description.byteOffset, description.byteLength));
      this.preSkip = head.preSkip;
      const written = writeOpusHead(this.channels, head.preSkip);
      this.head = written;
      const onPage = this.onPage;
      this.writer = new OggOpusWriter(written, onPage && ((page) => onPage(page, written)));
    }
    // Nothing the stream will not hold: a page once written cannot be taken back.
    if (this.keepFrames !== null && this.packetFrames >= this.preSkip + this.keepFrames) return;
    const bytes = new Uint8Array(chunk.byteLength);
    chunk.copyTo(bytes);
    this.packetFrames += opusPacketFrames(bytes);
    this.writer.addPacket(bytes);
  }
}
