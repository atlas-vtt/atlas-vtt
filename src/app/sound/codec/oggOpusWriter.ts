import { FLAG_FIRST, FLAG_LAST, lacingOf, MAX_SEGMENTS, writePage } from './oggPages';
import { encodeSeekTable, SEEK_COMMENT, SEEK_INTERVAL_FRAMES, WHOLE_DECODE_FRAMES, type SeekEntry } from './seekTable';
import { opusPacketFrames, readOpusHead, writeOpusHead, writeOpusTags } from './opusFormat';

/** RFC 7845 recommends at most a second per page; at 20 ms a packet this is that. */
const MAX_PAGE_FRAMES = 48_000;
/** Written pages move out of the JS heap in pieces of this size. */
const BLOB_PIECE_BYTES = 1 << 20;
const STREAM_SERIAL = 0x41544c53;
/** What one Ogg page holds, less the comment's own framing. */
const MAX_TABLE_CHARS = 64_000;

interface PendingPage {
  packets: Uint8Array[];
  segments: number[];
  /** Position after the page's last packet. */
  granule: number;
  startGranule: number;
}

/** A page as it is written: its bytes, where it starts (from the first audio page), and the granules it covers. */
export interface WrittenPage {
  bytes: Uint8Array;
  byte: number;
  startGranule: number;
  granule: number;
}

function newPage(granule: number): PendingPage {
  return { packets: [], segments: [], granule, startGranule: granule };
}

/**
 * Writes one Ogg Opus stream (mapping family 0) from encoded packets, without holding the audio on the
 * JS heap. The final granule is pre-skip plus the input's frames, which is what makes the decoded length
 * exact. The header is written last, since the seek table it carries is known last; its offsets count
 * from the first audio page, so its own length moves nothing.
 */
export class OggOpusWriter {
  private preSkip: number;
  private head: Uint8Array;
  private readonly pieces: Blob[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private written = 0;
  private sequence = 2;
  private page: PendingPage = newPage(0);
  private readonly seek: SeekEntry[] = [];
  private nextSeekGranule = 0;

  /** `onPage` hears each audio page as it is written, for a copy played while it is made. */
  constructor(head: Uint8Array, private readonly onPage?: (page: WrittenPage) => void) {
    this.head = head;
    this.preSkip = readOpusHead(head).preSkip;
  }

  addPacket(packet: Uint8Array): void {
    const frames = opusPacketFrames(packet);
    const lacing = lacingOf(packet.length);
    const full = this.page.segments.length + lacing.length > MAX_SEGMENTS || this.page.granule + frames - this.page.startGranule > MAX_PAGE_FRAMES;
    if (full && this.page.packets.length > 0) this.flushPage(0);
    this.page.packets.push(packet);
    this.page.segments.push(...lacing);
    this.page.granule += frames;
  }

  /**
   * Ends the stream at `frames` and returns the whole file. `skipFrames` of what was added before those come
   * off the start: they stay in the stream, for the decoder to run in on.
   */
  finish(frames: number, skipFrames = 0): Blob {
    if (skipFrames > 0) {
      const { channels, preSkip } = readOpusHead(this.head);
      this.preSkip = preSkip + skipFrames;
      this.head = writeOpusHead(channels, this.preSkip);
    }
    const finalGranule = this.preSkip + frames;
    if (this.page.granule < finalGranule) throw new Error('The encoder gave less audio than it was given.');
    this.dropPacketsPast(finalGranule);
    this.page.granule = finalGranule;
    this.flushPage(FLAG_LAST);
    this.pieces.push(new Blob(this.pending));
    this.pending = [];
    return new Blob([...this.headerPages(frames), ...this.pieces], { type: 'audio/ogg' });
  }

  /** RFC 7845: the end trim should be no more than the last packet holds. */
  private dropPacketsPast(finalGranule: number): void {
    for (;;) {
      const last = this.page.packets.at(-1);
      if (!last || this.page.packets.length < 2) return;
      const frames = opusPacketFrames(last);
      if (this.page.granule - frames < finalGranule) return;
      this.page.packets.pop();
      this.page.segments.splice(-lacingOf(last.length).length);
      this.page.granule -= frames;
    }
  }

  private flushPage(flags: number): void {
    const { packets, segments, granule, startGranule } = this.page;
    if (startGranule >= this.nextSeekGranule) {
      this.seek.push({ byte: this.written, granule: startGranule });
      this.nextSeekGranule = startGranule + SEEK_INTERVAL_FRAMES;
    }
    const bytes = writePage({ flags, granule, serial: STREAM_SERIAL, sequence: this.sequence++, segments, body: packets });
    this.onPage?.({ bytes, byte: this.written, startGranule, granule });
    this.written += bytes.length;
    this.pending.push(bytes);
    this.pendingBytes += bytes.length;
    if (this.pendingBytes >= BLOB_PIECE_BYTES) {
      this.pieces.push(new Blob(this.pending));
      this.pending = [];
      this.pendingBytes = 0;
    }
    this.page = newPage(granule);
  }

  private headerPages(frames: number): Uint8Array[] {
    const comments = frames > WHOLE_DECODE_FRAMES ? [`${SEEK_COMMENT}=${encodeSeekTable(fittingSeekTable(this.seek))}`] : [];
    return oggOpusHeader(this.head, comments, STREAM_SERIAL);
  }
}

/** A table that fits the one page a comment header has here: a longer file gets coarser entries. */
function fittingSeekTable(entries: readonly SeekEntry[]): readonly SeekEntry[] {
  let table = entries;
  while (encodeSeekTable(table).length > MAX_TABLE_CHARS) table = table.filter((_, index) => index % 2 === 0);
  return table;
}

/** The two header pages, each holding one packet. */
function oggOpusHeader(head: Uint8Array, comments: readonly string[], serial: number): Uint8Array[] {
  const tags = writeOpusTags(comments);
  return [
    writePage({ flags: FLAG_FIRST, granule: 0, serial, sequence: 0, segments: lacingOf(head.length), body: [head] }),
    writePage({ flags: 0, granule: 0, serial, sequence: 1, segments: lacingOf(tags.length), body: [tags] }),
  ];
}
