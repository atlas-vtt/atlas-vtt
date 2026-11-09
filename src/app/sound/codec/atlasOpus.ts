import { FLAG_FIRST, FLAG_LAST, lacingOf, MAX_PAGE_BYTES, MAX_SEGMENTS, OggCorruptError, packetsOfPage, readPage, writePage, type OggPage } from './oggPages';
import { isOpusHead, MAX_COMMENTS, readOpusComments, readOpusHead, writeOpusTags } from './opusFormat';
import { SEEK_COMMENT } from './seekTable';
import { PEAK_BUCKETS } from './soundPeaks';
import { fromBase64, toBase64 } from './soundSegments';

/**
 * Atlas' own Opus files carry what is known of them in their comment header, so a start reads a file's first
 * pages and last page and nothing more. The header is the second page, and every offset Atlas writes counts
 * from the first audio page, so rewriting that page alone keeps the file whole.
 */

/** Raise this whenever conversion gives other bytes for the same file (a new loop wrap, another encoder setting). */
export const CODEC_VERSION = 1;

const VTT = 'ATLAS_VTT';
const SOURCE = 'ATLAS_SOURCE';
const FROM = 'ATLAS_FROM';
const LUFS = 'ATLAS_LUFS';
const TRUE_PEAK = 'ATLAS_TRUE_PEAK';
const TRACK_GAIN = 'R128_TRACK_GAIN';
const PEAKS = 'ATLAS_PEAKS';

const SOURCE_KEY = /^[0-9a-f]{64}$/;
const MAX_FROM_CHARS = 255;
const MAX_CODEC = 2 ** 31 - 1;
/** EBU R128's reference level, which `R128_TRACK_GAIN` (Q7.8 dB, RFC 7845) brings a track to. */
const REFERENCE_LUFS = -23;
const INT16_MIN = -32768;
const INT16_MAX = 32767;
/** Gated loudness never falls below -70 LUFS, and a peak of the smallest float sample is about -900 dB. */
const LUFS_RANGE: readonly [number, number] = [-200, 100];
const TRUE_PEAK_RANGE: readonly [number, number] = [-1000, 100];
/** Base64 of the peaks is 536 characters; a far longer value is no peaks of ours and is not decoded. */
const MAX_PEAKS_CHARS = 1024;
const HEADER_BYTES = 2 * MAX_PAGE_BYTES;
/** The longest packet one Ogg page holds whole: 255 lacing values, the last below 255. */
const MAX_TAGS_BYTES = MAX_SEGMENTS * 255 - 1;
/** Past the largest page, so the last page always lies whole inside. */
const TAIL_BYTES = 64 * 1024;

export interface AtlasCopyFacts {
  /** The sound key: SHA-256 of the source, 64 lowercase hex. */
  key: string;
  codec: number;
  /** The source file's name. */
  from: string;
  frames: number;
  channels: number;
  lufs: number;
  truePeakDb: number;
  peaks: Uint8Array<ArrayBuffer> | null;
}

export type CopyTags = Omit<AtlasCopyFacts, 'frames' | 'channels'>;

interface OpusHeader {
  headPacket: Uint8Array;
  tagsPage: OggPage;
  comments: string[];
}

function capped(text: string): string {
  return Array.from(text).slice(0, MAX_FROM_CHARS).join('');
}

function cleanFrom(from: string): string {
  return capped(from.replace(/[\r\n]+/g, ' '));
}

function isFact(value: number, [low, high]: readonly [number, number]): boolean {
  return value === -Infinity || (Number.isFinite(value) && value >= low && value <= high);
}

