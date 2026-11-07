export type SoundRefusal =
  /** The file is no audio format Atlas reads. */
  | 'unknown-format'
  /** A format it knows, with a codec it cannot decode (ALAC, AC-3). */
  | 'unsupported-codec'
  /** This runtime cannot do it: no `AudioEncoder`, or no Opus in it. */
  | 'no-encoder'
  /** Nothing in the file to play. */
  | 'empty'
  /** The file is damaged, or decoding it failed. */
  | 'unreadable'
  /** What was written did not read back as it should. */
  | 'verify-failed';

/** Why a sound cannot be imported: `reason` is for the words shown, `detail` for the log. */
export class SoundImportError extends Error {
  constructor(
    readonly reason: SoundRefusal,
    readonly detail: string,
  ) {
    super(detail);
  }
}

/** What a header may say: a rate outside these is no sound, and turning it into 48 kHz takes a table or an output as far past memory as it is from the range. */
const MIN_SOURCE_RATE = 8_000;
const MAX_SOURCE_RATE = 192_000;
const MAX_SOURCE_CHANNELS = 32;

/** Refuses a source whose header says what no sound is, before anything is allocated for it. */
export function checkSourceShape(sampleRate: number, channels: number): void {
  if (!(sampleRate >= MIN_SOURCE_RATE && sampleRate <= MAX_SOURCE_RATE)) throw new SoundImportError('unreadable', `A sample rate of ${sampleRate} Hz.`);
  if (channels > MAX_SOURCE_CHANNELS) throw new SoundImportError('unreadable', `${channels} channels.`);
}

export interface EncodedPacket {
  data: Uint8Array<ArrayBuffer>;
  /** At the source's own rate. */
  frames: number;
}

interface SourceBase {
  sampleRate: number;
  channels: number;
  /** How far through the file reading is, 0 to 1. */
  progress(): number;
}

/** Packets for an `AudioDecoder`. */
export interface EncodedSource extends SourceBase {
  type: 'encoded';
  codec: string;
  description?: Uint8Array<ArrayBuffer>;
  /** What the decoder gives first that is no part of the sound (encoder priming, decoder delay). */
  skipFrames: number;
  /** The sound's length past the skip where the file says it, which trims what comes after. */
  totalFrames: number | null;
  /** Ends known only for a sound marked as a loop: older imports kept these frames, and a plain sound still does. */
  loopEnds?: { skipFrames: number; totalFrames: number | null };
  /**
   * Of a lossy file that says neither its priming nor its padding, which have to be found in its level: where the
   * encoders that write most such files end their priming, in the decoder's frames.
   */
  primingHints?: readonly number[];
  packets(): AsyncIterable<EncodedPacket>;
}

/** Samples as they are: a WAV. */
export interface PcmSource extends SourceBase {
  type: 'pcm';
  pieces(): AsyncIterable<Float32Array<ArrayBuffer>[]>;
}

export type SoundSource = EncodedSource | PcmSource;
