import { MAX_PAGE_BYTES, packetsOfPage, readPage, type CarriedPacket, type OggPage } from '../oggPages';
import { isOpusHead, opusPacketFrames, readOpusHead, writeOpusHead } from '../opusFormat';
import type { BlobWindow } from './blobWindow';
import { SoundImportError, type EncodedPacket, type EncodedSource } from './demuxTypes';

/** A packet's length is only for its timestamp, which nothing reads: the output is counted as it comes. */
const VORBIS_NOMINAL_FRAMES = 1024;

export function isOgg(head: Uint8Array): boolean {
  return head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53;
}

function isVorbisHeader(packet: Uint8Array, type: number): boolean {
  return packet[0] === type && String.fromCharCode(...packet.subarray(1, 7)) === 'vorbis';
}

async function pageAt(window: BlobWindow, offset: number): Promise<OggPage | null> {
  const bytes = await window.at(offset, MAX_PAGE_BYTES);
  return readPage(bytes, 0);
}

/** The final granule of a stream: the last page's, at the end of the file. */
async function lastGranule(window: BlobWindow, serial: number): Promise<number | null> {
  const start = Math.max(0, window.size - MAX_PAGE_BYTES * 2);
  const tail = new Uint8Array(await window.blob.slice(start, window.size).arrayBuffer());
  let granule: number | null = null;
  for (let at = 0; at < tail.length - 4; at++) {
    if (tail[at] !== 0x4f || tail[at + 1] !== 0x67 || tail[at + 2] !== 0x67 || tail[at + 3] !== 0x53) continue;
    const page = readTailPage(tail, at);
    if (page && page.serial === serial && page.granule >= 0) granule = page.granule;
  }
  return granule;
}

function readTailPage(tail: Uint8Array, at: number): OggPage | null {
  try {
    return readPage(tail, at);
  } catch {
    return null;
  }
}

function xiphLacing(packets: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const sizes: number[] = [packets.length - 1];
  for (const packet of packets.slice(0, -1)) {
    let size = packet.length;
    while (size >= 255) {
      sizes.push(255);
      size -= 255;
    }
    sizes.push(size);
  }
  const out = new Uint8Array(sizes.length + packets.reduce((sum, packet) => sum + packet.length, 0));
  out.set(sizes, 0);
  let at = sizes.length;
  for (const packet of packets) {
    out.set(packet, at);
    at += packet.length;
  }
  return out;
}

export async function demuxOgg(window: BlobWindow): Promise<EncodedSource> {
  const first = await pageAt(window, 0);
  const firstPacket = first && packetsOfPage(first, null).packets[0];
  if (!first || !firstPacket) throw new SoundImportError('unreadable', 'An Ogg file without a first packet.');
  const serial = first.serial;
  const last = await lastGranule(window, serial);
  if (isOpusHead(firstPacket)) return opusSource(window, first, firstPacket, last);
  if (isVorbisHeader(firstPacket, 1)) return vorbisSource(window, first, firstPacket, last);
  throw new SoundImportError('unsupported-codec', 'An Ogg stream that is neither Opus nor Vorbis.');
}

async function opusSource(window: BlobWindow, first: OggPage, head: Uint8Array, last: number | null): Promise<EncodedSource> {
  const { channels, preSkip, mappingFamily } = readOpusHead(head);
  if (mappingFamily !== 0 || channels > 2) throw new SoundImportError('unsupported-codec', `Opus mapping family ${mappingFamily}`);
  // Headers end where the comment packet does.
  let offset = first.end;
  let carried: CarriedPacket | null = null;
  for (;;) {
    const page = await pageAt(window, offset);
    if (!page) throw new SoundImportError('unreadable', 'An Ogg Opus file without comments.');
    offset += page.end;
    const parts = packetsOfPage(page, carried);
    carried = parts.tail;
    if (parts.packets.length > 0) break;
  }
  return {
    type: 'encoded',
    codec: 'opus',
    sampleRate: 48_000,
    channels,
    // Pre-skip 0: whether a decoder drops it is not settled between engines, so it never gets to.
    description: writeOpusHead(channels, 0),
    skipFrames: preSkip,
    totalFrames: last === null ? null : Math.max(0, last - preSkip),
    ...pagedPackets(window, offset, first.serial, opusPacketFrames),
  };
}

async function vorbisSource(window: BlobWindow, first: OggPage, ident: Uint8Array, last: number | null): Promise<EncodedSource> {
  const view = new DataView(ident.buffer, ident.byteOffset, ident.byteLength);
  const channels = ident[11] ?? 0;
  const sampleRate = view.getUint32(12, true);
  const headers: Uint8Array[] = [ident];
  let offset = first.end;
  let carried: CarriedPacket | null = null;
  while (headers.length < 3) {
    const page = await pageAt(window, offset);
    if (!page) throw new SoundImportError('unreadable', 'A Vorbis stream without its headers.');
    offset += page.end;
    if (page.serial !== first.serial) continue;
    const parts = packetsOfPage(page, carried);
    carried = parts.tail;
    headers.push(...parts.packets.map((packet) => packet.slice()));
  }
  const setup = headers[2];
  if (!setup || !isVorbisHeader(setup, 5)) throw new SoundImportError('unreadable', 'A Vorbis stream with broken headers.');
  return {
    type: 'encoded',
    codec: 'vorbis',
    sampleRate,
    channels,
    description: xiphLacing(headers.slice(0, 3)),
    skipFrames: 0,
    totalFrames: last,
    ...pagedPackets(window, offset, first.serial, () => VORBIS_NOMINAL_FRAMES),
  };
}

function pagedPackets(window: BlobWindow, start: number, serial: number, framesOf: (packet: Uint8Array) => number): Pick<EncodedSource, 'progress' | 'packets'> {
  let offset = start;
  return {
    progress: () => offset / Math.max(1, window.size),
    async *packets() {
      let carried: CarriedPacket | null = null;
      for (;;) {
        const page = await pageAt(window, offset);
        if (!page) return;
        offset += page.end;
        if (page.serial !== serial) continue;
        const parts = packetsOfPage(page, carried);
        carried = parts.tail;
        for (const packet of parts.packets) {
          const out: EncodedPacket = { data: packet.slice(), frames: framesOf(packet) };
          yield out;
        }
      }
    },
  };
}
