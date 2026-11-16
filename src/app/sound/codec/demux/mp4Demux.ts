import { AAC_PRIMING } from './adtsDemux';
import type { BlobWindow } from './blobWindow';
import { SoundImportError, type EncodedPacket, type EncodedSource } from './demuxTypes';

/** More than a year of samples' table is no file anyone has. */
const MAX_MOOV_BYTES = 256 * 1024 * 1024;
/** Four days of AAC at 48 kHz: the most a table is allocated for, at 12 bytes a sample. */
const MAX_SAMPLES = 1 << 24;
/** Far past the longest frame of AAC or MP3. */
const MAX_SAMPLE_BYTES = 1 << 20;
const REFUSED_CODECS = new Set(['alac', 'ac-3', 'ec-3', 'mlpa', 'dtsc', 'dtsh', 'dtse']);

export function isMp4(head: Uint8Array): boolean {
  return boxName(head, 4) === 'ftyp';
}

function boxName(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

interface Box {
  name: string;
  start: number;
  end: number;
}

function* boxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1 && at + 16 <= end) {
      size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) return;
    yield { name: boxName(bytes, at + 4), start: at + header, end: at + size };
    at += size;
  }
}

function child(bytes: Uint8Array, parent: Box, name: string): Box | null {
  for (const box of boxes(bytes, parent.start, parent.end)) if (box.name === name) return box;
  return null;
}

/** Top-level boxes by their headers alone: the audio itself may be gigabytes before the index. */
async function findMoov(window: BlobWindow): Promise<Uint8Array<ArrayBuffer>> {
  let at = 0;
  while (at + 8 <= window.size) {
    const header = await window.at(at, 16);
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let size = view.getUint32(0);
    let headerSize = 8;
    if (size === 1) {
      size = view.getUint32(8) * 2 ** 32 + view.getUint32(12);
      headerSize = 16;
    } else if (size === 0) {
      size = window.size - at;
    }
    if (size < headerSize) break;
    if (boxName(header, 4) === 'moov') {
      if (size > MAX_MOOV_BYTES) throw new SoundImportError('unreadable', 'An MP4 index larger than any should be.');
      return new Uint8Array(await window.blob.slice(at, at + size).arrayBuffer());
    }
    at += size;
  }
  throw new SoundImportError('unreadable', 'An MP4 file without its index.');
}

/** The sound track: the first with an `smhd`. */
function audioTrack(moov: Uint8Array): Box | null {
  const root: Box = { name: 'moov', start: 8, end: moov.length };
  for (const trak of boxes(moov, root.start, root.end)) {
    if (trak.name !== 'trak') continue;
    const mdia = child(moov, trak, 'mdia');
    const minf = mdia && child(moov, mdia, 'minf');
    if (minf && child(moov, minf, 'smhd')) return trak;
  }
  return null;
}

/** An `esds`'s DecoderSpecificInfo, the AudioSpecificConfig the decoder needs. */
function readEsds(bytes: Uint8Array, box: Box): { config: Uint8Array<ArrayBuffer>; objectType: number } | null {
  let at = box.start + 4;
  const length = (): number => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = bytes[at++] ?? 0;
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return value;
  };
  if (bytes[at++] !== 3) return null;
  length();
  at += 3;
  if (bytes[at++] !== 4) return null;
  length();
  const objectType = bytes[at] ?? 0;
  at += 13;
  if (bytes[at++] !== 5) return null;
  const size = length();
  return { config: bytes.slice(at, at + size), objectType };
}

interface SampleTable {
  sizes: Uint32Array;
  offsets: Float64Array;
}

const badTable = (): SoundImportError => new SoundImportError('unreadable', 'An MP4 sample table that does not fit its file.');

