/**
 * Default track titles from file names, the rule `docs/plans/2026-11-23-armarium-music.md` ("Default track titles")
 * writes down for Atlas and the Armarium's composer alike. Pure.
 */

/** What sets parts of a file name apart: a dash between spaces (`-`, `–`, `—`) or an underscore. */
const SEPARATOR = /\s+[-–—]\s+|_/gu;
/** A track number at the start and what sets it apart: `01 `, `1. `, `02 - `, `07_`, `3) `; never a decimal (`3.5`). */
const LEADING_NUMBER = /^[0-9]{1,3}(?:\s*[-–—)_]\s*|\.(?![0-9])\s*|\s+)/u;
const ONLY_DIGITS = /^[0-9]+$/u;

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

/** How long the start of `text` is that is `artist` and a separator, compared without case; 0 where it has none. */
function artistPrefixLength(text: string, artist: string): number {
  if (artist === '' || text.slice(0, artist.length).toLowerCase() !== artist.toLowerCase()) return 0;
  const after = text.slice(artist.length);
  const separator = /^(?:\s+[-–—]\s+|_)/u.exec(after);
  return separator ? artist.length + separator[0].length : 0;
}

/**
 * The titles a share starts its tracks with, from their file names without extension (`stems`). Two or more: what they
 * all share at the start up to and with its last separator goes, then each title's track number. One: an artist prefix
 * equal to `artist` goes, then the track number. A title that would be empty is its stem. Where the stems share a
 * first part, `artist` is empty and that part is neither a number nor the album's `name`, it is offered as the artist.
 */
export function defaultTrackTitles(stems: readonly string[], artist: string, name = ''): DefaultTitles {
  const clean = stems.map((stem) => stem.normalize('NFC').trim());
  const typed = artist.normalize('NFC').trim();
  if (clean.length < 2) {
    const stem = clean[0];
    if (stem === undefined) return { titles: [], artist: null };
    const title = withoutNumber(stem.slice(artistPrefixLength(stem, typed)).trim());
    return { titles: [title === '' ? stem : title], artist: null };
  }
  const { ends, firstStart } = separators(commonStart(clean));
  const cut = ends.at(-1) ?? 0;
  const titles = clean.map((stem) => {
    const title = withoutNumber(stem.slice(cut).trim());
    return title === '' ? stem : title;
  });
  const first = cut > 0 ? (clean[0] ?? '').slice(0, firstStart).trim() : '';
  const offered = typed === '' && first !== '' && !ONLY_DIGITS.test(first) && first.toLowerCase() !== name.normalize('NFC').trim().toLowerCase();
  return { titles, artist: offered ? first : null };
}
