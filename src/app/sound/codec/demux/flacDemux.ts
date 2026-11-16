import type { BlobWindow } from './blobWindow';
import { SoundImportError, type EncodedPacket, type EncodedSource } from './demuxTypes';

const MAX_FRAME_HEADER = 16;
/** Far past any block of music; a frame splitter that finds nothing this far on has lost the stream. */
const READ_AHEAD = 512 * 1024;
const BLOCK_SIZES = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

export function isFlac(head: Uint8Array): boolean {
  return head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43;
}

const CRC8 = Uint8Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  return crc;
});

/** The block size of the frame whose header is valid at `at`, else 0. The header's CRC tells real from false. */
function frameHeaderAt(bytes: Uint8Array, at: number, streamBlock: number): number {
  if (bytes[at] !== 0xff || ((bytes[at + 1] ?? 0) & 0xfe) !== 0xf8) return 0;
  const b2 = bytes[at + 2] ?? 0;
  const b3 = bytes[at + 3] ?? 0;
  const blockCode = b2 >> 4;
  const rateCode = b2 & 0xf;
  if (blockCode === 0 || rateCode === 15 || (b3 >> 4) > 10 || (b3 & 1) !== 0 || ((b3 >> 1) & 7) === 3 || ((b3 >> 1) & 7) === 7) return 0;
  let cursor = at + 4;
  // UTF-8-like coded frame or sample number.
  const first = bytes[cursor] ?? 0xff;
  let extra = 0;
  if (first >= 0xfe) extra = first === 0xfe ? 6 : -1;
  else if (first >= 0xfc) extra = 5;
  else if (first >= 0xf8) extra = 4;
  else if (first >= 0xf0) extra = 3;
  else if (first >= 0xe0) extra = 2;
  else if (first >= 0xc0) extra = 1;
  else if (first >= 0x80) extra = -1;
  if (extra < 0) return 0;
  cursor += 1 + extra;
  let block = BLOCK_SIZES[blockCode] ?? 0;
  if (blockCode === 6) {
    block = (bytes[cursor] ?? 0) + 1;
    cursor += 1;
  } else if (blockCode === 7) {
    block = (((bytes[cursor] ?? 0) << 8) | (bytes[cursor + 1] ?? 0)) + 1;
    cursor += 2;
  }
  if (rateCode === 12) cursor += 1;
  else if (rateCode === 13 || rateCode === 14) cursor += 2;
  let crc = 0;
  for (let i = at; i < cursor; i++) crc = CRC8[crc ^ (bytes[i] ?? 0)] ?? 0;
  if (crc !== bytes[cursor]) return 0;
  return block > 0 && (streamBlock === 0 || block <= streamBlock) ? block : 0;
}

export async function demuxFlac(window: BlobWindow): Promise<EncodedSource> {
  let offset = 4;
  let streamInfo: Uint8Array | null = null;
  for (;;) {
    const header = await window.at(offset, 64);
    if (header.length < 4) throw new SoundImportError('unreadable', 'FLAC metadata ends early.');
    const type = (header[0] ?? 0) & 0x7f;
    const last = ((header[0] ?? 0) & 0x80) !== 0;
    const size = ((header[1] ?? 0) << 16) | ((header[2] ?? 0) << 8) | (header[3] ?? 0);
    if (type === 0) streamInfo = (await window.at(offset, 4 + size)).slice(0, 4 + size);
    offset += 4 + size;
    if (last) break;
  }
  if (!streamInfo || streamInfo.length < 38) throw new SoundImportError('unreadable', 'A FLAC file without stream information.');
  const info = streamInfo.subarray(4);
  const maxBlock = ((info[2] ?? 0) << 8) | (info[3] ?? 0);
  const sampleRate = ((info[10] ?? 0) << 12) | ((info[11] ?? 0) << 4) | ((info[12] ?? 0) >> 4);
  const channels = (((info[12] ?? 0) >> 1) & 7) + 1;
  const total = (((info[13] ?? 0) & 0xf) * 2 ** 32) + (((info[14] ?? 0) << 24) >>> 0) + ((info[15] ?? 0) << 16) + ((info[16] ?? 0) << 8) + (info[17] ?? 0);
  if (!sampleRate) throw new SoundImportError('unreadable', 'A FLAC file without a sample rate.');
  // As the WebCodecs registry asks: the marker, then the metadata block.
  const description = new Uint8Array(4 + streamInfo.length);
  description.set([0x66, 0x4c, 0x61, 0x43], 0);
  description.set(streamInfo, 4);
  description[4] = 0x80;
  let position = offset;
  return {
    type: 'encoded',
    codec: 'flac',
    sampleRate,
    channels,
    description,
    skipFrames: 0,
    totalFrames: total > 0 ? total : null,
    progress: () => position / Math.max(1, window.size),
    async *packets() {
      while (position + MAX_FRAME_HEADER < window.size) {
        const bytes = await window.from(position, READ_AHEAD);
        const atEnd = position + bytes.length >= window.size;
        const block = frameHeaderAt(bytes, 0, maxBlock);
        if (!block) {
          position += 1;
          continue;
        }
        let next = 2;
        while (next < bytes.length - MAX_FRAME_HEADER && !frameHeaderAt(bytes, next, maxBlock)) next++;
        const found = next < bytes.length - MAX_FRAME_HEADER;
        if (!found && !atEnd) throw new SoundImportError('unreadable', 'A FLAC frame longer than any should be.');
        const end = found ? next : bytes.length;
        const packet: EncodedPacket = { data: bytes.slice(0, end), frames: block };
        position += end;
        yield packet;
      }
    },
  };
}