/** Each sample's size, every number checked against what a box or the file can hold before anything is allocated for it. Samples never overlap, so together they fit the file. */
function readSampleSizes(view: DataView, stsz: Box, fileBytes: number): Uint32Array {
  const fixedSize = view.getUint32(stsz.start + 4);
  const count = view.getUint32(stsz.start + 8);
  const fits = fixedSize ? fixedSize * count <= fileBytes : 12 + count * 4 <= stsz.end - stsz.start;
  if (!fits || count > MAX_SAMPLES || fixedSize > MAX_SAMPLE_BYTES) throw badTable();
  const sizes = new Uint32Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const size = fixedSize || view.getUint32(stsz.start + 12 + i * 4);
    if (size > MAX_SAMPLE_BYTES) throw badTable();
    sizes[i] = size;
    total += size;
  }
  if (total > fileBytes) throw badTable();
  return sizes;
}

function readSampleTable(moov: Uint8Array, stbl: Box, fileBytes: number): SampleTable {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const stsz = child(moov, stbl, 'stsz');
  const stsc = child(moov, stbl, 'stsc');
  const stco = child(moov, stbl, 'stco');
  const co64 = child(moov, stbl, 'co64');
  if (!stsz || !stsc || (!stco && !co64)) throw new SoundImportError('unreadable', 'An MP4 track without its sample tables.');
  const sizes = readSampleSizes(view, stsz, fileBytes);
  const count = sizes.length;
  const chunkBox = (stco ?? co64) as Box;
  const chunkCount = view.getUint32(chunkBox.start + 4);
  const runs = view.getUint32(stsc.start + 4);
  if (8 + chunkCount * (stco ? 4 : 8) > chunkBox.end - chunkBox.start || 8 + runs * 12 > stsc.end - stsc.start) throw badTable();
  const chunkOffset = (chunk: number): number =>
    stco ? view.getUint32(stco.start + 8 + chunk * 4) : view.getUint32(chunkBox.start + 8 + chunk * 8) * 2 ** 32 + view.getUint32(chunkBox.start + 12 + chunk * 8);
  const offsets = new Float64Array(count);
  let sample = 0;
  for (let run = 0; run < runs && sample < count; run++) {
    const entry = stsc.start + 8 + run * 12;
    const firstChunk = view.getUint32(entry) - 1;
    const perChunk = view.getUint32(entry + 4);
    const nextFirst = run + 1 < runs ? view.getUint32(entry + 12) - 1 : chunkCount;
    // Runs only go forward and each chunk holds a sample, so this walks the chunks once however the table reads.
    if (firstChunk < 0 || nextFirst <= firstChunk || nextFirst > chunkCount || perChunk === 0) throw badTable();
    for (let chunk = firstChunk; chunk < nextFirst && sample < count; chunk++) {
      let at = chunkOffset(chunk);
      for (let i = 0; i < perChunk && sample < count; i++) {
        offsets[sample] = at;
        at += sizes[sample] ?? 0;
        sample++;
      }
    }
  }
  return { sizes, offsets };
}

/** The first `stts` duration: AAC's frames are all one length. */
function sampleDuration(moov: Uint8Array, stbl: Box): number {
  const stts = child(moov, stbl, 'stts');
  if (!stts) return 1024;
  return new DataView(moov.buffer, moov.byteOffset, moov.byteLength).getUint32(stts.start + 12);
}

/** An edit list's start and length: how a file says where its audio begins past the encoder's priming. */
function readEdit(moov: Uint8Array, trak: Box, mediaScale: number, movieScale: number): { skip: number; total: number | null } {
  const edts = child(moov, trak, 'edts');
  const elst = edts && child(moov, edts, 'elst');
  if (!elst) return { skip: 0, total: null };
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const version = moov[elst.start] ?? 0;
  const duration = version === 1 ? view.getUint32(elst.start + 8) * 2 ** 32 + view.getUint32(elst.start + 12) : view.getUint32(elst.start + 8);
  const mediaTime = version === 1 ? view.getUint32(elst.start + 20) : view.getInt32(elst.start + 12);
  return { skip: Math.max(0, mediaTime), total: movieScale > 0 && duration > 0 ? Math.round((duration * mediaScale) / movieScale) : null };
}

