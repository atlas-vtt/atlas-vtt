import type { SoundBytes } from '../soundTypes';
import { packetsOfPage, readPage, type CarriedPacket } from './oggPages';
import { isOpusHead, opusPacketFrames, readOpusComment, readOpusHead } from './opusFormat';
import { decodeSeekTable, SEEK_COMMENT, seekIndexFor, type SeekEntry } from './seekTable';

const HEADER_READ_BYTES = 128 * 1024;
/** Twice the most Opus can hold in the stretch a range covers, even where a table is coarse. */
const MAX_RANGE_BYTES = 32 * 1024 * 1024;

export interface OggOpusSound {
  head: Uint8Array;
  channels: number;
  preSkip: number;
  /** Byte at which the first audio page begins. */
  audioStart: number;
  seek: SeekEntry[];
  byteLength: number;
}

/** A packet of a read range, with the position it starts at (pre-skip included). */
export interface PositionedPacket {
  bytes: Uint8Array;
  startGranule: number;
  frames: number;
}

/** Reads the header pages. A file written elsewhere simply has one seek entry, its first audio page. */
export async function openOggOpus(source: SoundBytes): Promise<OggOpusSound> {
  const bytes = await source.read(0, Math.min(HEADER_READ_BYTES, source.byteLength));
  const headPage = readPage(bytes, 0);
  if (!headPage) throw new Error('The sound is too short to hold an Ogg header.');
  const head = packetsOfPage(headPage, null).packets[0];
  if (!head || !isOpusHead(head)) throw new Error('The sound is not Ogg Opus.');
  const { channels, preSkip, mappingFamily } = readOpusHead(head);
  if (mappingFamily !== 0) throw new Error('Only Opus mapping family 0 can be played.');
  let offset = headPage.end;
  let carried: CarriedPacket | null = null;
  let tags: Uint8Array | undefined;
  while (!tags) {
    const page = readPage(bytes, offset);
    if (!page) throw new Error('The header of the sound is longer than it should be.');
    const parts = packetsOfPage(page, carried);
    tags = parts.packets[0];
    carried = parts.tail;
    offset = page.end;
  }
  const table = readOpusComment(tags, SEEK_COMMENT);
  const seek = table ? decodeSeekTable(table).filter((entry) => offset + entry.byte < source.byteLength) : [];
  return {
    head: head.slice(),
    channels,
    preSkip,
    audioStart: offset,
    seek: seek.length > 0 ? seek : [{ byte: 0, granule: 0 }],
    byteLength: source.byteLength,
  };
}

/**
 * Packets of the seek stretches that cover a range of positions, with one range read. A page always
 * begins a packet, as the writer never lets one run across pages.
 */
export async function readPacketRange(sound: OggOpusSound, source: SoundBytes, fromGranule: number, toGranule: number): Promise<PositionedPacket[]> {
  const first = seekIndexFor(sound.seek, fromGranule);
  const start = sound.seek[first];
  if (!start) return [];
  const next = sound.seek[seekIndexFor(sound.seek, toGranule) + 1];
  const begin = sound.audioStart + start.byte;
  const end = next ? sound.audioStart + next.byte : sound.byteLength;
  if (end - begin > MAX_RANGE_BYTES) throw new Error('The sound has no seek table that fits its length.');
  const bytes = await source.read(begin, end);
  const packets: PositionedPacket[] = [];
  let offset = 0;
  let position = start.granule;
  for (;;) {
    const page = readPage(bytes, offset);
    if (!page) break;
    for (const packet of packetsOfPage(page, null).packets) {
      const frames = opusPacketFrames(packet);
      packets.push({ bytes: packet, startGranule: position, frames });
      position += frames;
    }
    offset = page.end;
  }
  return packets;
}
