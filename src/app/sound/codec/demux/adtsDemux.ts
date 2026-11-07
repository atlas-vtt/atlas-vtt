import type { BlobWindow } from './blobWindow';
import { SoundImportError, type EncodedPacket, type EncodedSource } from './demuxTypes';

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
const AAC_FRAME_SAMPLES = 1024;
const READ_AHEAD = 1 << 16;
/** Apple's and FFmpeg's encoders. */
export const AAC_PRIMING: readonly number[] = [2112, 1024];

/** A sync word whose fixed bits say AAC in ADTS: layer 0. */
export function looksLikeAdts(head: Uint8Array): boolean {
  return head[0] === 0xff && ((head[1] ?? 0) & 0xf6) === 0xf0;
}

interface AdtsHeader {
  headerLength: number;
  frameLength: number;
  profile: number;
  rateIndex: number;
  channels: number;
}

function adtsHeader(bytes: Uint8Array, at: number): AdtsHeader | null {
  if (bytes[at] !== 0xff || ((bytes[at + 1] ?? 0) & 0xf6) !== 0xf0) return null;
  const b2 = bytes[at + 2] ?? 0;
  const b3 = bytes[at + 3] ?? 0;
  const frameLength = ((b3 & 3) << 11) | ((bytes[at + 4] ?? 0) << 3) | ((bytes[at + 5] ?? 0) >> 5);
  const headerLength = (bytes[at + 1] ?? 0) & 1 ? 7 : 9;
  if (frameLength < headerLength) return null;
  return { headerLength, frameLength, profile: (b2 >> 6) + 1, rateIndex: (b2 >> 2) & 0xf, channels: ((b2 & 1) << 2) | (b3 >> 6) };
}

export async function demuxAdts(window: BlobWindow): Promise<EncodedSource> {
  const head = await window.at(0, 16);
  const first = adtsHeader(head, 0);
  const sampleRate = first && AAC_RATES[first.rateIndex];
  if (!first || !sampleRate || first.channels === 0) throw new SoundImportError('unreadable', 'An ADTS stream with no usable header.');
  // AudioSpecificConfig: object type, rate index and channels, which ADTS repeats on every frame.
  const description = Uint8Array.of((first.profile << 3) | (first.rateIndex >> 1), ((first.rateIndex & 1) << 7) | (first.channels << 3));
  let position = 0;
  return {
    type: 'encoded',
    codec: `mp4a.40.${first.profile}`,
    sampleRate,
    channels: first.channels,
    description,
    skipFrames: 0,
    totalFrames: null,
    primingHints: AAC_PRIMING,
    progress: () => position / Math.max(1, window.size),
    async *packets() {
      while (position < window.size) {
        const bytes = await window.at(position, READ_AHEAD);
        const frame = adtsHeader(bytes, 0);
        if (!frame) {
          position += 1;
          continue;
        }
        if (position + frame.frameLength > window.size) return;
        const whole = await window.at(position, frame.frameLength);
        const packet: EncodedPacket = { data: whole.slice(frame.headerLength, frame.frameLength), frames: AAC_FRAME_SAMPLES };
        position += frame.frameLength;
        yield packet;
      }
    },
  };
}
