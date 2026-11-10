import { SOUND_RATE } from '../engine/soundMath';
import { openSoundSource } from './demux/openSoundSource';
import { checkSourceShape, SoundImportError, type EncodedSource, type PcmSource, type SoundSource } from './demux/demuxTypes';
import { LoopEnds, type LoopFinish, type LoopSeam } from './loopEnds';
import type { Planes } from './loopSeam';
import type { LoudnessResult } from './loudness';
import { MeterThread } from './meterThread';
import { OpusOutput, queueRoom } from './opusOutput';
import { Resampler, SilenceTrim, toStereo } from './pcmStages';
import { verifyOggOpus } from './soundVerify';
import type { GrowingPages, GrowingStart } from './growingCopy';
import type { WrittenPage } from './oggOpusWriter';

export type SoundImportKind = 'music' | 'ambience';

const BITRATES: Record<SoundImportKind, number> = { music: 96_000, ambience: 80_000 };
const PROGRESS_STEP = 0.01;
const FILE_SHARE = 0.9;
/** Where a file does not say: how far an MP3 or AAC encoder's padding reaches, in frames at the file's own rate. */
const PADDING_REACH_FRAMES = 3072;

export interface SoundImportJob {
  source: Blob;
  kind: SoundImportKind;
  /** Marked as a loop: nothing but sound at either end, and a wrap that goes on as the sound does. */
  loop: boolean;
  /** Hand the copy's pages on as they are written, so it can play while it is made. Never for a loop, whose ends come last. */
  stream?: boolean;
}

/** Where the pages of a copy made to play while it is made go. */
export interface StreamSink {
  start(start: GrowingStart): void;
  pages(pages: GrowingPages): void;
}

/** Pages go on in batches this large or this old, so the first seconds go at once and a long copy costs few messages. */
const STREAM_BATCH_BYTES = 256 * 1024;
const STREAM_BATCH_MS = 250;

/**
 * The pages of a copy on their way out while it is made: batched, each batch with how long the sound will be
 * as far as can be told and how loud it is so far.
 */
class PageStream {
  private pending: WrittenPage[] = [];
  private bytes = 0;
  private sentAt = 0;
  private started = false;
  private loudness = { lufs: Number.NEGATIVE_INFINITY, truePeakDb: Number.NEGATIVE_INFINITY };

  constructor(
    private readonly sink: StreamSink,
    private readonly estimate: () => number,
    private readonly peek: () => Promise<LoudnessResult> | null,
  ) {}

  add(page: WrittenPage, head: Uint8Array<ArrayBuffer>): void {
    if (!this.started) {
      this.started = true;
      this.sentAt = performance.now();
      this.sink.start({ head, estimatedFrames: this.estimate() });
    }
    this.pending.push(page);
    this.bytes += page.bytes.byteLength;
    if (this.bytes >= STREAM_BATCH_BYTES || performance.now() - this.sentAt >= STREAM_BATCH_MS) this.flush();
  }

  flush(): void {
    const last = this.pending.at(-1);
    if (!last) return;
    const bytes = new Uint8Array(this.bytes);
    let offset = 0;
    for (const page of this.pending) {
      bytes.set(page.bytes, offset);
      offset += page.bytes.byteLength;
    }
    this.sink.pages({
      bytes,
      pages: this.pending.map((page) => ({ byte: page.byte, granule: page.startGranule })),
      endGranule: last.granule,
      estimatedFrames: this.estimate(),
      ...this.loudness,
    });
    this.pending = [];
    this.bytes = 0;
    this.sentAt = performance.now();
    void this.peek()?.then((result) => {
      this.loudness = result;
    });
  }
}

export interface SoundImportResult extends LoudnessResult {
  bytes: Blob;
  frames: number;
  channels: number;
  /** Of a sound marked as a loop: what was done about its wrap. */
  seam?: LoopSeam;
}

export type ImportProgress = (share: number) => void;

/**
 * Everything between the source's samples and the encoder, one piece at a time. It is built from the first
 * piece, as a decoder can give another rate or channel count than its file says (HE-AAC does).
 */
class PcmPath {
  private resampler: Resampler | null = null;
  private trim: SilenceTrim | null = null;
  private ends: LoopEnds | null = null;
  private meter: MeterThread | null = null;
  private output: OpusOutput | null = null;

  stream: PageStream | null = null;

  constructor(
    private readonly job: SoundImportJob,
    private readonly primingHints: readonly number[] | null,
    private readonly sink: StreamSink | null,
    private readonly estimate: (written: number) => number,
  ) {}

