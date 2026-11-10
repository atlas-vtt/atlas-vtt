import type { PlayerBookMessage } from './book.ts';
import { MAX_PLAYER_FRAME, PROTOCOL_VERSION, SHOWN, UNSEEN, UNSHOWN } from './relay.ts';

/** The longest line of a book in characters: a title, a name, a label. */
export const MAX_BOOK_TITLE = 80;

const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;

/**
 * One line of a book as shown: unshown characters removed, white space collapsed. Null when too
 * much is left, or nothing that shows unless `empty` allows that.
 */
export function bookLine(value: unknown, max: number, empty = false): string | null {
  if (typeof value !== 'string' || value.length > max * 4) return null;
  const line = value.replace(UNSHOWN, ' ').replace(UNSEEN, '').replace(/\s+/g, ' ').trim();
  if ([...line].length > max) return null;
  return line === '' ? (empty ? '' : null) : SHOWN.test(line) ? line : null;
}

/** Several lines of a book as shown: every line cleaned of unshown characters, its indent kept; null when too much is left. */
export function bookText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length > max * 4) return null;
  const lines = value.split(LINE_BREAK).map((line) => line.replace(UNSHOWN, ' ').replace(UNSEEN, '').trimEnd());
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  return [...text].length <= max ? text : null;
}

/** The bytes a text takes as UTF-8, a lone surrogate counted as the mark that replaces it. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Whether the relay takes a player's message: a long note in a script of many bytes a character may not fit one frame. */
export function fitsPlayerFrame(body: PlayerBookMessage): boolean {
  return utf8Length(JSON.stringify({ v: PROTOCOL_VERSION, t: 'send', body })) <= MAX_PLAYER_FRAME;
}
