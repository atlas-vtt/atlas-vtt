import type { PathMove } from './renamedPaths';

const ASCII_WORD = /[A-Za-z0-9]+/g;

/**
 * Whether a saved map's text can name a moved file or folder at all, read
 * without parsing it. A stored path matches a move in raw form, as a vault path
 * at or below a moved folder, or as an `app://` URL or absolute path whose tail
 * is the moved path (`normalizeImagePath`), so every form of it holds the last
 * segment of the move's old path. Letters and digits are never escaped by
 * `JSON.stringify` or a URL encoder, so each run of them in that segment stands
 * verbatim in any text that names the path: a text lacking one of them for
 * every move names none of the moves. A segment without such runs gives no
 * test, and every text may then name it.
 */
export function mayNameMoves(moves: readonly PathMove[]): (text: string) => boolean {
  const needles = moves.map(({ from }) => from.slice(from.lastIndexOf('/') + 1).match(ASCII_WORD) ?? []);
  return (text) => needles.some((words) => words.every((word) => text.includes(word)));
}