/** Atlas' comments for a copy. Throws on a fact `readAtlasCopy` would refuse, as a copy that read as foreign would be made again. */
export function atlasComments(facts: CopyTags): string[] {
  if (!SOURCE_KEY.test(facts.key)) throw new Error('A sound key is 64 lowercase hex digits.');
  if (!Number.isInteger(facts.codec) || facts.codec < 1 || facts.codec > MAX_CODEC) throw new Error('A codec version is a positive integer.');
  if (!isFact(facts.lufs, LUFS_RANGE) || !isFact(facts.truePeakDb, TRUE_PEAK_RANGE)) throw new Error('Loudness out of the range a copy may say.');
  const comments = [`${VTT}=${String(facts.codec)}`, `${SOURCE}=${facts.key}`, `${FROM}=${cleanFrom(facts.from)}`, `${LUFS}=${String(facts.lufs)}`, `${TRUE_PEAK}=${String(facts.truePeakDb)}`];
  if (Number.isFinite(facts.lufs)) {
    const gain = Math.min(INT16_MAX, Math.max(INT16_MIN, Math.round(256 * (REFERENCE_LUFS - facts.lufs))));
    comments.push(`${TRACK_GAIN}=${String(gain)}`);
  }
  if (facts.peaks) comments.push(`${PEAKS}=${toBase64(facts.peaks)}`);
  return comments;
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function onlyPacket(page: OggPage): Uint8Array | null {
  const { packets, tail } = packetsOfPage(page, null);
  return packets.length === 1 && !tail ? (packets[0] ?? null) : null;
}

/** The two header pages as Atlas writes them, each one packet; null for anything else. Throws on a damaged page. */
function readHeader(bytes: Uint8Array): OpusHeader | null {
  const headPage = readPage(bytes, 0);
  const tagsPage = headPage && readPage(bytes, headPage.end);
  if (!headPage || !tagsPage) return null;
  if (headPage.flags !== FLAG_FIRST || headPage.sequence !== 0 || tagsPage.flags !== 0 || tagsPage.sequence !== 1 || tagsPage.granule !== 0 || tagsPage.serial !== headPage.serial) return null;
  const headPacket = onlyPacket(headPage);
  const tagsPacket = onlyPacket(tagsPage);
  if (!headPacket || !tagsPacket || !isOpusHead(headPacket)) return null;
  const comments = readOpusComments(tagsPacket);
  return comments && { headPacket, tagsPage, comments };
}

async function rewritten(copy: Blob, comments: (held: string[]) => string[]): Promise<Blob> {
  const header = readHeader(await bytesOf(copy.slice(0, HEADER_BYTES)));
  if (!header) throw new Error('Not an Ogg Opus file whose comments lie on one page.');
  const written = comments(header.comments);
  if (written.length > MAX_COMMENTS) throw new Error('More comments than an Opus copy may carry.');
  const tags = writeOpusTags(written);
  const segments = lacingOf(tags.length);
  if (segments.length > MAX_SEGMENTS) throw new Error('The comments do not fit one Ogg page.');
  const { offset, end, serial } = header.tagsPage;
  const page = writePage({ flags: 0, granule: 0, serial, sequence: 1, segments, body: [tags] });
  return new Blob([copy.slice(0, offset), page, copy.slice(end)], { type: copy.type || 'audio/ogg' });
}

/** The copy with its comment header made of the comments `keep` keeps and then `add`. Refuses a file it cannot rewrite so. */
export function withComments(copy: Blob, keep: (comment: string) => boolean, add: readonly string[]): Promise<Blob> {
  return rewritten(copy, (held) => [...held.filter(keep), ...add]);
}

const isSeek = (comment: string): boolean => comment.startsWith(`${SEEK_COMMENT}=`);

const encoder = new TextEncoder();

/** The text's longest start that takes at most `room` bytes of UTF-8, cut between characters. */
function cutToBytes(text: string, room: number): string {
  let bytes = 0;
  let cut = '';
  for (const character of text) {
    bytes += encoder.encode(character).length;
    if (bytes > room) break;
    cut += character;
  }
  return cut;
}

/**
 * A copy as Atlas keeps it: its seek table and Atlas' facts. The file name gives way, so the header always
 * fits the one page it lies on, beside the largest seek table the writer makes.
 */
export function tagCopy(copy: Blob, tags: CopyTags): Promise<Blob> {
  return rewritten(copy, (held) => {
    const seek = held.filter(isSeek);
    const room = MAX_TAGS_BYTES - writeOpusTags([...seek, ...atlasComments({ ...tags, from: '' })]).length;
    return [...seek, ...atlasComments({ ...tags, from: cutToBytes(cleanFrom(tags.from), room) })];
  });
}

/** What players get: the header as 0.13.1 wrote it, the seek table alone. */
export function forPlayers(copy: Blob): Promise<Blob> {
  return withComments(copy, isSeek, []);
}

function valuesOf(comments: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const comment of comments) {
    const at = comment.indexOf('=');
    if (at <= 0) continue;
    const name = comment.slice(0, at);
    if (!values.has(name)) values.set(name, comment.slice(at + 1));
  }
  return values;
}

