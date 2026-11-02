import type { BlobWindow } from './blobWindow';
import { SoundImportError, type EncodedPacket, type EncodedSource } from './demuxTypes';

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES_V1 = [44100, 48000, 32000];
/** A decoder's own delay: what a LAME tag's numbers leave out. */
const DECODER_DELAY = 528 + 1;
const HEADER_BYTES = 4;
/** LAME's 576 and the decoder's own: every file from LAME or FFmpeg that lost its tag. */
const LAME_PRIMING: readonly number[] = [576 + DECODER_DELAY];
const MAX_FRAME_BYTES = 2881;

interface FrameHeader {
  length: number;
  frames: number;
  sampleRate: number;
  channels: number;
  /** Bytes from the frame's start to the side information's end, where a Xing tag lies. */
  tagOffset: number;
}

function frameHeader(bytes: Uint8Array, at: number): FrameHeader | null {
  const b1 = bytes[at] ?? 0;
  const b2 = bytes[at + 1] ?? 0;
  const b3 = bytes[at + 2] ?? 0;
  const b4 = bytes[at + 3] ?? 0;
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;
  const version = (b2 >> 3) & 3;
  const layer = (b2 >> 1) & 3;
  // Layer III only: nobody has MP2 sounds, and a false sync is likeliest to read as something else.
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = b3 >> 4;
  const rateIndex = (b3 >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const isV1 = version === 3;
  const sampleRate = (RATES_V1[rateIndex] ?? 0) / (isV1 ? 1 : version === 2 ? 2 : 4);
  const bitrate = ((isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] ?? 0) * 1000;
  const padding = (b3 >> 1) & 1;
  const frames = isV1 ? 1152 : 576;
  const channels = b4 >> 6 === 3 ? 1 : 2;
  const length = Math.floor(((frames / 8) * bitrate) / sampleRate) + padding;
  const sideInfo = isV1 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17;
  return { length, frames, sampleRate, channels, tagOffset: HEADER_BYTES + sideInfo };
}

/** A frame is real when another begins right where it ends. */
function isFrameAt(bytes: Uint8Array, at: number): FrameHeader | null {
  const header = frameHeader(bytes, at);
  if (!header) return null;
  const next = at + header.length;
  if (next + HEADER_BYTES > bytes.length) return header;
  return frameHeader(bytes, next) ? header : null;
}

function id3Size(head: Uint8Array): number {
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const size = ((head[6] ?? 0) << 21) | ((head[7] ?? 0) << 14) | ((head[8] ?? 0) << 7) | (head[9] ?? 0);
  return size + 10 + ((head[5] ?? 0) & 0x10 ? 10 : 0);
}

export function looksLikeMp3(head: Uint8Array): boolean {
  return id3Size(head) > 0 || isFrameAt(head, 0) !== null;
}

interface GaplessTag {
  /** The tag's own frame is no audio. */
  delay: number;
  padding: number;
  frames: number | null;
}

/** The Xing or Info frame, and in it what LAME wrote of its delay and padding. */
function readGaplessTag(bytes: Uint8Array, at: number, header: FrameHeader): GaplessTag | null {
  const tag = at + header.tagOffset;
  const name = String.fromCharCode(...bytes.subarray(tag, tag + 4));
  if (name !== 'Xing' && name !== 'Info') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint32(tag + 4);
  let cursor = tag + 8;
  const frameCount = flags & 1 ? view.getUint32(cursor) : null;
  if (flags & 1) cursor += 4;
  if (flags & 2) cursor += 4;
  if (flags & 4) cursor += 100;
  if (flags & 8) cursor += 4;
  const encoder = String.fromCharCode(...bytes.subarray(cursor, cursor + 4));
  // Lavf and Lavc write LAME's fields too.
  const hasFields = encoder === 'LAME' || encoder === 'Lavf' || encoder === 'Lavc';
  const b1 = bytes[cursor + 21] ?? 0;
  const b2 = bytes[cursor + 22] ?? 0;
  const b3 = bytes[cursor + 23] ?? 0;
  return {
    delay: hasFields ? (b1 << 4) | (b2 >> 4) : 0,
    padding: hasFields ? ((b2 & 0xf) << 8) | b3 : 0,
    frames: frameCount === null ? null : frameCount * header.frames,
  };
}

export async function demuxMp3(window: BlobWindow): Promise<EncodedSource> {
  const head = await window.at(0, 16);
  let start = id3Size(head);
  // The first frame, skipping any junk between the tag and the audio.
  let bytes = await window.from(start, MAX_FRAME_BYTES * 3);
  let first = 0;
  while (first < bytes.length - HEADER_BYTES && !isFrameAt(bytes, first)) first++;
  const header = isFrameAt(bytes, first);
  if (!header) throw new SoundImportError('unreadable', 'No MP3 frame found.');
  start += first;
  bytes = await window.from(start, MAX_FRAME_BYTES * 3);
  const tag = readGaplessTag(bytes, 0, header);
  const audioStart = tag ? start + header.length : start;
  const hasDelay = tag !== null && (tag.delay > 0 || tag.padding > 0);
  const skipFrames = hasDelay ? tag.delay + DECODER_DELAY : 0;
  const totalFrames = hasDelay && tag.frames !== null ? tag.frames - tag.delay - tag.padding : null;
  let position = audioStart;
  return {
    type: 'encoded',
    codec: 'mp3',
    sampleRate: header.sampleRate,
    channels: header.channels,
    skipFrames,
    totalFrames,
    ...(hasDelay ? {} : { primingHints: LAME_PRIMING }),
    progress: () => position / Math.max(1, window.size),
    async *packets() {
      while (position + HEADER_BYTES <= window.size) {
        const available = await window.from(position, MAX_FRAME_BYTES * 2);
        let at = 0;
        const end = available.length - (position + available.length < window.size ? MAX_FRAME_BYTES : 0);
        const out: EncodedPacket[] = [];
        while (at + HEADER_BYTES <= end) {
          const frame = frameHeader(available, at);
          // Between frames only junk lies, and ID3v1 at the end: look for the next real one.
          if (!frame || at + frame.length > available.length || !isFrameAt(available, at)) {
            at++;
            continue;
          }
          out.push({ data: available.slice(at, at + frame.length), frames: frame.frames });
          at += frame.length;
        }
        position += Math.max(at, 1);
        yield* out;
      }
    },
  };
}
