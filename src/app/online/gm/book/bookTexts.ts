import { bookLine, bookText } from '../../protocol/index.ts';

/** The start of a text, four units a character at most, never ending inside a character of two units. */
const head = (value: string, max: number): string => value.slice(0, max * 4).replace(/[\ud800-\udbff]$/, '');

const firstCharacters = (text: string, count: number): string => [...text].slice(0, count).join('');

/** A text cleaned by `clean`, cut to `max` characters and cleaned again, since the cut may end where `clean` trims. */
function clipped(value: string | null | undefined, max: number, clean: (value: string, max: number) => string | null): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = clean(head(value, max), max * 4);
  return cleaned === null ? null : clean(firstCharacters(cleaned, max), max);
}

/**
 * A line as a book takes it (`bookLine`), shortened to `max` characters where it is longer, so a
 * long name is cut and not refused. Null for none, and when nothing that shows is left.
 */
export function clippedLine(value: string | null | undefined, max: number): string | null {
  return clipped(value, max, bookLine);
}

/** Several lines as a book takes them (`bookText`), shortened to `max` characters; null for none, and when nothing is left. */
export function clippedText(value: string | null | undefined, max: number): string | null {
  const text = clipped(value, max, bookText);
  return text === null || text === '' ? null : text;
}

/**
 * The opening of a book's text (`bookText`, already cleaned) of at most `max` characters: the whole
 * text where it is short enough, else cut at the last line break, or the last space, in its second
 * half, so no word is cut in two; a text without either is cut where the limit is.
 */
export function openingOf(text: string, max: number): string {
  const start = head(text, max);
  const characters = [...start];
  if (characters.length <= max && start.length === text.length) return text;
  const cut = characters.slice(0, max).join('');
  const half = cut.length / 2;
  const line = cut.lastIndexOf('\n');
  const space = cut.search(/\s\S*$/);
  const end = line >= half ? line : space >= half ? space : cut.length;
  return bookText(cut.slice(0, end), max) ?? '';
}
