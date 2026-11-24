/**
 * Default track titles from file names, the rule `docs/plans/2026-11-23-armarium-music.md` ("Default track titles")
 * writes down for Atlas and the Armarium's composer alike, and in Atlas a file's folder tags before it. Pure.
 */

import { stemOf } from '../../soundLibrary/soundPaths';
import { folderTagsOf } from '../../soundLibrary/soundTags';

/** What sets parts of a file name apart: a dash between spaces (`-`, `–`, `—`) or an underscore. */
const SEPARATOR = /\s+[-–—]\s+|_/gu;
/** A track number at the start and what sets it apart: `01 `, `1. `, `02 - `, `07_`, `3) `; never a decimal (`3.5`). */
const LEADING_NUMBER = /^[0-9]{1,3}(?:\s*[-–—)_]\s*|\.(?![0-9])\s*|\s+)/u;
const ONLY_DIGITS = /^[0-9]+$/u;
/** The first separator of a text. */
const FIRST_SEPARATOR = /\s+[-–—]\s+|_/u;

/** What two names are compared by: without case, NFC, trimmed. */
const nameKey = (text: string): string => text.normalize('NFC').trim().toLowerCase();

export interface DefaultTitles {
  /** One title per stem, in their order; none is empty. */
  titles: string[];
  /** The artist the file names share, where the field is empty and they share one; else null. */
  artist: string | null;
}

/** A title without the track number it starts with, where something is left after it. */
function withoutNumber(text: string): string {
  const rest = text.replace(LEADING_NUMBER, '').trim();
  return rest === '' ? text : rest;
}

/** The longest start every text shares. */
function commonStart(texts: readonly string[]): string {
  let shared = texts[0] ?? '';
  for (const text of texts) {
    let length = 0;
    while (length < shared.length && length < text.length && shared[length] === text[length]) length += 1;
    shared = shared.slice(0, length);
  }
  return shared;
}

/** Where each separator inside `text` ends, and where the first one begins. */
function separators(text: string): { ends: number[]; firstStart: number } {
  const ends: number[] = [];
  let firstStart = -1;
  for (const match of text.matchAll(SEPARATOR)) {
    if (firstStart < 0) firstStart = match.index;
    ends.push(match.index + match[0].length);
  }
  return { ends, firstStart };
}

/**
 * `stem` without its leading parts that are one of `folders` (the file's folder tags), each dropped only where
 * something is left after it, and the first part dropped; null where none was.
 */
function withoutFolderParts(stem: string, folders: readonly string[]): { rest: string; first: string | null } {
  const keys = new Set(folders.map(nameKey));
  let rest = stem;
  let first: string | null = null;
  for (let separator = FIRST_SEPARATOR.exec(rest); separator && keys.size > 0; separator = FIRST_SEPARATOR.exec(rest)) {
    const part = rest.slice(0, separator.index).trim();
    const after = rest.slice(separator.index + separator[0].length).trim();
    if (after === '' || !keys.has(nameKey(part))) break;
    first ??= part;
    rest = after;
  }
  return { rest, first };
}

/** How long the start of `text` is that is `artist` and a separator, compared without case; 0 where it has none. */
function artistPrefixLength(text: string, artist: string): number {
  if (artist === '' || text.slice(0, artist.length).toLowerCase() !== artist.toLowerCase()) return 0;
  const after = text.slice(artist.length);
  const separator = /^(?:\s+[-–—]\s+|_)/u.exec(after);
  return separator ? artist.length + separator[0].length : 0;
}

/**
 * The titles a share starts its tracks with, from their file names without extension (`stems`). In Atlas, each stem
 * first loses its leading parts that are its file's folder tags (`folders`, one list per stem; the website has none).
 * Two or more: what they all share at the start up to and with its last separator goes, then each title's track
 * number. One: an artist prefix equal to `artist` goes, then the track number. A title that would be empty is its
 * stem. Where `artist` is empty, the first folder tag a stem lost is offered as the artist, else the first part the
 * stems share; neither where it is only digits or the album's `name`.
 */
export function defaultTrackTitles(stems: readonly string[], artist: string, name = '', folders: readonly (readonly string[])[] = []): DefaultTitles {
  const clean = stems.map((stem) => stem.normalize('NFC').trim());
  const typed = artist.normalize('NFC').trim();
  const dropped = clean.map((stem, index) => withoutFolderParts(stem, folders[index] ?? []));
  const rests = dropped.map(({ rest }) => rest);
  const fromFolder = dropped.find(({ first }) => first !== null)?.first ?? null;
  const offer = (part: string): string | null => (typed === '' && part !== '' && !ONLY_DIGITS.test(part) && nameKey(part) !== nameKey(name) ? part : null);
  if (clean.length < 2) {
    const stem = clean[0];
    const rest = rests[0] ?? '';
    if (stem === undefined) return { titles: [], artist: null };
    const title = withoutNumber(rest.slice(artistPrefixLength(rest, typed)).trim());
    return { titles: [title === '' ? stem : title], artist: fromFolder === null ? null : offer(fromFolder) };
  }
  const { ends, firstStart } = separators(commonStart(rests));
  const cut = ends.at(-1) ?? 0;
  const titles = rests.map((rest, index) => {
    const title = withoutNumber(rest.slice(cut).trim());
    return title === '' ? clean[index] ?? rest : title;
  });
  const shared = cut > 0 ? (rests[0] ?? '').slice(0, firstStart).trim() : '';
  return { titles, artist: offer(fromFolder ?? shared) };
}

/** A file of the Sound library as titles read it: its name, and its path below the root, whose folders are its folder tags. */
export interface TitledFile {
  readonly name: string;
  readonly path: string;
}

/** `defaultTrackTitles` of files of the Sound library, with their folder tags. */
export function libraryTrackTitles(files: readonly TitledFile[], artist: string, name = ''): DefaultTitles {
  return defaultTrackTitles(files.map((file) => stemOf(file.name)), artist, name, files.map((file) => folderTagsOf(file.path)));
}