  /** Frames handed to the encoder so far. */
  get written(): number {
    return this.output?.frames ?? 0;
  }

  add(planes: Planes, sampleRate: number): void {
    const stereo = toStereo(planes);
    if (!this.output) {
      checkSourceShape(sampleRate, planes.length);
      const channels = stereo.length;
      this.meter = new MeterThread(channels);
      const meter = this.meter;
      const sink = this.job.stream && !this.job.loop ? this.sink : null;
      this.stream = sink && new PageStream(sink, () => this.estimate(this.written), () => meter.peek());
      const stream = this.stream;
      this.output = new OpusOutput(channels, BITRATES[this.job.kind], stream ? (page, head) => stream.add(page, head) : undefined);
      // Where its ends are known a loop is resampled as the wrap it is. Elsewhere its ends are found only after this.
      this.resampler = sampleRate === SOUND_RATE ? null : new Resampler(sampleRate, channels, this.job.loop && !this.primingHints);
      if (this.job.loop) {
        this.trim = new SilenceTrim(channels);
        const toSoundRate = (frames: number): number => Math.round((frames * SOUND_RATE) / sampleRate);
        const padding = this.primingHints ? { reach: toSoundRate(PADDING_REACH_FRAMES), priming: this.primingHints.map(toSoundRate) } : null;
        this.ends = new LoopEnds(channels, padding, this.resampler?.wrapFrames ?? 0);
      }
    }
    this.pass(this.resampler ? this.resampler.process(stereo) : stereo);
  }

  room(): Promise<void> | null {
    const waits = [this.output?.room(), this.meter?.room()].filter((wait): wait is Promise<void> => wait !== null && wait !== undefined);
    return waits.length === 0 ? null : Promise.all(waits).then(() => undefined);
  }

  async finish(): Promise<SoundImportResult> {
    const output = this.output;
    if (this.resampler) this.pass(this.resampler.flush());
    const loop: LoopFinish | null = this.ends ? this.ends.finish((piece) => this.write(piece)) : null;
    if (!output || !this.meter || output.frames === 0) throw new SoundImportError('empty', 'There is no audio in the file.');
    const skipFrames = loop?.skipFrames ?? 0;
    if (loop) {
      output.add(loop.closing);
      output.endHere();
      output.add(loop.runOn);
    }
    const frames = (loop ? output.keptFrames : output.frames) - skipFrames;
    // A loop too short for its seam keeps nothing, and a page refuses a whole state that names such a sound.
    if (frames < 1) throw new SoundImportError('empty', 'There is no audio in the file.');
    const [bytes, measured] = await Promise.all([output.finish(skipFrames), this.meter.result()]);
    this.stream?.flush();
    const result = { ...measured, bytes, frames, channels: output.channels };
    return loop ? { ...result, seam: loop.seam } : result;
  }

  close(): void {
    this.output?.close();
    this.meter?.close();
  }

  private pass(planes: Planes): void {
    const { trim, ends } = this;
    if (trim && ends) trim.process(planes, (piece) => ends.process(piece, (held) => this.write(held), trim.droppedFrames));
    else this.write(planes);
  }

  private write(planes: Planes): void {
    if ((planes[0]?.length ?? 0) === 0) return;
    this.meter?.add(planes);
    this.output?.add(planes);
  }
}

async function decodeEncoded(source: EncodedSource, path: PcmPath, loop: boolean, progress: () => void): Promise<void> {
  const ends = loop ? (source.loopEnds ?? source) : source;
  let skip = ends.skipFrames;
  let left = ends.totalFrames ?? Infinity;
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
export async function convertSound(job: SoundImportJob, onProgress: ImportProgress = () => undefined, sink: StreamSink | null = null): Promise<SoundImportResult> {
  await checkEncoder(BITRATES[job.kind]);
  const source: SoundSource = await openSoundSource(job.source);
  // How long the copy will be: what the file says where it says it, else what has been written so far over how far through the file reading is.
  const known = source.type === 'encoded' && source.totalFrames !== null ? Math.round((source.totalFrames * SOUND_RATE) / source.sampleRate) : null;
  const estimate = (written: number): number => known ?? Math.max(written, Math.round(written / Math.max(source.progress(), 0.001)));
  const path = new PcmPath(job, source.type === 'encoded' ? (source.primingHints ?? null) : null, sink, estimate);
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
    else await decodeEncoded(source, path, job.loop, progress);
    const result = await path.finish();
    await verifyOggOpus(result.bytes, result.frames, result.channels, (share) => onProgress(FILE_SHARE + (1 - FILE_SHARE) * share));
    return result;
  } finally {
    path.close();
  }
}
