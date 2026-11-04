import { shownLine } from '../protocol/index.ts';

/**
 * A text as players are sent it on one line: its white space collapsed, cut to `max` characters with
 * an ellipsis where it is longer, then cleaned as the protocol's parser cleans it, so it reads back
 * exactly; null where nothing of it shows.
 */
export function cutLine(value: string, max: number): string | null {
  const characters = [...value.replace(/\s+/g, ' ').trim()];
  return shownLine(characters.length <= max ? characters.join('') : `${characters.slice(0, max - 1).join('')}…`, max);
}