function numberIn(text: string | undefined, [low, high]: readonly [number, number], silence: boolean): number | null {
  if (text === undefined || text.trim() !== text || text === '') return null;
  const value = Number(text);
  if (silence && value === -Infinity) return value;
  return Number.isFinite(value) && value >= low && value <= high ? value : null;
}

function codecOf(text: string | undefined): number | null {
  const value = numberIn(text, [0, MAX_CODEC], false);
  return value !== null && Number.isInteger(value) ? value : null;
}

function peaksOf(text: string | undefined): Uint8Array<ArrayBuffer> | null {
  if (text === undefined || text.length > MAX_PEAKS_CHARS) return null;
  try {
    const peaks = fromBase64(text);
    return peaks.length === PEAK_BUCKETS ? peaks : null;
  } catch {
    return null;
  }
}

function fromOf(text: string | undefined): string {
  return text === undefined || /[\r\n]/.test(text) ? '' : capped(text);
}

function isCapture(bytes: Uint8Array, at: number): boolean {
  return bytes[at] === 0x4f && bytes[at + 1] === 0x67 && bytes[at + 2] === 0x67 && bytes[at + 3] === 0x53;
}

/** Where a page starting at `at` ends by its own header, or -1 where the header does not lie whole in the bytes. */
function pageEnd(bytes: Uint8Array, at: number): number {
  const count = bytes[at + 26];
  if (count === undefined || at + 27 + count > bytes.length) return -1;
  let end = at + 27 + count;
  for (let index = at + 27; index < at + 27 + count; index++) end += bytes[index] ?? 0;
  return end;
}

/** The granule of the stream's last page, which must end the bytes and the stream. */
function lastGranule(tail: Uint8Array, serial: number): number | null {
  for (let at = tail.length - 4; at >= 0; at--) {
    if (!isCapture(tail, at) || pageEnd(tail, at) !== tail.length) continue;
    let page: OggPage | null;
    try {
      page = readPage(tail, at);
    } catch (error) {
      if (error instanceof OggCorruptError) continue;
      throw error;
    }
    if (!page) continue;
    const ends = page.serial === serial && (page.flags & FLAG_LAST) !== 0;
    return ends && Number.isSafeInteger(page.granule) && page.granule >= 0 ? page.granule : null;
  }
  return null;
}

interface HeaderFacts {
  known: Omit<AtlasCopyFacts, 'frames'>;
  preSkip: number;
  serial: number;
}

function headerFacts(start: Uint8Array): HeaderFacts | null {
  const header = readHeader(start);
  if (!header) return null;
  const values = valuesOf(header.comments);
  const key = values.get(SOURCE);
  const codec = codecOf(values.get(VTT));
  const lufs = numberIn(values.get(LUFS), LUFS_RANGE, true);
  const truePeakDb = numberIn(values.get(TRUE_PEAK), TRUE_PEAK_RANGE, true);
  if (key === undefined || !SOURCE_KEY.test(key) || codec === null || lufs === null || truePeakDb === null) return null;
  const { channels, preSkip, mappingFamily } = readOpusHead(header.headPacket);
  if (mappingFamily !== 0 || (channels !== 1 && channels !== 2)) return null;
  const known = { key, codec, from: fromOf(values.get(FROM)), channels, lufs, truePeakDb, peaks: peaksOf(values.get(PEAKS)) };
  return { known, preSkip, serial: header.tagsPage.serial };
}

/**
 * What an Atlas-made copy says of itself, from its first pages and its last; null for any other file,
 * whatever its bytes hold. A file that cannot be read throws, so a read error never passes for a foreign file.
 */
export async function readAtlasCopy(file: Blob): Promise<AtlasCopyFacts | null> {
  const start = await bytesOf(file.slice(0, HEADER_BYTES));
  let facts: HeaderFacts | null;
  try {
    facts = headerFacts(start);
  } catch {
    return null;
  }
  if (!facts) return null;
  const tail = await bytesOf(file.slice(Math.max(0, file.size - TAIL_BYTES)));
  const granule = lastGranule(tail, facts.serial);
  if (granule === null || granule < facts.preSkip) return null;
  return { ...facts.known, frames: granule - facts.preSkip };
}
