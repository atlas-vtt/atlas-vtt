import { SOUND_RATE } from '../engine/soundMath';
import { openSoundSource } from './demux/openSoundSource';
import { SoundImportError, type EncodedSource, type PcmSource, type SoundSource } from './demux/demuxTypes';
import { LoudnessMeter, type LoudnessResult } from './loudness';
import { OggOpusWriter } from './oggOpusWriter';
import { readOpusHead, writeOpusHead } from './opusFormat';
import { Resampler, SilenceTrim, toStereo } from './pcmStages';
import { verifyOggOpus } from './soundVerify';

export type SoundImportKind = 'music' | 'ambience';

const BITRATES: Record<SoundImportKind, number> = { music: 96_000, ambience: 80_000 };
const MAX_QUEUE = 32;
/** How long a queue may stand still before it is looked at again. */
const QUEUE_WAIT_MS = 10;
const PROGRESS_STEP = 0.01;
const FILE_SHARE = 0.9;

export interface SoundImportJob {
  source: Blob;
  kind: SoundImportKind;
  /** Marked as a loop: digital silence comes off both ends. */
  loop: boolean;
}

export interface SoundImportResult extends LoudnessResult {
  bytes: Blob;
  frames: number;
  channels: number;
}

export type ImportProgress = (share: number) => void;

type Planes = Float32Array<ArrayBuffer>[];

function queueRoom(queue: () => number, target: EventTarget): Promise<void> | null {
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
class OpusOutput {
  private readonly encoder: AudioEncoder;
  private writer: OggOpusWriter | null = null;
  private failure: Error | null = null;
  frames = 0;

  constructor(
    readonly channels: number,
    bitrate: number,
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

  room(): Promise<void> | null {
    return queueRoom(() => this.encoder.encodeQueueSize, this.encoder);
  }

  async finish(): Promise<Blob> {
    await this.encoder.flush();
    this.encoder.close();
    if (this.failure) throw new SoundImportError('unreadable', `Encoding failed: ${this.failure.message}`);
    if (!this.writer) throw new SoundImportError('empty', 'There is no audio in the file.');
    return this.writer.finish(this.frames);
  }

  close(): void {
    if (this.encoder.state !== 'closed') this.encoder.close();
  }

  private packet(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata): void {
    if (!this.writer) {
      const description = metadata?.decoderConfig?.description;
      if (!description) throw new SoundImportError('no-encoder', 'The encoder gives no Opus header.');
      const head = readOpusHead(description instanceof ArrayBuffer ? new Uint8Array(description) : new Uint8Array(description.buffer, description.byteOffset, description.byteLength));
      this.writer = new OggOpusWriter(writeOpusHead(this.channels, head.preSkip));
    }
    const bytes = new Uint8Array(chunk.byteLength);
    chunk.copyTo(bytes);
    this.writer.addPacket(bytes);
  }
}

/**
 * Everything between the source's samples and the encoder, one piece at a time. It is built from the first
 * piece, as a decoder can give another rate or channel count than its file says (HE-AAC does).
 */
class PcmPath {
  private resampler: Resampler | null = null;
  private trim: SilenceTrim | null = null;
  private meter: LoudnessMeter | null = null;
  private output: OpusOutput | null = null;

  constructor(private readonly job: SoundImportJob) {}

  add(planes: Planes, sampleRate: number): void {
    const stereo = toStereo(planes);
    if (!this.output) {
      const channels = stereo.length;
      this.output = new OpusOutput(channels, BITRATES[this.job.kind]);
      this.meter = new LoudnessMeter(channels);
      this.resampler = sampleRate === SOUND_RATE ? null : new Resampler(sampleRate, channels);
      this.trim = this.job.loop ? new SilenceTrim(channels) : null;
    }
    this.pass(this.resampler ? this.resampler.process(stereo) : stereo);
  }

  room(): Promise<void> | null {
    return this.output ? this.output.room() : null;
  }

  async finish(): Promise<SoundImportResult & { channels: number }> {
    const output = this.output;
    if (this.resampler) this.pass(this.resampler.flush());
    if (!output || !this.meter || output.frames === 0) throw new SoundImportError('empty', 'There is no audio in the file.');
    const bytes = await output.finish();
    return { ...this.meter.result(), bytes, frames: output.frames, channels: output.channels };
  }

  close(): void {
    this.output?.close();
  }

  private pass(planes: Planes): void {
    if (this.trim) this.trim.process(planes, (piece) => this.write(piece));
    else this.write(planes);
  }

  private write(planes: Planes): void {
    if ((planes[0]?.length ?? 0) === 0) return;
    this.meter?.add(planes);
    this.output?.add(planes);
  }
}

async function decodeEncoded(source: EncodedSource, path: PcmPath, progress: () => void): Promise<void> {
  let skip = source.skipFrames;
  let left = source.totalFrames ?? Infinity;
  const failures: Error[] = [];
  const config: AudioDecoderConfig = { codec: source.codec, sampleRate: source.sampleRate, numberOfChannels: source.channels };
  if (source.description) config.description = source.description;
  const { supported } = await AudioDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
  if (!supported) throw new SoundImportError('unsupported-codec', `This runtime cannot decode ${source.codec}.`);
  const decoder = new AudioDecoder({
    output: (data) => {
      const frames = data.numberOfFrames;
      const rate = data.sampleRate;
      const planes: Planes = Array.from({ length: data.numberOfChannels }, (_, planeIndex) => {
        const samples = new Float32Array(frames);
        data.copyTo(samples, { planeIndex, format: 'f32-planar' });
        return samples;
      });
      data.close();
      const from = Math.min(skip, frames);
      skip -= from;
      const count = Math.min(frames - from, left);
      left -= count;
      if (count > 0) path.add(planes.map((plane) => plane.subarray(from, from + count)), rate);
    },
    error: (error) => {
      failures.push(error);
    },
  });
  decoder.configure(config);
  let timestamp = 0;
  for await (const packet of source.packets()) {
    if (failures.length > 0) break;
    decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round((timestamp * 1e6) / source.sampleRate), data: packet.data }));
    timestamp += packet.frames;
    progress();
    await queueRoom(() => decoder.decodeQueueSize, decoder);
    await path.room();
  }
  if (failures.length === 0) await decoder.flush();
  if (decoder.state !== 'closed') decoder.close();
  const failure = failures[0];
  if (failure) throw new SoundImportError('unreadable', `Decoding failed: ${failure.message}`);
}

