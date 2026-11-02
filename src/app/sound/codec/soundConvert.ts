import { SOUND_RATE } from '../engine/soundMath';
import { openSoundSource } from './demux/openSoundSource';
import { checkSourceShape, SoundImportError, type EncodedSource, type PcmSource, type SoundSource } from './demux/demuxTypes';
import { LoopEnds, type LoopFinish, type LoopSeam } from './loopEnds';
import type { Planes } from './loopSeam';
import { LoudnessMeter, type LoudnessResult } from './loudness';
import { OpusOutput, queueRoom } from './opusOutput';
import { Resampler, SilenceTrim, toStereo } from './pcmStages';
import { verifyOggOpus } from './soundVerify';

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
  private meter: LoudnessMeter | null = null;
  private output: OpusOutput | null = null;

  constructor(
    private readonly job: SoundImportJob,
    private readonly primingHints: readonly number[] | null,
  ) {}

  add(planes: Planes, sampleRate: number): void {
    const stereo = toStereo(planes);
    if (!this.output) {
      checkSourceShape(sampleRate, planes.length);
      const channels = stereo.length;
      this.output = new OpusOutput(channels, BITRATES[this.job.kind]);
      this.meter = new LoudnessMeter(channels);
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
    return this.output ? this.output.room() : null;
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
    const bytes = await output.finish(skipFrames);
    const result = { ...this.meter.result(), bytes, frames, channels: output.channels };
    return loop ? { ...result, seam: loop.seam } : result;
  }

  close(): void {
    this.output?.close();
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
export async function convertSound(job: SoundImportJob, onProgress: ImportProgress = () => undefined): Promise<SoundImportResult> {
  await checkEncoder(BITRATES[job.kind]);
  const source: SoundSource = await openSoundSource(job.source);
  const path = new PcmPath(job, source.type === 'encoded' ? (source.primingHints ?? null) : null);
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
