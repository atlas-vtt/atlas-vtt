import type { PositionedPacket } from './oggOpusReader';
import { FLAG_LAST, packetsOfPage, readPage } from './oggPages';
import { isOpusHead, opusPacketFrames, readOpusHead } from './opusFormat';

/**
 * A long sound for players is stored in segments of this much sound: a position names its segment, so a
 * late join or a seek fetches one or two, and the first can go up as soon as half a minute is converted.
 */
export const SEGMENT_FRAMES = 30 * 48_000;
const MANIFEST_FORMAT = 1;
/** A manifest is a few hundred bytes; anything far larger is no manifest of ours. */
const MAX_MANIFEST_CHARS = 4096;

/** What a page needs before any segment: the stream's head, and how long a segment is. */
export interface SegmentManifest {
  format: number;
  head: Uint8Array<ArrayBuffer>;
  channels: number;
  preSkip: number;
  segmentFrames: number;
}

/** The segment holding a position (pre-skip included). */
export function segmentIndexOf(granule: number, preSkip: number, segmentFrames = SEGMENT_FRAMES): number {
  return Math.max(0, Math.floor((granule - preSkip) / segmentFrames));
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function segmentManifest(head: Uint8Array): SegmentManifest {
  const { channels, preSkip } = readOpusHead(head);
  return { format: MANIFEST_FORMAT, head: Uint8Array.from(head), channels, preSkip, segmentFrames: SEGMENT_FRAMES };
}

export function encodeSegmentManifest(manifest: SegmentManifest): string {
  return JSON.stringify({ format: manifest.format, head: toBase64(manifest.head), channels: manifest.channels, preSkip: manifest.preSkip, segmentFrames: manifest.segmentFrames });
}

/** A manifest as a page reads it, or null for anything that is not one this version can play. */
export function readSegmentManifest(text: string): SegmentManifest | null {
  if (text.length > MAX_MANIFEST_CHARS) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { format, head, segmentFrames } = value as Record<string, unknown>;
    if (format !== MANIFEST_FORMAT || typeof head !== 'string' || typeof segmentFrames !== 'number' || !Number.isInteger(segmentFrames) || segmentFrames < 48_000) return null;
    const headBytes = fromBase64(head);
    if (!isOpusHead(headBytes)) return null;
    const read = readOpusHead(headBytes);
    if (read.mappingFamily !== 0) return null;
    return { format, head: headBytes, channels: read.channels, preSkip: read.preSkip, segmentFrames };
  } catch {
    return null;
  }
}

/** A segment as it goes up: its index and its pages' bytes. */
export interface CutSegment {
  index: number;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * Cuts a copy's audio pages into segments as they come: a page belongs to the segment its start lies in, and
 * a segment is handed on once a page of a later one begins (or the copy ends). Pages come in order. The last
 * page always stays with the one before it: its granule is trimmed to the sound's end, so where it begins can
 * only be told from the page before it (a page reading the last segment clamps to it).
 */
export class SegmentCutter {
  private index = 0;
  private pages: Uint8Array[] = [];
  private bytes = 0;

  constructor(
    private readonly preSkip: number,
    private readonly onSegment: (segment: CutSegment) => void,
    private readonly segmentFrames = SEGMENT_FRAMES,
  ) {}

  /** A page and the position its first packet starts at (pre-skip included). */
  add(page: Uint8Array, startGranule: number): void {
    const last = ((page[5] ?? 0) & FLAG_LAST) !== 0;
    const index = last && this.pages.length > 0 ? this.index : segmentIndexOf(startGranule, this.preSkip, this.segmentFrames);
    if (index > this.index && this.pages.length > 0) this.cut();
    this.index = Math.max(this.index, index);
    this.pages.push(page);
    this.bytes += page.byteLength;
  }

  /** The copy has ended: the last segment goes too. */
  finish(): void {
    if (this.pages.length > 0) this.cut();
  }

  private cut(): void {
    const bytes = new Uint8Array(this.bytes);
    let offset = 0;
    for (const page of this.pages) {
      bytes.set(page, offset);
      offset += page.byteLength;
    }
    this.onSegment({ index: this.index, bytes });
    this.pages = [];
    this.bytes = 0;
  }
}

/**
 * The packets of segment `index`, each with the position it starts at. The stream begins at 0; any other
 * segment's first page is never the last one (`SegmentCutter`), and the writer never lets a packet run across
 * pages, so it begins at its granule less what its packets hold. Every later page begins where the one before
 * ended, which holds for the last page too, whose granule is trimmed to the sound's end.
 */
export function packetsOfSegment(bytes: Uint8Array, index: number): PositionedPacket[] {
  const packets: PositionedPacket[] = [];
  let position: number | null = index === 0 ? 0 : null;
  for (let offset = 0; ;) {
    const page = readPage(bytes, offset);
    if (!page) break;
    const parts = packetsOfPage(page, null).packets;
    position ??= page.granule - parts.reduce((sum, packet) => sum + opusPacketFrames(packet), 0);
    for (const packet of parts) {
      const frames = opusPacketFrames(packet);
      packets.push({ bytes: packet, startGranule: position, frames });
      position += frames;
    }
    position = page.granule;
    offset = page.end;
  }
  return packets;
}
