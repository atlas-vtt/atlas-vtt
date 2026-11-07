/** Opus in Ogg (RFC 7845, RFC 6716): the two header packets and how long a packet lasts. */

const OPUS_HEAD = 'OpusHead';
const OPUS_TAGS = 'OpusTags';

export interface OpusHead {
  channels: number;
  preSkip: number;
  mappingFamily: number;
}

function startsWith(packet: Uint8Array, magic: string): boolean {
  for (let i = 0; i < magic.length; i++) if (packet[i] !== magic.charCodeAt(i)) return false;
  return true;
}

export function isOpusHead(packet: Uint8Array): boolean {
  return packet.length >= 19 && startsWith(packet, OPUS_HEAD);
}

export function readOpusHead(packet: Uint8Array): OpusHead {
  if (!isOpusHead(packet)) throw new Error('Not an Opus stream.');
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  return { channels: packet[9] ?? 0, preSkip: view.getUint16(10, true), mappingFamily: packet[18] ?? 0 };
}

/** A family 0 head with output gain 0: gain is applied at playback, never baked in. */
export function writeOpusHead(channels: number, preSkip: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(19);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(OPUS_HEAD), 0);
  bytes[8] = 1;
  bytes[9] = channels;
  view.setUint16(10, preSkip, true);
  view.setUint32(12, 48000, true);
  view.setInt16(16, 0, true);
  bytes[18] = 0;
  return bytes;
}

export function writeOpusTags(comments: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  const vendor = encoder.encode('Atlas VTT');
  const encoded = comments.map((comment) => encoder.encode(comment));
  const length = 8 + 4 + vendor.length + 4 + encoded.reduce((sum, comment) => sum + 4 + comment.length, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode(OPUS_TAGS), 0);
  view.setUint32(8, vendor.length, true);
  bytes.set(vendor, 12);
  let offset = 12 + vendor.length;
  view.setUint32(offset, encoded.length, true);
  offset += 4;
  for (const comment of encoded) {
    view.setUint32(offset, comment.length, true);
    bytes.set(comment, offset + 4);
    offset += 4 + comment.length;
  }
  return bytes;
}

/** The value of a comment, or null. Lengths come from the file, so each is checked against what is there. */
export function readOpusComment(packet: Uint8Array, name: string): string | null {
  if (packet.length < 16 || !startsWith(packet, OPUS_TAGS)) return null;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  let offset = 12 + view.getUint32(8, true);
  if (offset + 4 > packet.length) return null;
  const count = view.getUint32(offset, true);
  offset += 4;
  const decoder = new TextDecoder();
  const prefix = `${name}=`;
  for (let i = 0; i < count && offset + 4 <= packet.length; i++) {
    const length = view.getUint32(offset, true);
    offset += 4;
    if (offset + length > packet.length) return null;
    const comment = decoder.decode(packet.subarray(offset, offset + length));
    if (comment.startsWith(prefix)) return comment.slice(prefix.length);
    offset += length;
  }
  return null;
}

/** Samples per frame at 48 kHz for each of the 32 configurations of RFC 6716, section 3.1. */
const FRAME_SAMPLES = [
  480, 960, 1920, 2880, 480, 960, 1920, 2880, 480, 960, 1920, 2880, 480, 960, 480, 960,
  120, 240, 480, 960, 120, 240, 480, 960, 120, 240, 480, 960, 120, 240, 480, 960,
];

/** How many samples at 48 kHz a packet decodes to. */
export function opusPacketFrames(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) return 0;
  const perFrame = FRAME_SAMPLES[toc >> 3] ?? 0;
  const code = toc & 3;
  if (code === 0) return perFrame;
  if (code < 3) return perFrame * 2;
  return perFrame * ((packet[1] ?? 0) & 0x3f);
}