async function readPcm(source: PcmSource, path: PcmPath, progress: () => void): Promise<void> {
  for await (const planes of source.pieces()) {
    path.add(planes, source.sampleRate);
    progress();
    await path.room();
  }
}

async function checkEncoder(bitrate: number): Promise<void> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') throw new SoundImportError('no-encoder', 'This runtime has no WebCodecs audio.');
  const { supported } = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: SOUND_RATE, numberOfChannels: 2, bitrate }).catch(() => ({ supported: false }));
  if (!supported) throw new SoundImportError('no-encoder', 'This runtime cannot encode Opus.');
}

/**
 * Decodes in pieces, measures, encodes and writes, then decodes what was written to check it. Holds a piece
 * and a queue's worth at a time, never the file: three hours of it decoded would be gigabytes.
 */
export async function convertSound(job: SoundImportJob, onProgress: ImportProgress = () => undefined): Promise<SoundImportResult> {
  await checkEncoder(BITRATES[job.kind]);
  const source: SoundSource = await openSoundSource(job.source);
  const path = new PcmPath(job);
  let shown = 0;
  const progress = (): void => {
    const share = source.progress() * FILE_SHARE;
    if (share - shown >= PROGRESS_STEP) {
      shown = share;
      onProgress(share);
    }
  };
  try {
    if (source.type === 'pcm') await readPcm(source, path, progress);
    else await decodeEncoded(source, path, progress);
    const result = await path.finish();
    await verifyOggOpus(result.bytes, result.frames, result.channels, (share) => onProgress(FILE_SHARE + (1 - FILE_SHARE) * share));
    return result;
  } finally {
    path.close();
  }
}
