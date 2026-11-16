/** Ogg pages (RFC 3533): the framing every Atlas sound is stored in. */

const CAPTURE = [0x4f, 0x67, 0x67, 0x53];
const PAGE_HEADER_BYTES = 27;
export const MAX_SEGMENTS = 255;
/** The most an Ogg page can be. */
export const MAX_PAGE_BYTES = 65_307;
/** Far past any packet of sound, and past a comment packet holding its cover: what goes on longer is no sound file. */
export const MAX_PACKET_BYTES = 64 * 1024 * 1024;

const FLAG_CONTINUED = 1;
export const FLAG_FIRST = 2;
export const FLAG_LAST = 4;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let register = index << 24;
  for (let bit = 0; bit < 8; bit++) register = register & 0x80000000 ? (register << 1) ^ 0x04c11db7 : register << 1;
  return register >>> 0;
});

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  return crc;
}

export interface PageInput {
  flags: number;
  /** Position after the page's last completed packet, or -1 where no packet completes on it. */
  granule: number;
  serial: number;
  sequence: number;
  /** Lacing values, whose sum is the length of `body`. */
  segments: readonly number[];
  body: readonly Uint8Array[];
}

export function writePage(page: PageInput): Uint8Array {
  const bodyLength = page.body.reduce((sum, part) => sum + part.length, 0);
  const headerLength = PAGE_HEADER_BYTES + page.segments.length;
  const bytes = new Uint8Array(headerLength + bodyLength);
  const view = new DataView(bytes.buffer);
  bytes.set(CAPTURE, 0);
  bytes[5] = page.flags;
  if (page.granule < 0) {
    view.setInt32(6, -1, true);
    view.setInt32(10, -1, true);
  } else {
    view.setUint32(6, page.granule % 2 ** 32, true);
    view.setUint32(10, Math.floor(page.granule / 2 ** 32), true);
  }
  view.setUint32(14, page.serial, true);
  view.setUint32(18, page.sequence, true);
  bytes[26] = page.segments.length;
  bytes.set(page.segments, PAGE_HEADER_BYTES);
  let offset = headerLength;
  for (const part of page.body) {
    bytes.set(part, offset);
    offset += part.length;
  }
  view.setUint32(22, oggCrc(bytes), true);
  return bytes;
}

/** Lacing values of one packet: a multiple of 255 ends in a 0, or the reader would wait for more. */
export function lacingOf(length: number): number[] {
  const values = new Array<number>(Math.floor(length / 255)).fill(255);
  values.push(length % 255);
  return values;
}

export interface OggPage {
  /** Where the page begins in the bytes it was read from. */
  offset: number;
  /** Where the next page begins. */
  end: number;
  flags: number;
  granule: number;
  serial: number;
  sequence: number;
  segments: Uint8Array;
  body: Uint8Array;
}

function isCapture(bytes: Uint8Array, at: number): boolean {
  return bytes[at] === 0x4f && bytes[at + 1] === 0x67 && bytes[at + 2] === 0x67 && bytes[at + 3] === 0x53;
}

export class OggCorruptError extends Error {}

/**
 * The page at `offset`, null when the bytes end before it does. A page whose checksum does not match is
 * refused. That catches damage, not forgery: a range read cannot be checked against the file's hash, so
 * what it is worth rests on the store holding files under their hash.
 */
export function readPage(bytes: Uint8Array, offset: number): OggPage | null {
  if (offset + PAGE_HEADER_BYTES > bytes.length) return null;
  if (!isCapture(bytes, offset)) throw new OggCorruptError('Not an Ogg page.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes[offset + 26] ?? 0;
  const bodyStart = offset + PAGE_HEADER_BYTES + count;
  if (bodyStart > bytes.length) return null;
  const segments = bytes.subarray(offset + PAGE_HEADER_BYTES, bodyStart);
  const bodyLength = segments.reduce((sum, value) => sum + value, 0);
  const end = bodyStart + bodyLength;
  if (end > bytes.length) return null;
  const whole = bytes.slice(offset, end);
  new DataView(whole.buffer).setUint32(22, 0, true);
  if (oggCrc(whole) !== view.getUint32(offset + 22, true)) throw new OggCorruptError('An Ogg page failed its checksum.');
  const low = view.getUint32(offset + 6, true);
  const high = view.getInt32(offset + 10, true);
  return {
    offset,
    end,
    flags: bytes[offset + 5] ?? 0,
    granule: high < 0 ? -1 : high * 2 ** 32 + low,
    serial: view.getUint32(offset + 14, true),
    sequence: view.getUint32(offset + 18, true),
    segments,
    body: bytes.subarray(bodyStart, end),
  };
}

/** A packet that goes on on the next page: its pieces, joined only once it ends, so a packet over many pages costs its length once. */
export interface CarriedPacket {
  pieces: Uint8Array[];
  length: number;
}

/** Packets complete on one page, plus a tail that goes on on the next. A packet longer than any should be is refused. */
export function packetsOfPage(page: OggPage, carried: CarriedPacket | null): { packets: Uint8Array[]; tail: CarriedPacket | null } {
  const packets: Uint8Array[] = [];
  let start = 0;
  let length = 0;
  let head = page.flags & FLAG_CONTINUED ? carried : null;
  for (const value of page.segments) {
    length += value;
    if (value === 255) continue;
    packets.push(joined(head, page.body.subarray(start, start + length)));
    head = null;
    start += length;
    length = 0;
  }
  return { packets, tail: carriedOn(head, page.body.subarray(start)) };
}

function checkedLength(head: CarriedPacket | null, rest: Uint8Array): number {
  const length = (head?.length ?? 0) + rest.length;
  if (length > MAX_PACKET_BYTES) throw new OggCorruptError('An Ogg packet longer than any should be.');
  return length;
}

/** A copy of what goes on: the page's bytes are a view of a window of the file, which must not stay in memory for it. */
function carriedOn(head: CarriedPacket | null, rest: Uint8Array): CarriedPacket | null {
  if (rest.length === 0) return head;
  const length = checkedLength(head, rest);
  if (!head) return { pieces: [rest.slice()], length };
  head.pieces.push(rest.slice());
  head.length = length;
  return head;
}

function joined(head: CarriedPacket | null, rest: Uint8Array): Uint8Array {
  if (!head) return rest;
  const bytes = new Uint8Array(checkedLength(head, rest));
  let at = 0;
  for (const piece of [...head.pieces, rest]) {
    bytes.set(piece, at);
    at += piece.length;
  }
  return bytes;
}