/**
 * Apple's way of saying the same: the text `iTunSMPB` in the metadata, then hex numbers of which the second is the
 * priming, the third the padding and the fourth the sound's length. Read wherever it lies, as a bad one only
 * gets looked at by the wrap's check.
 */
function readItunesGapless(moov: Uint8Array): { skipFrames: number; totalFrames: number } | null {
  const name = [...'iTunSMPB'].map((letter) => letter.charCodeAt(0));
  const at = moov.findIndex((_, index) => name.every((code, offset) => moov[index + offset] === code));
  if (at < 0) return null;
  const text = String.fromCharCode(...moov.subarray(at, at + 200));
  const fields = /data[^ ]* ([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{16})/.exec(text);
  if (!fields) return null;
  const skipFrames = parseInt(fields[2] ?? '', 16);
  const totalFrames = parseInt(fields[4] ?? '', 16);
  return totalFrames > 0 ? { skipFrames, totalFrames } : null;
}

export async function demuxMp4(window: BlobWindow): Promise<EncodedSource> {
  const moov = await findMoov(window);
  const trak = audioTrack(moov);
  const mdia = trak && child(moov, trak, 'mdia');
  const minf = mdia && child(moov, mdia, 'minf');
  const stbl = minf && child(moov, minf, 'stbl');
  const stsd = stbl && child(moov, stbl, 'stsd');
  const mdhd = mdia && child(moov, mdia, 'mdhd');
  if (!trak || !stbl || !stsd || !mdhd) throw new SoundImportError('unreadable', 'An MP4 file without a sound track.');
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const entry = stsd.start + 8;
  const format = boxName(moov, entry + 4);
  if (format !== 'mp4a') {
    throw new SoundImportError('unsupported-codec', REFUSED_CODECS.has(format) ? `MP4 holding ${format}` : `MP4 holding an unknown codec, ${format}`);
  }
  const channels = view.getUint16(entry + 24);
  const mediaScale = view.getUint32(mdhd.start + ((moov[mdhd.start] ?? 0) === 1 ? 20 : 12));
  const sampleRate = view.getUint32(entry + 32) >>> 16 || mediaScale;
  const esds = child(moov, { name: 'mp4a', start: entry + 36, end: stsd.end }, 'esds');
  const decoderInfo = esds && readEsds(moov, esds);
  if (!decoderInfo) throw new SoundImportError('unreadable', 'An MP4 sound track without its decoder information.');
  const mvhd = child(moov, { name: 'moov', start: 8, end: moov.length }, 'mvhd');
  const movieScale = mvhd ? view.getUint32(mvhd.start + ((moov[mvhd.start] ?? 0) === 1 ? 20 : 12)) : 0;
  const objectType = ((decoderInfo.config[0] ?? 0) >> 3) & 0x1f;
  const { sizes, offsets } = readSampleTable(moov, stbl, window.size);
  const frames = sampleDuration(moov, stbl);
  const edit = readEdit(moov, trak, mediaScale, movieScale);
  const hasEdit = edit.skip > 0 || edit.total !== null;
  const itunes = hasEdit ? null : readItunesGapless(moov);
  let sample = 0;
  return {
    type: 'encoded',
    codec: decoderInfo.objectType === 0x40 || decoderInfo.objectType === 0x67 ? `mp4a.40.${objectType}` : 'mp3',
    sampleRate,
    channels,
    description: decoderInfo.config,
    skipFrames: edit.skip,
    totalFrames: edit.total,
    ...(itunes ? { loopEnds: itunes } : {}),
    ...(hasEdit || itunes ? {} : { primingHints: AAC_PRIMING }),
    progress: () => (sizes.length > 0 ? sample / sizes.length : 1),
    async *packets() {
      for (; sample < sizes.length; sample++) {
        const size = sizes[sample] ?? 0;
        const bytes = await window.at(offsets[sample] ?? 0, size);
        if (bytes.length < size) throw new SoundImportError('unreadable', 'An MP4 file that ends before its samples do.');
        const packet: EncodedPacket = { data: bytes.slice(0, size), frames };
        yield packet;
      }
    },
  };
}
