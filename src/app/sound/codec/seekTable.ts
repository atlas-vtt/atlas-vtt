/** Where to start reading for a position: a page's byte offset and the position it begins at. */
export interface SeekEntry {
  /** From the first audio page, so that writing the table does not move what it points at. */
  byte: number;
  /** PCM position (pre-skip included) at which the page's first packet begins. */
  granule: number;
}

/** One entry per about five seconds, so a seek costs one range read. */
export const SEEK_INTERVAL_FRAMES = 5 * 48_000;
/** Only files this long get a table: up to here a sound is decoded whole. */
export const WHOLE_DECODE_FRAMES = 60 * 48_000;
export const SEEK_COMMENT = 'ATLAS_SEEK';

/** As base 36 deltas: a comment must stay text, and six hours of them is about 45 KB. */
export function encodeSeekTable(entries: readonly SeekEntry[]): string {
  let byte = 0;
  let granule = 0;
  const parts: string[] = [];
  for (const entry of entries) {
    parts.push(`${(entry.byte - byte).toString(36)}:${(entry.granule - granule).toString(36)}`);
    byte = entry.byte;
    granule = entry.granule;
  }
  return parts.join(',');
}

/** The table of a file, which may be anything: anything but a table that begins at the start and only moves on reads as none. */
export function decodeSeekTable(text: string): SeekEntry[] {
  let byte = 0;
  let granule = 0;
  const entries: SeekEntry[] = [];
  for (const part of text.split(',')) {
    const match = /^([0-9a-z]{1,11}):([0-9a-z]{1,11})$/.exec(part);
    if (!match) return [];
    const byteDelta = parseInt(match[1] ?? '', 36);
    const granuleDelta = parseInt(match[2] ?? '', 36);
    if (entries.length === 0 ? byteDelta !== 0 || granuleDelta !== 0 : byteDelta <= 0 || granuleDelta <= 0) return [];
    byte += byteDelta;
    granule += granuleDelta;
    if (!Number.isSafeInteger(byte) || !Number.isSafeInteger(granule)) return [];
    entries.push({ byte, granule });
  }
  return entries;
}

/** Index of the last entry at or before a position. */
export function seekIndexFor(entries: readonly SeekEntry[], granule: number): number {
  let low = 0;
  let high = entries.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((entries[middle]?.granule ?? 0) <= granule) low = middle;
    else high = middle - 1;
  }
  return low;
}
